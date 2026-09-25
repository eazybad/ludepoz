import { useEffect, useMemo, useState } from "react";
import { t } from "./bizCopy";
import {
  ONBOARDING_STEPS,
  adminReview,
  computeSteps,
  documentUrl,
  errorMessage,
  progressPercent,
  requiredDocumentTypes,
  subscribeAllOperators,
} from "./bizService";
import { ConnectPanel } from "./BizSteps";

const FILTERS = ["all", "in_review", "needs_changes", "draft", "live", "suspended"];

function formatDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function BizAdminList({ lang, onOpen }) {
  const [operators, setOperators] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("in_review");

  useEffect(() => subscribeAllOperators(setOperators, err => setError(errorMessage(err, t(lang, "genericError")))), [lang]);

  const counts = useMemo(() => {
    const c = { all: operators?.length || 0 };
    (operators || []).forEach(op => { c[op.status || "draft"] = (c[op.status || "draft"] || 0) + 1; });
    return c;
  }, [operators]);

  const shown = (operators || []).filter(op => filter === "all" || (op.status || "draft") === filter);

  return (
    <>
      <h1 className="biz-h1">{t(lang, "adminTitle")}</h1>
      <div className="biz-tabs">
        {FILTERS.map(f => (
          <button key={f} type="button" className={`biz-tab ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? t(lang, "adminFilterAll") : t(lang, `statusLabel.${f}`)} · {counts[f] || 0}
          </button>
        ))}
      </div>
      {error && <div className="biz-error">{error}</div>}
      {operators === null && !error && <div className="biz-center"><div><div className="biz-spinner" />{t(lang, "loading")}</div></div>}
      {operators && shown.length === 0 && <div className="biz-card"><p className="biz-muted">{t(lang, "adminEmpty")}</p></div>}
      {shown.map(op => {
        const pct = progressPercent(computeSteps(op));
        const status = op.status || "draft";
        return (
          <button key={op.id} type="button" className="biz-op-row" onClick={() => onOpen(op.id)}>
            <div className="biz-op-main">
              <div className="biz-op-name">{op.profile?.businessName || op.id}</div>
              <div className="biz-small">
                {op.profile?.contactName || "—"} · {op.profile?.contactPhone || "—"} · {op.profile?.area || op.profile?.region || ""}
              </div>
              <div className="biz-mini-bar"><span style={{ width: `${pct}%` }} /></div>
            </div>
            <span className={`biz-pill ${status}`}>{t(lang, `statusLabel.${status}`)}</span>
          </button>
        );
      })}
    </>
  );
}

function DocLink({ label, file }) {
  const [error, setError] = useState("");
  if (!file?.path) return <li>{label}: <span className="biz-small">—</span></li>;
  const open = async () => {
    try {
      window.open(await documentUrl(file.path), "_blank", "noopener");
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <li>
      {label}:{" "}
      <button type="button" className="biz-btn ghost small" onClick={open}>📎 {file.name || "open"}</button>
      {error && <span className="biz-error"> {error}</span>}
    </li>
  );
}

export function BizAdminDetail({ lang, operatorId, onBack }) {
  const [operators, setOperators] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  // Re-uses the list subscription so the detail updates live too.
  useEffect(() => subscribeAllOperators(setOperators, err => setError(err.message)), []);
  const op = operators?.find(o => o.id === operatorId);

  if (!operators) return <div className="biz-center"><div><div className="biz-spinner" />{t(lang, "loading")}</div></div>;
  if (!op) return <div className="biz-card"><p className="biz-muted">Not found.</p><button className="biz-btn ghost small" onClick={onBack}>{t(lang, "back")}</button></div>;

  const steps = computeSteps(op);
  const status = op.status || "draft";
  const p = op.profile || {};
  const s = op.settlement || {};
  const a = op.pawapayApplication || {};

  const act = async (action) => {
    setBusy(action);
    setError("");
    try {
      await adminReview(op.id, action, note);
      setNote("");
    } catch (err) {
      setError(errorMessage(err, t(lang, "genericError")));
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <div className="biz-hero">
        <div className="biz-hero-top">
          <h1 className="biz-hero-name">{p.businessName || op.id}</h1>
          <span className={`biz-pill ${status}`}>{t(lang, `statusLabel.${status}`)}</span>
        </div>
        <div className="biz-progress"><span style={{ width: `${progressPercent(steps)}%` }} /></div>
        <p className="biz-muted">{t(lang, "lastUpdated")} {formatDate(op.updatedAt)} · UID {op.id}</p>
      </div>

      <div className="biz-card">
        <h2 className="biz-h2">{t(lang, "checklistTitle")}</h2>
        <dl className="biz-kv">
          {ONBOARDING_STEPS.map(id => (
            <div key={id} style={{ display: "contents" }}>
              <dt>{t(lang, `steps.${id}.title`)}</dt>
              <dd><span className={`biz-step-state ${steps[id]}`}>{t(lang, `stepState.${steps[id]}`)}</span></dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="biz-card">
        <h2 className="biz-h2">{t(lang, "steps.profile.title")}</h2>
        <dl className="biz-kv">
          <dt>{t(lang, "businessType")}</dt><dd>{p.businessType ? t(lang, `businessTypes.${p.businessType}`) : "—"}</dd>
          <dt>{t(lang, "brelaNumber")}</dt><dd>{p.brelaNumber || "—"}</dd>
          <dt>{t(lang, "tin")}</dt><dd>{p.tin || "—"}</dd>
          <dt>{t(lang, "contactName")}</dt><dd>{p.contactName || "—"}</dd>
          <dt>{t(lang, "contactPhone")}</dt><dd>{p.contactPhone || "—"}</dd>
          <dt>{t(lang, "contactEmail")}</dt><dd>{p.contactEmail || "—"}</dd>
          <dt>{t(lang, "area")}</dt><dd>{[p.area, p.region].filter(Boolean).join(", ") || "—"}</dd>
          <dt>{t(lang, "nearUni")}</dt><dd>{p.nearUni || "—"}</dd>
          <dt>{t(lang, "propertyCount")}</dt><dd>{p.propertyCount || "—"}</dd>
          <dt>{t(lang, "bedCount")}</dt><dd>{p.bedCount || "—"}</dd>
        </dl>
      </div>

      <div className="biz-card">
        <h2 className="biz-h2">{t(lang, "steps.documents.title")}</h2>
        <ul className="biz-list" style={{ listStyle: "none", paddingLeft: 0 }}>
          {["brela", "tin", "ownerId", "licence"].map(id => (
            <DocLink key={id} label={`${t(lang, `docTypes.${id}.title`)}${requiredDocumentTypes(p.businessType).includes(id) ? " *" : ""}`} file={op.documents?.[id]} />
          ))}
        </ul>
        <p className="biz-small" style={{ marginTop: 8 }}>
          Review: {op.review?.documents || "—"}{op.review?.note ? ` · “${op.review.note}”` : ""}
        </p>
      </div>

      <div className="biz-card">
        <h2 className="biz-h2">{t(lang, "steps.settlement.title")} · {t(lang, "steps.application.title")}</h2>
        <dl className="biz-kv">
          <dt>{t(lang, "settlementMethod")}</dt><dd>{s.method ? t(lang, `settlementMethods.${s.method}`) : "—"}</dd>
          <dt>{t(lang, "institution")}</dt><dd>{s.institution || "—"}</dd>
          <dt>{t(lang, "accountName")}</dt><dd>{s.accountName || "—"}</dd>
          <dt>pawaPay</dt><dd>{t(lang, `applicationStatuses.${a.status || "not_started"}`)}</dd>
          <dt>{t(lang, "merchantName")}</dt><dd>{a.merchantName || "—"}</dd>
          <dt>{t(lang, "applicationNote")}</dt><dd>{a.note || "—"}</dd>
          <dt>Sandbox</dt><dd>{op.pawapay?.sandbox?.connected ? `✓ ${op.pawapay.sandbox.companyName || ""} …${op.pawapay.sandbox.tokenLast4 || ""}` : "—"}</dd>
          <dt>Test</dt><dd>{op.pawapay?.testDeposit ? `${op.pawapay.testDeposit.status} · TZS ${op.pawapay.testDeposit.amount}` : "—"}</dd>
          <dt>Production</dt><dd>{op.pawapay?.production?.connected ? `✓ ${op.pawapay.production.companyName || ""} …${op.pawapay.production.tokenLast4 || ""}` : "—"}</dd>
          <dt>Payment mode</dt><dd>{op.paymentMode || "operator_own"}</dd>
        </dl>
      </div>

      <div className="biz-card">
        <Field label={t(lang, "adminNote")}>
          <textarea className="biz-textarea" value={note} onChange={e => setNote(e.target.value)} maxLength={500} />
        </Field>
        <div className="biz-actions">
          <button className="biz-btn primary small" disabled={!!busy} onClick={() => act("approve_documents")}>{t(lang, "adminApproveDocs")}</button>
          <button className="biz-btn ghost small" disabled={!!busy} onClick={() => act("request_changes")}>{t(lang, "adminRequestChanges")}</button>
          <button className="biz-btn dark small" disabled={!!busy} onClick={() => act("set_live")}>{t(lang, "adminSetLive")}</button>
          {status === "live"
            ? <button className="biz-btn danger small" disabled={!!busy} onClick={() => act("suspend")}>{t(lang, "adminSuspend")}</button>
            : <button className="biz-btn ghost small" disabled={!!busy} onClick={() => act("reopen")}>{t(lang, "adminReopen")}</button>}
        </div>
        {busy && <div className="biz-small" style={{ marginTop: 8 }}>{t(lang, "saving")}</div>}
        {error && <div className="biz-error">{error}</div>}
      </div>

      <h2 className="biz-h2" style={{ marginTop: 24 }}>{t(lang, "adminHelpConnect")}</h2>
      <ConnectPanel operator={op} lang={lang} environment="sandbox" adminOperatorId={op.id} />
      <ConnectPanel operator={op} lang={lang} environment="production" adminOperatorId={op.id} />
    </>
  );
}

function Field({ label, children }) {
  return (
    <label className="biz-field" style={{ marginTop: 0 }}>
      <span className="biz-label">{label}</span>
      {children}
    </label>
  );
}
