// Kampasika Biz · Overview — the operator's home once they're set up.
// One screen that answers "how is my hostel doing?": occupancy, money in,
// who is behind, what needs a decision. Works on a phone (one column) and
// spreads into a grid on a PC.
import { useEffect, useMemo, useState } from "react";
import { t } from "./bizCopy";
import {
  chargeBalance,
  computeSteps,
  isChargeOpen,
  isOverdue,
  loadOperatorRooms,
  pendingClaim,
  progressPercent,
  todayIso,
} from "./bizService";

const tzs = (n) => `TZS ${Math.round(Number(n || 0)).toLocaleString("en-US")}`;

function compact(n) {
  const v = Number(n || 0);
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}K`;
  return String(Math.round(v));
}

// Clean axis maximum (1, 2, 2.5, 5 × 10^n) above the largest value.
function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * p;
}

function monthKey(iso) { return String(iso || "").slice(0, 7); }

function lastMonths(n) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i -= 1) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`, date: m });
  }
  return out;
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);
}

function fmtDay(iso, lang) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-GB", { day: "numeric", month: "short" });
}

function greeting(lang) {
  const h = new Date().getHours();
  if (lang === "sw") return h < 12 ? "Habari za asubuhi" : h < 16 ? "Habari za mchana" : "Habari za jioni";
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// ── Column chart: rent collected per month (single series) ──
function CollectedChart({ months, lang }) {
  const [hover, setHover] = useState(-1);
  const max = niceMax(Math.max(...months.map(m => m.total), 0));
  const ticks = [0, max / 2, max];
  const last = months.length - 1;
  return (
    <div className="bd-chart" role="img" aria-label={t(lang, "dashChartAria")}>
      <div className="bd-chart-plot">
        {ticks.map(v => (
          <div key={v} className="bd-grid" style={{ bottom: `${(v / max) * 100}%` }}>
            <span>{compact(v)}</span>
          </div>
        ))}
        <div className="bd-cols">
          {months.map((m, i) => (
            <div
              key={m.key}
              className={`bd-col ${hover === i ? "on" : ""}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(-1)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(-1)}
              tabIndex={0}
            >
              {(i === last || hover === i) && m.total > 0 && (
                <div className="bd-col-label" style={{ bottom: `calc(${(m.total / max) * 100}% + 6px)` }}>{compact(m.total)}</div>
              )}
              <div className="bd-bar" style={{ height: `${(m.total / max) * 100}%` }} />
              {hover === i && (
                <div className="bd-tip">
                  <strong>{m.date.toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-GB", { month: "long", year: "numeric" })}</strong>
                  <span>{tzs(m.total)}</span>
                  <span>{t(lang, "dashPayments", { count: m.count })}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="bd-xaxis">
        {months.map(m => <span key={m.key}>{m.date.toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-GB", { month: "short" })}</span>)}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone, bar, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={`bd-kpi ${tone || ""}`} onClick={onClick}>
      <span className="bd-kpi-label">{label}</span>
      <strong className="bd-kpi-value">{value}</strong>
      {bar != null && <span className="bd-meter"><span style={{ width: `${Math.min(100, Math.max(0, bar))}%` }} /></span>}
      {sub && <span className="bd-kpi-sub">{sub}</span>}
    </Tag>
  );
}

export function BizOverview({ operator, lang, apps, leases, charges, onNavigate }) {
  const [roomsData, setRoomsData] = useState(null);
  const today = todayIso();

  useEffect(() => {
    let cancelled = false;
    loadOperatorRooms(operator.id)
      .then(d => { if (!cancelled) setRoomsData(d); })
      .catch(() => { if (!cancelled) setRoomsData({ properties: [], rooms: [] }); });
    return () => { cancelled = true; };
  }, [operator.id]);

  const data = useMemo(() => {
    const list = charges || [];
    const thisMonth = today.slice(0, 7);
    const prev = lastMonths(2)[0].key;

    const payments = [];
    list.forEach(c => (c.payments || []).forEach(p => payments.push({ ...p, tenantName: c.tenantName, roomLabel: c.roomLabel, label: c.label, day: String(p.paidOn || p.at || "").slice(0, 10) })));
    payments.sort((a, b) => b.day.localeCompare(a.day));

    const months = lastMonths(6).map(m => {
      const ps = payments.filter(p => monthKey(p.day) === m.key);
      return { ...m, total: ps.reduce((s, p) => s + Number(p.amount || 0), 0), count: ps.length };
    });
    const collected = months.find(m => m.key === thisMonth)?.total || 0;
    // Compare with the same point last month (the current month isn't over yet).
    const dayOfMonth = today.slice(8, 10);
    const collectedPrev = payments
      .filter(p => monthKey(p.day) === prev && p.day.slice(8, 10) <= dayOfMonth)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const overdue = list.filter(c => isOverdue(c, today));
    const byTenant = new Map();
    overdue.forEach(c => {
      const k = c.leaseId || c.studentUid;
      const cur = byTenant.get(k) || { name: c.tenantName, room: c.roomLabel, balance: 0, oldest: c.dueDate, count: 0 };
      cur.balance += chargeBalance(c);
      cur.count += 1;
      if (c.dueDate < cur.oldest) cur.oldest = c.dueDate;
      byTenant.set(k, cur);
    });
    const behind = [...byTenant.values()].sort((a, b) => b.balance - a.balance);

    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const in7Iso = `${in7.getFullYear()}-${String(in7.getMonth() + 1).padStart(2, "0")}-${String(in7.getDate()).padStart(2, "0")}`;
    const dueSoon = list.filter(c => isChargeOpen(c) && c.dueDate >= today && c.dueDate <= in7Iso);

    const newApps = (apps || []).filter(a => a.status === "submitted");
    const claims = list.filter(c => pendingClaim(c)).map(c => ({ charge: c, claim: pendingClaim(c) }));
    const waiting = (leases || []).filter(l => ["sent", "pending_fee"].includes(l.status));
    return {
      payments, months, collected, collectedPrev, behind,
      overdueTotal: behind.reduce((s, b) => s + b.balance, 0),
      dueSoonTotal: dueSoon.reduce((s, c) => s + chargeBalance(c), 0), dueSoonCount: dueSoon.length,
      newApps, waiting, claims,
    };
  }, [charges, apps, leases, today]);

  const occupancy = useMemo(() => {
    if (!roomsData) return null;
    const occupied = new Set((leases || [])
      .filter(l => l.status === "signed" && l.terms?.startDate <= today && l.terms?.endDate >= today && l.roomId)
      .map(l => l.roomId));
    const groups = roomsData.properties.map(p => ({ id: p.id, name: p.name || p.address || "—", rooms: roomsData.rooms.filter(r => r.propertyId === p.id) }));
    const loose = roomsData.rooms.filter(r => !r.propertyId || !roomsData.properties.some(p => p.id === r.propertyId));
    if (loose.length) groups.push({ id: "_other", name: t(lang, "otherRooms"), rooms: loose });
    const rows = groups.filter(g => g.rooms.length).map(g => ({ ...g, total: g.rooms.length, occupied: g.rooms.filter(r => occupied.has(r.id)).length }));
    const total = rows.reduce((s, g) => s + g.total, 0);
    const occ = rows.reduce((s, g) => s + g.occupied, 0);
    return { rows, total, occupied: occ, pct: total ? Math.round((occ / total) * 100) : 0 };
  }, [roomsData, leases, today, lang]);

  const steps = computeSteps(operator);
  const setupPct = progressPercent(steps);
  const firstName = String(operator.profile?.contactName || "").split(" ")[0];
  const delta = data.collectedPrev ? Math.round(((data.collected - data.collectedPrev) / data.collectedPrev) * 100) : null;
  const attentionCount = data.claims.length + data.behind.length + data.newApps.length + data.waiting.length;

  return (
    <div className="bd">
      <div className="bd-head">
        <div>
          <div className="biz-small">{new Date().toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="biz-h1" style={{ margin: "4px 0 2px" }}>{greeting(lang)}{firstName ? `, ${firstName}` : ""}</h1>
          <p className="biz-muted">{operator.profile?.businessName} · {t(lang, "dashSubtitle")}</p>
        </div>
        <div className="bd-head-actions">
          <button type="button" className="biz-btn ghost small" onClick={() => onNavigate("/biz/applications")}>📝 {t(lang, "dashActApplications")}</button>
          <button type="button" className="biz-btn primary small" onClick={() => onNavigate("/biz/rent")}>💵 {t(lang, "dashActRecord")}</button>
        </div>
      </div>

      {operator.status !== "live" && (
        <button type="button" className="bd-setup" onClick={() => onNavigate("/biz/setup")}>
          <div style={{ flex: 1 }}>
            <strong>{t(lang, "dashSetupTitle")}</strong>
            <div className="biz-small">{t(lang, "dashSetupBody")}</div>
            <span className="bd-meter" style={{ marginTop: 8 }}><span style={{ width: `${setupPct}%` }} /></span>
          </div>
          <span className="bd-setup-pct">{setupPct}%</span>
          <span className="biz-chevron">›</span>
        </button>
      )}

      <div className="bd-kpis">
        <Kpi
          label={t(lang, "dashKpiOccupancy")}
          value={occupancy ? `${occupancy.pct}%` : "…"}
          bar={occupancy ? occupancy.pct : 0}
          sub={occupancy ? t(lang, "dashKpiOccupancySub", { occupied: occupancy.occupied, total: occupancy.total }) : ""}
        />
        <Kpi
          label={t(lang, "tileCollected")}
          value={tzs(data.collected)}
          sub={delta == null ? t(lang, "dashKpiCollectedSub") : t(lang, delta >= 0 ? "dashKpiUp" : "dashKpiDown", { pct: Math.abs(delta) })}
          onClick={() => onNavigate("/biz/rent")}
        />
        <Kpi
          label={t(lang, "tileOutstanding")}
          value={tzs(data.overdueTotal)}
          tone={data.overdueTotal > 0 ? "bad" : "good"}
          sub={data.behind.length ? `⚠ ${t(lang, "dashKpiBehind", { count: data.behind.length })}` : `✓ ${t(lang, "dashAllPaid")}`}
          onClick={() => onNavigate("/biz/rent")}
        />
        <Kpi
          label={t(lang, "dashKpiApplications")}
          value={String(data.newApps.length)}
          sub={data.dueSoonTotal > 0 ? t(lang, "dashKpiDueSoon", { amount: tzs(data.dueSoonTotal) }) : t(lang, "dashKpiNothingDue")}
          onClick={() => onNavigate("/biz/applications")}
        />
      </div>

      <div className="bd-grid2">
        <section className="biz-card bd-card">
          <div className="bd-card-head">
            <h2 className="biz-h2">{t(lang, "dashChartTitle")}</h2>
            <span className="biz-small">{t(lang, "dashChartSub")}</span>
          </div>
          <CollectedChart months={data.months} lang={lang} />
        </section>

        <section className="biz-card bd-card">
          <div className="bd-card-head">
            <h2 className="biz-h2">{t(lang, "occupancyTitle")}</h2>
            {occupancy && <span className="biz-small">{t(lang, "dashKpiOccupancySub", { occupied: occupancy.occupied, total: occupancy.total })}</span>}
          </div>
          {occupancy === null && <div className="biz-small">{t(lang, "loading")}</div>}
          {occupancy && occupancy.rows.length === 0 && <p className="biz-small">{t(lang, "noRooms")}</p>}
          {occupancy && occupancy.rows.map(g => (
            <div key={g.id} className="bd-occ" title={`${g.name}: ${g.occupied}/${g.total}`}>
              <div className="bd-occ-top">
                <strong>{g.name}</strong>
                <span>{g.occupied} / {g.total}</span>
              </div>
              <span className="bd-meter lg"><span style={{ width: `${g.total ? (g.occupied / g.total) * 100 : 0}%` }} /></span>
              <div className="biz-small">{t(lang, "dashEmptyRooms", { count: g.total - g.occupied })}</div>
            </div>
          ))}
        </section>
      </div>

      <div className="bd-grid2">
        <section className="biz-card bd-card">
          <div className="bd-card-head">
            <h2 className="biz-h2">{t(lang, "dashAttention")}</h2>
            {attentionCount > 0 && <span className="biz-count">{attentionCount}</span>}
          </div>
          {attentionCount === 0 && <p className="biz-muted">✓ {t(lang, "dashAllClear")}</p>}
          <ul className="bd-list">
            {data.claims.map(({ charge, claim }) => (
              <li key={`c-${charge.id}`}>
                <button type="button" onClick={() => onNavigate("/biz/rent")}>
                  <span className="bd-dot good" aria-hidden="true">?</span>
                  <span className="bd-list-main">
                    <strong>{charge.tenantName}</strong>
                    <span className="biz-small">{t(lang, "dashClaim", { code: claim.reference })}</span>
                  </span>
                  <span className="bd-list-end"><strong>{tzs(claim.amount)}</strong><span className="biz-pill charge-partial">{t(lang, "chargeFilters.confirm")}</span></span>
                </button>
              </li>
            ))}
            {data.behind.map(b => (
              <li key={`o-${b.name}-${b.room}`}>
                <button type="button" onClick={() => onNavigate("/biz/rent")}>
                  <span className="bd-dot bad" aria-hidden="true">!</span>
                  <span className="bd-list-main">
                    <strong>{b.name}</strong>
                    <span className="biz-small">{b.room} · {t(lang, "dashDaysLate", { days: daysBetween(b.oldest, today) })}</span>
                  </span>
                  <span className="bd-list-end"><strong>{tzs(b.balance)}</strong><span className="biz-pill charge-overdue">{t(lang, "chargeStatus.overdue")}</span></span>
                </button>
              </li>
            ))}
            {data.newApps.map(a => (
              <li key={`a-${a.id}`}>
                <button type="button" onClick={() => onNavigate(`/biz/applications/${a.id}`)}>
                  <span className="bd-dot info" aria-hidden="true">✎</span>
                  <span className="bd-list-main">
                    <strong>{a.applicant?.name}</strong>
                    <span className="biz-small">{t(lang, "dashNewApp")} · {[a.room?.roomNumber && `Room ${a.room.roomNumber}`, a.room?.propertyName].filter(Boolean).join(", ")}</span>
                  </span>
                  <span className="bd-list-end"><span className="biz-pill app-submitted">{t(lang, "appStatus.submitted")}</span></span>
                </button>
              </li>
            ))}
            {data.waiting.map(l => (
              <li key={`l-${l.id}`}>
                <button type="button" onClick={() => onNavigate(`/biz/lease/${l.id}`)}>
                  <span className="bd-dot warn" aria-hidden="true">✍</span>
                  <span className="bd-list-main">
                    <strong>{l.parties?.tenant?.name}</strong>
                    <span className="biz-small">{l.room?.label}</span>
                  </span>
                  <span className="bd-list-end"><span className={`biz-pill lease-${l.status}`}>{t(lang, `leaseStatus.${l.status}`)}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="biz-card bd-card">
          <div className="bd-card-head">
            <h2 className="biz-h2">{t(lang, "dashRecent")}</h2>
            <button type="button" className="bd-link" onClick={() => onNavigate("/biz/rent")}>{t(lang, "dashSeeAll")} ›</button>
          </div>
          {data.payments.length === 0 && <p className="biz-muted">{t(lang, "dashNoPayments")}</p>}
          <ul className="bd-list">
            {data.payments.slice(0, 7).map((p, i) => (
              <li key={`${p.reference}-${i}`}>
                <div className="bd-row">
                  <span className="bd-dot good" aria-hidden="true">✓</span>
                  <span className="bd-list-main">
                    <strong>{p.tenantName}</strong>
                    <span className="biz-small">{p.label} · {t(lang, `methods.${p.method}`) || p.method}</span>
                  </span>
                  <span className="bd-list-end"><strong>{tzs(p.amount)}</strong><span className="biz-small">{fmtDay(p.day, lang)}</span></span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
