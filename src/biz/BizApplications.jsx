// Step 2 — the operator's inbox of room applications from students.
import { useEffect, useMemo, useState } from "react";
import { t } from "./bizCopy";
import {
  APPLICATION_FILTERS,
  applicationTime,
  applicationsUnlocked,
  decideApplication,
  errorMessage,
  setAcceptingApplications,
  subscribeOperatorApplications,
} from "./bizService";

const ROOM_TYPE_NAMES = { single: "Single Room", master: "Master", apartment: "Apartment 1BR+" };

function formatWhen(ms, lang) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(lang === "sw" ? "sw-TZ" : undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatDate(value, lang) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(lang === "sw" ? "sw-TZ" : undefined, { day: "numeric", month: "short", year: "numeric" });
}

function roomTitle(app) {
  const r = app.room || {};
  const type = ROOM_TYPE_NAMES[r.roomType] || r.roomType || "Room";
  return [r.roomNumber ? `#${r.roomNumber}` : "", type, r.propertyName || r.location].filter(Boolean).join(" · ");
}

function localPhone(phone) {
  const p = String(phone || "");
  return p.startsWith("255") ? `0${p.slice(3)}` : p;
}

export function useOperatorApplications(operator) {
  const [apps, setApps] = useState(null);
  const [error, setError] = useState("");
  const unlocked = applicationsUnlocked(operator);
  useEffect(() => {
    if (!operator?.id || !unlocked) { setApps([]); return undefined; }
    return subscribeOperatorApplications(operator.id, setApps, err => { console.error(err); setError(err.message); setApps([]); });
  }, [operator?.id, unlocked]);
  return { apps, error };
}

function AcceptingToggle({ operator, lang }) {
  const accepting = operator.settings?.acceptingApplications !== false;
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try { await setAcceptingApplications(operator.id, !accepting); } finally { setBusy(false); }
  };
  return (
    <label className="biz-check" style={{ marginTop: 0, alignItems: "center" }}>
      <input type="checkbox" checked={accepting} disabled={busy} onChange={toggle} />
      <span>
        <strong>{accepting ? t(lang, "acceptingOn") : t(lang, "acceptingOff")}</strong>
        <span className="biz-small" style={{ display: "block" }}>{t(lang, "acceptingHint")}</span>
      </span>
    </label>
  );
}

export function ApplicationsList({ operator, lang, apps, error, onOpen }) {
  const [filter, setFilter] = useState("new");
  const counts = useMemo(() => {
    const c = {};
    Object.entries(APPLICATION_FILTERS).forEach(([key, statuses]) => {
      c[key] = (apps || []).filter(a => statuses.includes(a.status)).length;
    });
    return c;
  }, [apps]);

  if (!applicationsUnlocked(operator)) {
    return (
      <>
        <h1 className="biz-h1">{t(lang, "applicationsTitle")}</h1>
        <div className="biz-banner info">{t(lang, "applicationsLocked")}</div>
      </>
    );
  }

  const shown = (apps || []).filter(a => APPLICATION_FILTERS[filter].includes(a.status));

  return (
    <>
      <h1 className="biz-h1">{t(lang, "applicationsTitle")}</h1>
      <p className="biz-muted">{t(lang, "applicationsIntro")}</p>
      <div className="biz-card"><AcceptingToggle operator={operator} lang={lang} /></div>

      <div className="biz-tabs">
        {Object.keys(APPLICATION_FILTERS).map(key => (
          <button key={key} type="button" className={`biz-tab ${filter === key ? "on" : ""}`} onClick={() => setFilter(key)}>
            {t(lang, `appFilters.${key}`)} · {counts[key] || 0}
          </button>
        ))}
      </div>

      {error && <div className="biz-error">{error}</div>}
      {apps === null && <div className="biz-center"><div><div className="biz-spinner" />{t(lang, "loading")}</div></div>}
      {apps && shown.length === 0 && <div className="biz-card"><p className="biz-muted">{t(lang, "appEmpty")}</p></div>}

      {shown.map(app => (
        <button key={app.id} type="button" className="biz-op-row" onClick={() => onOpen(app.id)}>
          <div className="biz-op-main">
            <div className="biz-op-name">{app.applicant?.name || "—"}</div>
            <div className="biz-small">{roomTitle(app)}</div>
            <div className="biz-small">
              {app.applicant?.university || ""}{app.applicant?.moveInDate ? ` · ${t(lang, "appMoveIn")} ${formatDate(app.applicant.moveInDate, lang)}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span className={`biz-pill app-${app.status}`}>{t(lang, `appStatus.${app.status}`)}</span>
            <div className="biz-small" style={{ marginTop: 6 }}>{formatWhen(applicationTime(app), lang)}</div>
          </div>
        </button>
      ))}
    </>
  );
}

export function ApplicationDetail({ lang, apps, applicationId, onNavigate }) {
  const app = (apps || []).find(a => a.id === applicationId);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (apps === null) return <div className="biz-center"><div><div className="biz-spinner" />{t(lang, "loading")}</div></div>;
  if (!app) return <div className="biz-card"><p className="biz-muted">{t(lang, "appEmpty")}</p></div>;

  const a = app.applicant || {};
  const phone = localPhone(a.phone);

  const decide = async (decision) => {
    setBusy(decision);
    setError("");
    setDone(false);
    try {
      await decideApplication(app.id, decision, note);
      setNote("");
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, t(lang, "genericError")));
    } finally {
      setBusy("");
    }
  };

  const canShortlist = app.status === "submitted";
  const canApprove = ["submitted", "shortlisted"].includes(app.status);
  const canReject = ["submitted", "shortlisted", "approved"].includes(app.status);

  return (
    <>
      <div className="biz-hero">
        <div className="biz-hero-top">
          <h1 className="biz-hero-name">{a.name || "—"}</h1>
          <span className={`biz-pill app-${app.status}`}>{t(lang, `appStatus.${app.status}`)}</span>
        </div>
        <p className="biz-muted" style={{ marginTop: 8 }}>{roomTitle(app)}{app.room?.price ? ` · TZS ${Number(app.room.price).toLocaleString()}` : ""}</p>
      </div>

      {phone && (
        <div className="biz-actions">
          <a className="biz-btn primary" href={`tel:${phone}`}>📞 {t(lang, "appCall")}</a>
          <a className="biz-btn ghost" href={`https://wa.me/${a.phone}`} target="_blank" rel="noopener noreferrer">💬 {t(lang, "appWhatsApp")}</a>
        </div>
      )}

      <div className="biz-card">
        <dl className="biz-kv">
          <dt>{t(lang, "appPhone")}</dt><dd>{phone || "—"}</dd>
          <dt>{t(lang, "appUniversity")}</dt><dd>{a.university || "—"}</dd>
          <dt>{t(lang, "appCourse")}</dt><dd>{[a.course, a.yearOfStudy && `Yr ${a.yearOfStudy}`].filter(Boolean).join(" · ") || "—"}</dd>
          <dt>{t(lang, "appReg")}</dt><dd>{a.regNumber || "—"}</dd>
          <dt>{t(lang, "appMoveIn")}</dt><dd>{formatDate(a.moveInDate, lang)}</dd>
          <dt>{t(lang, "appStay")}</dt><dd>{t(lang, `appStayOptions.${a.duration || "other"}`)}</dd>
          <dt>{t(lang, "appApplied")}</dt><dd>{formatWhen(applicationTime(app), lang)}</dd>
        </dl>
        {a.message && (
          <>
            <div className="biz-label" style={{ marginTop: 14 }}>{t(lang, "appMessage")}</div>
            <p className="biz-muted" style={{ whiteSpace: "pre-wrap" }}>{a.message}</p>
          </>
        )}
      </div>

      {(canShortlist || canApprove || canReject) && (
        <div className="biz-card">
          <textarea className="biz-textarea" placeholder={t(lang, "appNotePlaceholder")} value={note} onChange={e => setNote(e.target.value)} maxLength={500} />
          <div className="biz-actions">
            {canApprove && <button type="button" className="biz-btn primary" disabled={!!busy} onClick={() => decide("approve")}>{busy === "approve" ? "…" : `✓ ${t(lang, "appApprove")}`}</button>}
            {canShortlist && <button type="button" className="biz-btn ghost" disabled={!!busy} onClick={() => decide("shortlist")}>{busy === "shortlist" ? "…" : t(lang, "appShortlist")}</button>}
            {canReject && <button type="button" className="biz-btn danger" disabled={!!busy} onClick={() => decide("reject")}>{busy === "reject" ? "…" : t(lang, "appReject")}</button>}
          </div>
          {done && <div className="biz-ok">{t(lang, "appDecided")}</div>}
          {error && <div className="biz-error">{error}</div>}
        </div>
      )}

      {app.status === "approved" && (
        <div className="biz-card">
          <h2 className="biz-h2">{t(lang, "applicationLease")}</h2>
          {app.lease && ["sent", "signed"].includes(app.lease.status) ? (
            <div className="biz-actions" style={{ marginTop: 8, alignItems: "center" }}>
              <span className={`biz-pill lease-${app.lease.status}`}>{t(lang, `leaseStatus.${app.lease.status}`)}</span>
              <button type="button" className="biz-btn ghost small" onClick={() => onNavigate(`/biz/lease/${app.lease.id}`)}>{t(lang, "viewLease")} ›</button>
            </div>
          ) : (
            <>
              {app.lease && <p className="biz-small">{t(lang, `leaseStatus.${app.lease.status}`)} · <button type="button" className="biz-btn ghost small" onClick={() => onNavigate(`/biz/lease/${app.lease.id}`)}>{t(lang, "viewLease")}</button></p>}
              <div className="biz-actions">
                <button type="button" className="biz-btn dark" onClick={() => onNavigate(`/biz/applications/${app.id}/lease`)}>📄 {t(lang, "createLease")}</button>
              </div>
            </>
          )}
        </div>
      )}

      {Array.isArray(app.history) && app.history.length > 0 && (
        <div className="biz-card">
          <h2 className="biz-h2">{t(lang, "appHistory")}</h2>
          <ul className="biz-list" style={{ listStyle: "none", paddingLeft: 0 }}>
            {app.history.map((h, i) => (
              <li key={`${h.at}-${i}`}>
                <strong>{t(lang, `appStatus.${h.status}`)}</strong>
                <span className="biz-small"> · {formatWhen(new Date(h.at).getTime(), lang)}{h.note ? ` · “${h.note}”` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
