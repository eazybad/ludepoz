// Step 4 — rent: the operator's Rent tab and the rent panel on a lease.
import { useEffect, useMemo, useState } from "react";
import { t } from "./bizCopy";
import {
  TZ_PROVIDERS,
  chargeBalance,
  errorMessage,
  getBizPublic,
  isChargeOpen,
  isOverdue,
  loadOperatorRooms,
  payCharge,
  recordPayment,
  refreshDeposit,
  setSandboxRent,
  subscribeDeposit,
  subscribeLeaseCharges,
  subscribeOperatorCharges,
  todayIso,
  waiveCharge,
} from "./bizService";

function tzs(n) {
  return `TZS ${Number(n || 0).toLocaleString("en-US")}`;
}

function fmtDate(iso, lang) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function displayStatus(charge, today) {
  return isOverdue(charge, today) ? "overdue" : charge.status;
}

export function useOperatorCharges(operatorId, enabled) {
  const [charges, setCharges] = useState(null);
  useEffect(() => {
    if (!operatorId || !enabled) { setCharges([]); return undefined; }
    return subscribeOperatorCharges(operatorId, setCharges, err => { console.error(err); setCharges([]); });
  }, [operatorId, enabled]);
  return charges;
}

// ─── One charge row (operator), with record-payment / waive ───
function ChargeRow({ charge, lang, today, manage }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("");
  const [form, setForm] = useState({ amount: String(chargeBalance(charge)), method: "cash", reference: "", paidOn: today });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const status = displayStatus(charge, today);

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try { await fn(); setMode(""); } catch (err) { setError(errorMessage(err, t(lang, "genericError"))); } finally { setBusy(false); }
  };

  return (
    <div className="biz-charge">
      <button type="button" className="biz-charge-main" onClick={() => setOpen(o => !o)}>
        <div className="biz-op-main">
          <div className="biz-op-name">{manage ? charge.tenantName : charge.label}</div>
          <div className="biz-small">{manage ? `${charge.label} · ${charge.roomLabel}` : t(lang, "dueOn", { date: fmtDate(charge.dueDate, lang) })}</div>
          {manage && <div className="biz-small">{t(lang, "dueOn", { date: fmtDate(charge.dueDate, lang) })}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 800 }}>{tzs(isChargeOpen(charge) ? chargeBalance(charge) : charge.amount)}</div>
          <span className={`biz-pill charge-${status}`}>{t(lang, `chargeStatus.${status}`)}</span>
        </div>
      </button>

      {open && (
        <div className="biz-charge-detail">
          <dl className="biz-kv">
            <dt>{t(lang, "amount")}</dt><dd>{tzs(charge.amount)}</dd>
            <dt>{t(lang, "paid")}</dt><dd>{tzs(charge.amountPaid)}</dd>
            {isChargeOpen(charge) && <><dt>{t(lang, "balance")}</dt><dd><strong>{tzs(chargeBalance(charge))}</strong></dd></>}
            {charge.status === "waived" && charge.waivedNote && <><dt>{t(lang, "waive")}</dt><dd>{charge.waivedNote}</dd></>}
          </dl>
          {(charge.payments || []).length > 0 && (
            <>
              <div className="biz-label" style={{ marginTop: 12 }}>{t(lang, "payments")}</div>
              <ul className="biz-list" style={{ listStyle: "none", paddingLeft: 0 }}>
                {charge.payments.map((p, i) => (
                  <li key={`${p.at}-${i}`}>
                    <strong>{tzs(p.amount)}</strong>
                    <span className="biz-small"> · {t(lang, `methods.${p.method}`) || p.method} · {fmtDate(String(p.paidOn || p.at || "").slice(0, 10), lang)}{p.reference ? ` · ${p.reference}` : ""}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {manage && isChargeOpen(charge) && (
            <div className="biz-actions" style={{ marginTop: 12 }}>
              <button type="button" className="biz-btn primary small" onClick={() => setMode(mode === "record" ? "" : "record")}>{t(lang, "recordPayment")}</button>
              <button type="button" className="biz-btn ghost small" onClick={() => setMode(mode === "waive" ? "" : "waive")}>{t(lang, "waive")}</button>
            </div>
          )}

          {mode === "record" && (
            <div style={{ marginTop: 10 }}>
              <div className="biz-row">
                <label className="biz-field"><span className="biz-label">{t(lang, "amount")}</span>
                  <input className="biz-input" inputMode="numeric" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value.replace(/[^\d]/g, "") }))} /></label>
                <label className="biz-field"><span className="biz-label">{t(lang, "method")}</span>
                  <select className="biz-select" value={form.method} onChange={e => setForm(p => ({ ...p, method: e.target.value }))}>
                    {["cash", "bank", "mobile_money", "other"].map(m => <option key={m} value={m}>{t(lang, `methods.${m}`)}</option>)}
                  </select></label>
              </div>
              <div className="biz-row">
                <label className="biz-field"><span className="biz-label">{t(lang, "reference")}</span>
                  <input className="biz-input" value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} maxLength={80} /></label>
                <label className="biz-field"><span className="biz-label">{t(lang, "paidOn")}</span>
                  <input className="biz-input" type="date" value={form.paidOn} onChange={e => setForm(p => ({ ...p, paidOn: e.target.value }))} /></label>
              </div>
              <div className="biz-actions">
                <button type="button" className="biz-btn primary" disabled={busy || !Number(form.amount)} onClick={() => run(() => recordPayment({ chargeId: charge.id, ...form, amount: Number(form.amount) }))}>{busy ? t(lang, "saving") : t(lang, "save")}</button>
              </div>
            </div>
          )}

          {mode === "waive" && (
            <div style={{ marginTop: 10 }}>
              <textarea className="biz-textarea" placeholder={t(lang, "waiveNote")} value={note} onChange={e => setNote(e.target.value)} maxLength={300} />
              <div className="biz-actions">
                <button type="button" className="biz-btn danger" disabled={busy} onClick={() => run(() => waiveCharge(charge.id, note))}>{t(lang, "waive")}</button>
              </div>
            </div>
          )}
          {error && <div className="biz-error">{error}</div>}
        </div>
      )}
    </div>
  );
}

// ─── Operator: Rent tab ───
export function OperatorRent({ operator, lang, charges, leases }) {
  const [filter, setFilter] = useState("overdue");
  const [roomsData, setRoomsData] = useState(null);
  const [toggling, setToggling] = useState(false);
  const today = todayIso();

  useEffect(() => {
    let cancelled = false;
    loadOperatorRooms(operator.id).then(d => { if (!cancelled) setRoomsData(d); }).catch(() => { if (!cancelled) setRoomsData({ properties: [], rooms: [] }); });
    return () => { cancelled = true; };
  }, [operator.id]);

  const stats = useMemo(() => {
    const list = charges || [];
    const month = today.slice(0, 7);
    const collected = list.reduce((sum, c) => sum + (c.payments || [])
      .filter(p => String(p.paidOn || p.at || "").slice(0, 7) === month)
      .reduce((s, p) => s + Number(p.amount || 0), 0), 0);
    const overdue = list.filter(c => isOverdue(c, today));
    const soon = list.filter(c => isChargeOpen(c) && c.dueDate >= today && c.dueDate <= addDaysIso(today, 7));
    return {
      collected,
      overdueBalance: overdue.reduce((s, c) => s + chargeBalance(c), 0),
      tenantsBehind: new Set(overdue.map(c => c.studentUid)).size,
      dueSoon: soon.reduce((s, c) => s + chargeBalance(c), 0),
    };
  }, [charges, today]);

  const occupancy = useMemo(() => {
    if (!roomsData) return null;
    const occupiedRooms = new Set((leases || [])
      .filter(l => l.status === "signed" && l.terms?.startDate <= today && l.terms?.endDate >= today && l.roomId)
      .map(l => l.roomId));
    const groups = roomsData.properties.map(p => ({ id: p.id, name: p.name || p.address || "—", rooms: roomsData.rooms.filter(r => r.propertyId === p.id) }));
    const loose = roomsData.rooms.filter(r => !r.propertyId || !roomsData.properties.some(p => p.id === r.propertyId));
    if (loose.length) groups.push({ id: "_other", name: t(lang, "otherRooms"), rooms: loose });
    return groups
      .filter(g => g.rooms.length)
      .map(g => ({ ...g, total: g.rooms.length, occupied: g.rooms.filter(r => occupiedRooms.has(r.id)).length }));
  }, [roomsData, leases, today, lang]);

  const filtered = (charges || []).filter(c => {
    if (filter === "overdue") return isOverdue(c, today);
    if (filter === "soon") return isChargeOpen(c) && c.dueDate >= today && c.dueDate <= addDaysIso(today, 14);
    if (filter === "open") return isChargeOpen(c);
    return c.status === "paid";
  });
  if (filter === "paid") filtered.reverse();

  const live = operator.status === "live" && operator.pawapay?.production?.connected;
  const canTest = !live && operator.pawapay?.sandbox?.connected;
  const sandboxOn = operator.settings?.sandboxRent === true;

  return (
    <>
      <h1 className="biz-h1">{t(lang, "rentTitle")}</h1>
      <p className="biz-muted">{t(lang, "rentIntro")}</p>

      <div className="biz-tiles">
        <div className="biz-tile"><span>{t(lang, "tileCollected")}</span><strong>{tzs(stats.collected)}</strong></div>
        <div className={`biz-tile ${stats.overdueBalance ? "bad" : ""}`}><span>{t(lang, "tileOutstanding")}</span><strong>{tzs(stats.overdueBalance)}</strong></div>
        <div className="biz-tile"><span>{t(lang, "tileOverdue")}</span><strong>{stats.tenantsBehind}</strong></div>
        <div className="biz-tile"><span>{t(lang, "tileDueSoon")}</span><strong>{tzs(stats.dueSoon)}</strong></div>
      </div>

      <div className="biz-card">
        <h2 className="biz-h2">{t(lang, "occupancyTitle")}</h2>
        {occupancy === null && <div className="biz-small">{t(lang, "loading")}</div>}
        {occupancy && occupancy.length === 0 && <p className="biz-small">{t(lang, "noRooms")}</p>}
        {occupancy && occupancy.map(g => (
          <div key={g.id} style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
              <strong>{g.name}</strong>
              <span className="biz-small">{t(lang, "occupied", { occupied: g.occupied, total: g.total })}</span>
            </div>
            <div className="biz-mini-bar" style={{ height: 8 }}><span style={{ width: `${g.total ? Math.round((g.occupied / g.total) * 100) : 0}%` }} /></div>
          </div>
        ))}
      </div>

      <div className="biz-card">
        <h2 className="biz-h2">{t(lang, "onlinePayTitle")}</h2>
        <p className="biz-small">{live ? t(lang, "onlinePayLive") : t(lang, "onlinePayOff")}</p>
        {canTest && (
          <label className="biz-check">
            <input type="checkbox" checked={sandboxOn} disabled={toggling} onChange={async () => { setToggling(true); try { await setSandboxRent(operator.id, !sandboxOn); } finally { setToggling(false); } }} />
            <span><strong>{t(lang, "sandboxRentLabel")}</strong><span className="biz-small" style={{ display: "block" }}>{t(lang, "sandboxRentHint")}</span></span>
          </label>
        )}
      </div>

      <div className="biz-tabs">
        {["overdue", "soon", "open", "paid"].map(f => (
          <button key={f} type="button" className={`biz-tab ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>{t(lang, `chargeFilters.${f}`)}</button>
        ))}
      </div>
      {charges === null && <div className="biz-center"><div><div className="biz-spinner" />{t(lang, "loading")}</div></div>}
      {charges && filtered.length === 0 && <div className="biz-card"><p className="biz-muted">{t(lang, "noCharges")}</p></div>}
      {filtered.map(c => <ChargeRow key={c.id} charge={c} lang={lang} today={today} manage />)}
    </>
  );
}

// ─── Student: pay one charge ───
function PayForm({ charge, lang, mode, onClose }) {
  const [form, setForm] = useState({ phone: "", provider: TZ_PROVIDERS[0].provider, amount: String(chargeBalance(charge)) });
  const [depositId, setDepositId] = useState("");
  const [deposit, setDeposit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!depositId) return undefined;
    const unsub = subscribeDeposit(depositId, setDeposit, () => {});
    // Also ask pawaPay directly in case callbacks aren't set up.
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 24) { clearInterval(timer); return; }
      refreshDeposit(depositId).catch(() => {});
    }, 5000);
    return () => { unsub(); clearInterval(timer); };
  }, [depositId]);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await payCharge({ chargeId: charge.id, phone: form.phone, provider: form.provider, amount: Number(form.amount) });
      setDepositId(res.depositId);
    } catch (err) {
      setError(errorMessage(err, t(lang, "genericError")));
    } finally {
      setBusy(false);
    }
  };

  const status = deposit?.status;
  if (depositId) {
    return (
      <div className={`biz-banner ${status === "paid" ? "success" : status === "failed" ? "danger" : "warning"}`}>
        <strong>{status === "paid" ? t(lang, "payDone") : status === "failed" ? t(lang, "payFailed") : t(lang, "payWaiting")}</strong>
        <div className="biz-small">{tzs(form.amount)}{deposit?.failureReason?.failureMessage ? ` · ${deposit.failureReason.failureMessage}` : ""}</div>
        <div className="biz-actions" style={{ marginTop: 8 }}>
          {status !== "paid" && status !== "failed" && <button type="button" className="biz-btn ghost small" onClick={() => refreshDeposit(depositId).catch(() => {})}>{t(lang, "checkStatus")}</button>}
          {(status === "paid" || status === "failed") && <button type="button" className="biz-btn ghost small" onClick={onClose}>OK</button>}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={send} style={{ marginTop: 10 }}>
      {mode === "test" && <div className="biz-banner warning" style={{ marginTop: 0 }}>{t(lang, "payTestBadge")}</div>}
      <div className="biz-row">
        <label className="biz-field"><span className="biz-label">{t(lang, "payPhone")}</span>
          <input className="biz-input" type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="07XX XXX XXX" required autoComplete="tel" /></label>
        <label className="biz-field"><span className="biz-label">{t(lang, "payNetwork")}</span>
          <select className="biz-select" value={form.provider} onChange={e => setForm(p => ({ ...p, provider: e.target.value }))}>
            {TZ_PROVIDERS.map(p => <option key={p.provider} value={p.provider}>{p.displayName}</option>)}
          </select></label>
      </div>
      <label className="biz-field"><span className="biz-label">{t(lang, "payAmount")}</span>
        <input className="biz-input" inputMode="numeric" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value.replace(/[^\d]/g, "") }))} required /></label>
      {error && <div className="biz-error">{error}</div>}
      <div className="biz-actions">
        <button className="biz-btn primary" disabled={busy}>{busy ? t(lang, "sending") : t(lang, "paySend")}</button>
        <button type="button" className="biz-btn ghost" onClick={onClose}>{t(lang, "cancel")}</button>
      </div>
    </form>
  );
}

// ─── On the lease page: the rent schedule (both parties; students can pay) ───
export function LeaseCharges({ lease, user, lang, isStudent }) {
  const [charges, setCharges] = useState(null);
  const [mode, setMode] = useState(undefined); // "live" | "test" | "" once loaded
  const [paying, setPaying] = useState("");
  const today = todayIso();

  useEffect(() => {
    if (!lease?.id || !user) return undefined;
    return subscribeLeaseCharges(lease.id, user.uid, isStudent ? "student" : "operator", setCharges, () => setCharges([]));
  }, [lease?.id, user, isStudent]);

  useEffect(() => {
    if (!isStudent || !lease?.operatorId) return;
    getBizPublic(lease.operatorId).then(p => setMode(p?.onlinePayments || "")).catch(() => setMode(""));
  }, [isStudent, lease?.operatorId]);

  // Links from the student app end in #rent — scroll there once it renders.
  const hasCharges = Boolean(charges && charges.length);
  useEffect(() => {
    if (hasCharges && window.location.hash === "#rent") {
      document.getElementById("rent")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [hasCharges]);

  if (!charges || charges.length === 0) return null;
  const outstanding = charges.filter(isChargeOpen).reduce((s, c) => s + chargeBalance(c), 0);

  return (
    <div className="biz-card biz-noprint" id="rent">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <h2 className="biz-h2">{t(lang, "rentScheduleTitle")}</h2>
        <span className="biz-small">{t(lang, "totalDue")}: <strong>{tzs(outstanding)}</strong></span>
      </div>
      {isStudent && mode === "" && <div className="biz-banner info">{t(lang, "payNotAvailable")}</div>}
      {charges.map(c => (
        <div key={c.id}>
          <ChargeRow charge={c} lang={lang} today={today} manage={false} />
          {isStudent && mode && isChargeOpen(c) && (
            paying === c.id
              ? <PayForm charge={c} lang={lang} mode={mode} onClose={() => setPaying("")} />
              : <div className="biz-actions" style={{ marginTop: 0, marginBottom: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="biz-btn primary small" onClick={() => setPaying(c.id)}>📱 {t(lang, "payNow")} {tzs(chargeBalance(c))}</button>
                </div>
          )}
        </div>
      ))}
    </div>
  );
}
