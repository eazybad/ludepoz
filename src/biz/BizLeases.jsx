// Step 3 — leases: template editor, create-from-application, list, and the
// lease page both parties open (/biz/lease/<id>).
import { useEffect, useMemo, useState } from "react";
import { t } from "./bizCopy";
import {
  cancelLease,
  createLease,
  declineLease,
  errorMessage,
  resetLeaseTemplate,
  saveLeaseDefaults,
  saveLeaseTemplate,
  signLease,
  subscribeLease,
  subscribeOperatorLeases,
} from "./bizService";
import { LEASE_PLACEHOLDERS, renderText, templateFor } from "./bizLeaseTemplate";
import { LeaseCharges } from "./BizRent";

const PERIODS = ["month", "semester", "year"];
const LEASE_FILTERS = { sent: ["sent"], signed: ["signed"], closed: ["declined", "cancelled"] };
const ROOM_TYPE_WORDS = {
  en: { single: "Single room", master: "Master room", apartment: "Apartment" },
  sw: { single: "Chumba kimoja", master: "Chumba cha master", apartment: "Nyumba" },
};
const PERIOD_WORDS = {
  en: { month: "month", semester: "semester", year: "year" },
  sw: { month: "mwezi", semester: "semester", year: "mwaka" },
};

function fmtMoney(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString("en-US") : "";
}

function fmtIsoDate(iso, lang) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function fmtWhen(value, lang) {
  const d = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(lang === "sw" ? "sw-TZ" : "en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function addMonths(iso, months) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Hook: operator's leases ───
export function useOperatorLeases(operatorId, enabled) {
  const [leases, setLeases] = useState(null);
  useEffect(() => {
    if (!operatorId || !enabled) { setLeases([]); return undefined; }
    return subscribeOperatorLeases(operatorId, setLeases, err => { console.error(err); setLeases([]); });
  }, [operatorId, enabled]);
  return leases;
}

// ─── Leases list ───
export function LeasesList({ operator, lang, leases, onNavigate }) {
  const [filter, setFilter] = useState("sent");
  const counts = useMemo(() => {
    const c = {};
    Object.entries(LEASE_FILTERS).forEach(([k, statuses]) => { c[k] = (leases || []).filter(l => statuses.includes(l.status)).length; });
    return c;
  }, [leases]);
  const custom = Boolean(operator.leaseTemplates?.en?.clauses?.length || operator.leaseTemplates?.sw?.clauses?.length);
  const shown = (leases || []).filter(l => LEASE_FILTERS[filter].includes(l.status));

  return (
    <>
      <h1 className="biz-h1">{t(lang, "leasesTitle")}</h1>
      <p className="biz-muted">{t(lang, "leasesIntro")}</p>

      <button type="button" className="biz-op-row" onClick={() => onNavigate("/biz/lease-template")}>
        <div className="biz-op-main">
          <div className="biz-op-name">📄 {t(lang, "templateCardTitle")}</div>
          <div className="biz-small">{custom ? t(lang, "templateCustom") : t(lang, "templateStandard")} · {t(lang, "templateCardBody")}</div>
        </div>
        <span className="biz-chevron">›</span>
      </button>

      <div className="biz-tabs">
        {Object.keys(LEASE_FILTERS).map(k => (
          <button key={k} type="button" className={`biz-tab ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>
            {t(lang, `leaseFilters.${k}`)} · {counts[k] || 0}
          </button>
        ))}
      </div>

      {leases === null && <div className="biz-center"><div><div className="biz-spinner" />{t(lang, "loading")}</div></div>}
      {leases && shown.length === 0 && <div className="biz-card"><p className="biz-muted">{t(lang, "leasesEmpty")}</p></div>}
      {shown.map(l => (
        <button key={l.id} type="button" className="biz-op-row" onClick={() => onNavigate(`/biz/lease/${l.id}`)}>
          <div className="biz-op-main">
            <div className="biz-op-name">{l.parties?.tenant?.name || "—"}</div>
            <div className="biz-small">{l.room?.label || ""}</div>
            <div className="biz-small">{l.reference} · TZS {fmtMoney(l.terms?.rent)} / {PERIOD_WORDS[lang]?.[l.terms?.rentPeriod] || l.terms?.rentPeriod}</div>
          </div>
          <span className={`biz-pill lease-${l.status}`}>{t(lang, `leaseStatus.${l.status}`)}</span>
        </button>
      ))}
    </>
  );
}

// ─── Template editor ───
export function LeaseTemplateEditor({ operator, lang, onDone }) {
  const [language, setLanguage] = useState(lang === "sw" ? "sw" : "en");
  const initial = templateFor(operator, language);
  const [clauses, setClauses] = useState(initial.clauses);
  const [defaults, setDefaults] = useState(initial.defaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Switching language loads that language's template.
  useEffect(() => {
    setClauses(templateFor(operator, language).clauses);
    setSaved(false);
    // Only on language switch — not on every operator snapshot, which would wipe edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const update = (i, key, value) => setClauses(prev => prev.map((c, j) => (j === i ? { ...c, [key]: value } : c)));
  const move = (i, dir) => setClauses(prev => {
    const next = [...prev];
    const j = i + dir;
    if (j < 0 || j >= next.length) return prev;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const remove = (i) => setClauses(prev => prev.filter((_, j) => j !== i));
  const add = () => setClauses(prev => [...prev, { title: `${prev.length + 1}. `, body: "" }]);

  const save = async () => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const cleaned = clauses.filter(c => c.title.trim() || c.body.trim());
      if (!cleaned.length) throw new Error(t(lang, "genericError"));
      await saveLeaseTemplate(operator.id, language, cleaned);
      await saveLeaseDefaults(operator.id, defaults);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err, t(lang, "genericError")));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError("");
    try {
      await resetLeaseTemplate(operator.id, language);
      setClauses(templateFor({ ...operator, leaseTemplates: {} }, language).clauses);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err, t(lang, "genericError")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="biz-h1">{t(lang, "templateTitle")}</h1>
      <p className="biz-muted">{t(lang, "templateIntro")}</p>
      <div className="biz-banner warning">{t(lang, "templateLegalNote")}</div>

      <div className="biz-card">
        <span className="biz-label">{t(lang, "templateLanguage")}</span>
        <div className="biz-tabs" style={{ marginTop: 0 }}>
          {["en", "sw"].map(l => (
            <button key={l} type="button" className={`biz-tab ${language === l ? "on" : ""}`} onClick={() => setLanguage(l)}>{t(lang, `languages.${l}`)}</button>
          ))}
        </div>
      </div>

      <div className="biz-card">
        <h2 className="biz-h2">{t(lang, "defaultsTitle")}</h2>
        <p className="biz-small">{t(lang, "defaultsIntro")}</p>
        <TermsFields lang={lang} language={language} value={defaults} onChange={setDefaults} withRent={false} withDates={false} />
      </div>

      {clauses.map((c, i) => (
        <div className="biz-card" key={i}>
          <label className="biz-field" style={{ marginTop: 0 }}>
            <span className="biz-label">{t(lang, "clauseTitle")}</span>
            <input className="biz-input" value={c.title} onChange={e => update(i, "title", e.target.value)} maxLength={120} />
          </label>
          <label className="biz-field">
            <span className="biz-label">{t(lang, "clauseBody")}</span>
            <textarea className="biz-textarea" style={{ minHeight: 110 }} value={c.body} onChange={e => update(i, "body", e.target.value)} maxLength={4000} />
          </label>
          <div className="biz-actions" style={{ marginTop: 10 }}>
            <button type="button" className="biz-btn ghost small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">{t(lang, "moveUp")}</button>
            <button type="button" className="biz-btn ghost small" onClick={() => move(i, 1)} disabled={i === clauses.length - 1} aria-label="Move down">{t(lang, "moveDown")}</button>
            <button type="button" className="biz-btn danger small" onClick={() => remove(i)}>{t(lang, "removeClause")}</button>
          </div>
        </div>
      ))}

      <div className="biz-actions">
        <button type="button" className="biz-btn ghost" onClick={add}>{t(lang, "addClause")}</button>
      </div>

      <div className="biz-card">
        <h2 className="biz-h2">{t(lang, "placeholdersTitle")}</h2>
        <dl className="biz-kv">
          {LEASE_PLACEHOLDERS.map(p => (
            <div key={p.key} style={{ display: "contents" }}>
              <dt><code>{`{{${p.key}}}`}</code></dt>
              <dd>{lang === "sw" ? p.sw : p.en}</dd>
            </div>
          ))}
        </dl>
      </div>

      {error && <div className="biz-error">{error}</div>}
      {saved && <div className="biz-ok">✓ {t(lang, "saved")}</div>}
      <div className="biz-actions">
        <button type="button" className="biz-btn primary block" disabled={busy} onClick={save}>{busy ? t(lang, "saving") : t(lang, "save")}</button>
        <button type="button" className="biz-btn ghost small" disabled={busy} onClick={reset}>{t(lang, "resetTemplate")}</button>
        {onDone && <button type="button" className="biz-btn ghost small" onClick={onDone}>{t(lang, "back")}</button>}
      </div>
    </>
  );
}

// ─── Shared terms fields ───
function TermsFields({ lang, language, value, onChange, withRent = true, withDates = true }) {
  const set = (key) => (e) => onChange(prev => ({ ...prev, [key]: e.target.value }));
  const digits = (key) => (e) => onChange(prev => ({ ...prev, [key]: e.target.value.replace(/[^\d]/g, "") }));
  return (
    <>
      {withRent && (
        <div className="biz-row">
          <label className="biz-field">
            <span className="biz-label">{t(lang, "rent")}</span>
            <input className="biz-input" inputMode="numeric" value={value.rent ?? ""} onChange={digits("rent")} required />
          </label>
          <label className="biz-field">
            <span className="biz-label">{t(lang, "rentPeriod")}</span>
            <select className="biz-select" value={value.rentPeriod} onChange={set("rentPeriod")}>
              {PERIODS.map(p => <option key={p} value={p}>{t(lang, `rentPeriods.${p}`)}</option>)}
            </select>
          </label>
        </div>
      )}
      {!withRent && (
        <label className="biz-field">
          <span className="biz-label">{t(lang, "rentPeriod")}</span>
          <select className="biz-select" value={value.rentPeriod} onChange={set("rentPeriod")}>
            {PERIODS.map(p => <option key={p} value={p}>{t(lang, `rentPeriods.${p}`)}</option>)}
          </select>
        </label>
      )}
      <div className="biz-row">
        <label className="biz-field">
          <span className="biz-label">{t(lang, "deposit")}</span>
          <input className="biz-input" inputMode="numeric" value={value.deposit ?? ""} onChange={digits("deposit")} />
        </label>
        <label className="biz-field">
          <span className="biz-label">{t(lang, "dueDay")}</span>
          <input className="biz-input" inputMode="numeric" value={value.dueDay ?? ""} onChange={digits("dueDay")} maxLength={2} />
        </label>
      </div>
      {withDates && (
        <div className="biz-row">
          <label className="biz-field">
            <span className="biz-label">{t(lang, "startDate")}</span>
            <input className="biz-input" type="date" value={value.startDate || ""} onChange={set("startDate")} required />
          </label>
          <label className="biz-field">
            <span className="biz-label">{t(lang, "endDate")}</span>
            <input className="biz-input" type="date" value={value.endDate || ""} onChange={set("endDate")} required />
          </label>
        </div>
      )}
      <label className="biz-field">
        <span className="biz-label">{t(lang, "noticeDays")}</span>
        <input className="biz-input" inputMode="numeric" value={value.noticeDays ?? ""} onChange={digits("noticeDays")} maxLength={3} />
      </label>
      <label className="biz-field">
        <span className="biz-label">{t(lang, "utilities")}</span>
        <input className="biz-input" value={value.utilities || ""} onChange={set("utilities")} maxLength={300} placeholder={language === "sw" ? "yamejumuishwa kwenye kodi" : "included in the rent"} />
        <span className="biz-small" style={{ display: "block", marginTop: 5 }}>{t(lang, language === "sw" ? "utilitiesHintSw" : "utilitiesHint")}</span>
      </label>
    </>
  );
}

// ─── Create lease from an approved application ───
export function CreateLeaseForm({ operator, lang, application, onCreated }) {
  const [language, setLanguage] = useState(lang === "sw" ? "sw" : "en");
  const template = templateFor(operator, language);
  const moveIn = application?.applicant?.moveInDate || todayIso();
  const [terms, setTerms] = useState(() => {
    const d = templateFor(operator, language).defaults;
    return {
      rent: application?.room?.price ? String(application.room.price) : "",
      rentPeriod: d.rentPeriod || "month",
      deposit: d.deposit ?? "",
      dueDay: d.dueDay ?? 5,
      noticeDays: d.noticeDays ?? 30,
      utilities: d.utilities || "",
      startDate: moveIn,
      endDate: addMonths(moveIn, application?.applicant?.duration === "academic_year" ? 10 : application?.applicant?.duration === "monthly" ? 1 : 5),
      extraTerms: "",
    };
  });
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!application) return <div className="biz-card"><p className="biz-muted">{t(lang, "appEmpty")}</p></div>;

  const a = application.applicant || {};
  const r = application.room || {};
  // Preview values mirror what the server fills in.
  const previewValues = {
    businessName: operator.profile?.businessName || "",
    landlordContact: operator.profile?.contactName || "",
    studentName: a.name || "",
    university: a.university || "",
    regNumber: a.regNumber || "—",
    roomLabel: [r.roomNumber ? `${language === "sw" ? "Chumba namba" : "Room"} ${r.roomNumber}` : "", ROOM_TYPE_WORDS[language][r.roomType] || r.roomType || (language === "sw" ? "Chumba" : "Room"), r.propertyName].filter(Boolean).join(", "),
    location: r.location || r.propertyName || "",
    rent: fmtMoney(terms.rent),
    rentPeriod: PERIOD_WORDS[language][terms.rentPeriod],
    deposit: fmtMoney(terms.deposit || 0),
    startDate: fmtIsoDate(terms.startDate, language),
    endDate: fmtIsoDate(terms.endDate, language),
    dueDay: String(terms.dueDay),
    noticeDays: String(terms.noticeDays),
    utilities: terms.utilities || (language === "sw" ? "yamejumuishwa kwenye kodi" : "included in the rent"),
    extraTerms: terms.extraTerms || (language === "sw" ? "Hakuna." : "None."),
  };

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await createLease(application.id, {
        language,
        rent: Number(terms.rent),
        rentPeriod: terms.rentPeriod,
        deposit: Number(terms.deposit || 0),
        dueDay: Number(terms.dueDay),
        noticeDays: Number(terms.noticeDays),
        utilities: terms.utilities,
        startDate: terms.startDate,
        endDate: terms.endDate,
        extraTerms: terms.extraTerms,
      }, template.clauses);
      onCreated(res.leaseId);
    } catch (err) {
      setError(errorMessage(err, t(lang, "genericError")));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send}>
      <h1 className="biz-h1">{t(lang, "createLeaseTitle")}</h1>
      <p className="biz-muted">{t(lang, "leaseFor", { name: a.name || "" })} · {previewValues.roomLabel}</p>
      <p className="biz-small" style={{ marginTop: 6 }}>{t(lang, "createLeaseIntro")}</p>

      <div className="biz-card">
        <span className="biz-label">{t(lang, "templateLanguage")}</span>
        <div className="biz-tabs" style={{ marginTop: 0 }}>
          {["en", "sw"].map(l => (
            <button key={l} type="button" className={`biz-tab ${language === l ? "on" : ""}`} onClick={() => setLanguage(l)}>{t(lang, `languages.${l}`)}</button>
          ))}
        </div>
        <p className="biz-small" style={{ marginTop: 8 }}>{template.custom ? t(lang, "templateCustom") : t(lang, "templateStandard")}</p>
      </div>

      <div className="biz-card">
        <TermsFields lang={lang} language={language} value={terms} onChange={setTerms} />
        <label className="biz-field">
          <span className="biz-label">{t(lang, "extraTerms")} <span className="opt">({t(lang, "optional")})</span></span>
          <textarea className="biz-textarea" value={terms.extraTerms} onChange={e => setTerms(p => ({ ...p, extraTerms: e.target.value }))} maxLength={2000} />
        </label>
      </div>

      <div className="biz-actions">
        <button type="button" className="biz-btn ghost" onClick={() => setShowPreview(v => !v)}>{t(lang, "preview")} {showPreview ? "▲" : "▼"}</button>
      </div>
      {showPreview && (
        <div className="biz-lease-doc" style={{ marginTop: 12 }}>
          {template.clauses.map((c, i) => (
            <section key={i}>
              <h3>{renderText(c.title, previewValues)}</h3>
              <p>{renderText(c.body, previewValues)}</p>
            </section>
          ))}
        </div>
      )}

      {error && <div className="biz-error">{error}</div>}
      <div className="biz-actions">
        <button className="biz-btn primary block" disabled={busy}>{busy ? t(lang, "sending") : t(lang, "sendLease")}</button>
      </div>
    </form>
  );
}

// ─── The lease page (operator and student) ───
export function LeasePage({ lang, leaseId, user, isAdmin }) {
  const [lease, setLease] = useState(undefined);
  const [typedName, setTypedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState(""); // "decline" | "cancel"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => subscribeLease(
    leaseId,
    setLease,
    () => setLease(null)
  ), [leaseId]);

  if (lease === undefined) return <div className="biz-center"><div><div className="biz-spinner" />{t(lang, "loading")}</div></div>;
  if (lease === null) return <div className="biz-card"><p className="biz-muted">{t(lang, "leaseNotFound")}</p></div>;

  const L = lease.language || "en";
  const isStudent = user?.uid === lease.studentUid;
  const isOperator = user?.uid === lease.operatorId || isAdmin;
  const landlord = lease.parties?.landlord || {};
  const tenant = lease.parties?.tenant || {};
  const tm = lease.terms || {};

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setMode("");
      setReason("");
    } catch (err) {
      setError(errorMessage(err, t(lang, "genericError")));
    } finally {
      setBusy(false);
    }
  };

  const banner = {
    signed: ["success", "signedBanner"],
    declined: ["danger", "declinedBanner"],
    cancelled: ["danger", "cancelledBanner"],
    sent: isOperator ? ["warning", "waitingBanner"] : null,
  }[lease.status];

  return (
    <>
      <div className="biz-noprint">
        {banner && <div className={`biz-banner ${banner[0]}`}>{t(lang, banner[1])}{lease.status === "declined" && lease.declineReason ? ` — “${lease.declineReason}”` : ""}</div>}
      </div>

      <article className="biz-lease-doc" style={{ marginTop: 14 }}>
        <header className="biz-lease-head">
          <div className="biz-small">{t(L, "leaseRef", { ref: lease.reference })}</div>
          <h1>{L === "sw" ? "Mkataba wa Upangaji" : "Tenancy Agreement"}</h1>
          <span className={`biz-pill lease-${lease.status} biz-noprint`}>{t(lang, `leaseStatus.${lease.status}`)}</span>
        </header>

        <div className="biz-lease-parties">
          <div>
            <div className="biz-label">{t(L, "landlord")}</div>
            <strong>{landlord.businessName}</strong>
            <div className="biz-small">{[landlord.contactName, landlord.tin && `TIN ${landlord.tin}`, landlord.brelaNumber && `BRELA ${landlord.brelaNumber}`].filter(Boolean).join(" · ")}</div>
          </div>
          <div>
            <div className="biz-label">{t(L, "tenant")}</div>
            <strong>{tenant.name}</strong>
            <div className="biz-small">{[tenant.university, tenant.regNumber].filter(Boolean).join(" · ")}</div>
          </div>
        </div>

        <dl className="biz-kv biz-lease-summary">
          <dt>{L === "sw" ? "Chumba" : "Room"}</dt><dd>{lease.room?.label}{lease.room?.location ? ` · ${lease.room.location}` : ""}</dd>
          <dt>{L === "sw" ? "Kodi" : "Rent"}</dt><dd>TZS {fmtMoney(tm.rent)} {t(L, "perPeriod", { period: PERIOD_WORDS[L][tm.rentPeriod] || tm.rentPeriod })}</dd>
          <dt>{L === "sw" ? "Amana" : "Deposit"}</dt><dd>TZS {fmtMoney(tm.deposit)}</dd>
          <dt>{L === "sw" ? "Muda" : "Term"}</dt><dd>{fmtIsoDate(tm.startDate, L)} – {fmtIsoDate(tm.endDate, L)}</dd>
        </dl>

        {(lease.clauses || []).map((c, i) => (
          <section key={i}>
            <h3>{c.title}</h3>
            <p>{c.body}</p>
          </section>
        ))}

        <footer className="biz-lease-sigs">
          <div>
            <div className="biz-label">{t(L, "landlord")}</div>
            <div className="biz-sig">{lease.signatures?.landlord?.name || landlord.businessName}</div>
            <div className="biz-small">{t(L, "issuedBy", { name: landlord.businessName, date: fmtWhen(lease.signatures?.landlord?.issuedAt, L) })}</div>
          </div>
          <div>
            <div className="biz-label">{t(L, "tenant")}</div>
            {lease.signatures?.tenant ? (
              <>
                <div className="biz-sig">{lease.signatures.tenant.typedName}</div>
                <div className="biz-small">{t(L, "signedBy", { name: lease.signatures.tenant.typedName, date: fmtWhen(lease.signatures.tenant.signedAt, L) })}</div>
                <div className="biz-small">{t(L, "signatureDetails", { hash: String(lease.signatures.tenant.contentHash || "").slice(0, 12) })}</div>
              </>
            ) : <div className="biz-sig empty">—</div>}
          </div>
        </footer>
      </article>

      {lease.status === "signed" && <LeaseCharges lease={lease} user={user} lang={lang} isStudent={isStudent} />}

      <div className="biz-noprint">
        {isStudent && lease.status === "sent" && (
          <div className="biz-card">
            <h2 className="biz-h2">{t(lang, "signTitle")}</h2>
            <p className="biz-muted">{t(lang, "signIntro")}</p>
            <label className="biz-check">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
              <span>{t(lang, "agreeBox")}</span>
            </label>
            <label className="biz-field">
              <span className="biz-label">{t(lang, "typeName")}</span>
              <input className="biz-input biz-sig-input" value={typedName} onChange={e => setTypedName(e.target.value)} placeholder={tenant.name} maxLength={80} autoComplete="name" />
            </label>
            <div className="biz-actions">
              <button type="button" className="biz-btn primary" disabled={busy || !agreed || typedName.trim().length < 3} onClick={() => run(() => signLease(lease.id, typedName.trim(), lease.contentHash))}>
                {busy && mode === "" ? t(lang, "signing") : `✍️ ${t(lang, "signButton")}`}
              </button>
              <button type="button" className="biz-btn ghost" disabled={busy} onClick={() => setMode(mode === "decline" ? "" : "decline")}>{t(lang, "declineButton")}</button>
            </div>
            {mode === "decline" && (
              <>
                <textarea className="biz-textarea" style={{ marginTop: 12 }} placeholder={t(lang, "declineReason")} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} />
                <div className="biz-actions">
                  <button type="button" className="biz-btn danger" disabled={busy} onClick={() => run(() => declineLease(lease.id, reason))}>{t(lang, "declineConfirm")}</button>
                </div>
              </>
            )}
          </div>
        )}

        {isOperator && lease.status === "sent" && (
          <div className="biz-card">
            {mode === "cancel" ? (
              <>
                <textarea className="biz-textarea" placeholder={t(lang, "cancelReason")} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} />
                <div className="biz-actions">
                  <button type="button" className="biz-btn danger" disabled={busy} onClick={() => run(() => cancelLease(lease.id, reason))}>{t(lang, "cancelLease")}</button>
                  <button type="button" className="biz-btn ghost" onClick={() => setMode("")}>{t(lang, "cancel")}</button>
                </div>
              </>
            ) : (
              <button type="button" className="biz-btn danger small" onClick={() => setMode("cancel")}>{t(lang, "cancelLease")}</button>
            )}
          </div>
        )}

        {error && <div className="biz-error">{error}</div>}
        <div className="biz-actions">
          <button type="button" className="biz-btn ghost" onClick={() => window.print()}>🖨️ {t(lang, "printLease")}</button>
          {isStudent && <a className="biz-btn ghost" href="/">← {t(lang, "backToKampasika")}</a>}
        </div>
      </div>
    </>
  );
}
