import { useEffect, useRef, useState } from "react";
import { t } from "./bizCopy";
import { BIZ_CALLBACK_BASE } from "./bizFirebase";
import {
  BUSINESS_TYPES,
  DOCUMENT_TYPES,
  PAWAPAY_APPLICATION_STATUSES,
  SETTLEMENT_METHODS,
  TZ_PROVIDERS,
  callbackUrlFor,
  connectPawapay,
  createTestDeposit,
  disconnectPawapay,
  documentUrl,
  errorMessage,
  refreshDeposit,
  requiredDocumentTypes,
  saveProfile,
  savePawapayApplication,
  saveSettlement,
  uploadDocument,
} from "./bizService";

const NEAR_UNIS = [
  { short: "ARU", name: "Ardhi University" },
  { short: "UDSM", name: "University of Dar es Salaam" },
  { short: "CBE", name: "College of Business Education" },
  { short: "DUCE", name: "Dar es Salaam University College of Education" },
  { short: "KIUT", name: "Kampala International University in Tanzania" },
  { short: "IFM", name: "Institute of Finance Management" },
  { short: "DIT", name: "Dar es Salaam Institute of Technology" },
  { short: "MUHAS", name: "Muhimbili University of Health and Allied Sciences" },
];

// ─── Small shared pieces ───

function Field({ label, optional, lang, children, hint }) {
  return (
    <label className="biz-field">
      <span className="biz-label">
        {label}
        {optional && <span className="opt"> ({t(lang, "optional")})</span>}
      </span>
      {children}
      {hint && <span className="biz-small" style={{ display: "block", marginTop: 5 }}>{hint}</span>}
    </label>
  );
}

function useSaver(lang) {
  const [state, setState] = useState({ busy: false, error: "", ok: false });
  const run = async (fn) => {
    setState({ busy: true, error: "", ok: false });
    try {
      const result = await fn();
      setState({ busy: false, error: "", ok: true });
      return { result };
    } catch (err) {
      console.error(err);
      setState({ busy: false, error: errorMessage(err, t(lang, "genericError")), ok: false });
      return null;
    }
  };
  return [state, run];
}

function StepHeader({ lang, stepId }) {
  return (
    <>
      <h1 className="biz-h1">{t(lang, `steps.${stepId}.title`)}</h1>
      <p className="biz-muted">{t(lang, `steps.${stepId}.body`)}</p>
    </>
  );
}

function CopyBox({ value, lang }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_) { /* clipboard blocked — the text is still selectable */ }
  };
  return (
    <div className="biz-copybox">
      <code>{value}</code>
      <button type="button" className="biz-btn ghost small" onClick={copy}>
        {copied ? t(lang, "copied") : t(lang, "copy")}
      </button>
    </div>
  );
}

// ─── 1. Business profile ───

export function ProfileStep({ operator, lang, onDone }) {
  const [form, setForm] = useState(() => ({
    businessName: "", businessType: "", brelaNumber: "", tin: "",
    contactName: "", contactPhone: "", contactEmail: "",
    region: "Dar es Salaam", area: "", nearUni: "ARU", propertyCount: "", bedCount: "",
    ...(operator.profile || {}),
  }));
  const [saver, run] = useSaver(lang);
  const set = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));
  const needsBrela = ["company", "sole_proprietor"].includes(form.businessType);

  const submit = async (e) => {
    e.preventDefault();
    if (await run(() => saveProfile(operator.id, form))) onDone?.();
  };

  return (
    <form onSubmit={submit}>
      <StepHeader lang={lang} stepId="profile" />
      <div className="biz-card">
        <Field label={t(lang, "businessName")} lang={lang}>
          <input className="biz-input" value={form.businessName} onChange={set("businessName")} required maxLength={120} />
        </Field>

        <div className="biz-field">
          <span className="biz-label">{t(lang, "businessType")}</span>
          <div className="biz-radio-group">
            {BUSINESS_TYPES.map(type => (
              <label key={type} className={`biz-radio ${form.businessType === type ? "on" : ""}`}>
                <input type="radio" name="businessType" value={type} checked={form.businessType === type} onChange={set("businessType")} required />
                {t(lang, `businessTypes.${type}`)}
              </label>
            ))}
          </div>
        </div>

        <div className="biz-row">
          {needsBrela && (
            <Field label={t(lang, "brelaNumber")} lang={lang}>
              <input className="biz-input" value={form.brelaNumber} onChange={set("brelaNumber")} required maxLength={40} />
            </Field>
          )}
          <Field label={t(lang, "tin")} lang={lang}>
            <input className="biz-input" value={form.tin} onChange={set("tin")} required inputMode="numeric" maxLength={20} />
          </Field>
        </div>

        <div className="biz-row">
          <Field label={t(lang, "contactName")} lang={lang}>
            <input className="biz-input" value={form.contactName} onChange={set("contactName")} required maxLength={80} autoComplete="name" />
          </Field>
          <Field label={t(lang, "contactPhone")} lang={lang}>
            <input className="biz-input" value={form.contactPhone} onChange={set("contactPhone")} required type="tel" maxLength={20} autoComplete="tel" />
          </Field>
        </div>
        <Field label={t(lang, "contactEmail")} optional lang={lang}>
          <input className="biz-input" value={form.contactEmail} onChange={set("contactEmail")} type="email" maxLength={120} autoComplete="email" />
        </Field>

        <div className="biz-row">
          <Field label={t(lang, "region")} lang={lang}>
            <input className="biz-input" value={form.region} onChange={set("region")} required maxLength={60} />
          </Field>
          <Field label={t(lang, "area")} lang={lang}>
            <input className="biz-input" value={form.area} onChange={set("area")} required maxLength={80} placeholder="Mikocheni, Ubungo…" />
          </Field>
        </div>
        <Field label={t(lang, "nearUni")} lang={lang}>
          <select className="biz-select" value={form.nearUni} onChange={set("nearUni")}>
            {NEAR_UNIS.map(u => <option key={u.short} value={u.short}>{u.name} ({u.short})</option>)}
            {!NEAR_UNIS.some(u => u.short === form.nearUni) && form.nearUni && <option value={form.nearUni}>{form.nearUni}</option>}
          </select>
        </Field>
        <div className="biz-row">
          <Field label={t(lang, "propertyCount")} optional lang={lang}>
            <input className="biz-input" value={form.propertyCount} onChange={set("propertyCount")} inputMode="numeric" maxLength={4} />
          </Field>
          <Field label={t(lang, "bedCount")} optional lang={lang}>
            <input className="biz-input" value={form.bedCount} onChange={set("bedCount")} inputMode="numeric" maxLength={6} />
          </Field>
        </div>
        <p className="biz-small" style={{ marginTop: 14 }}>{t(lang, "requiredNote")}</p>
      </div>

      {saver.error && <div className="biz-error">{saver.error}</div>}
      <div className="biz-actions">
        <button className="biz-btn primary block" disabled={saver.busy}>
          {saver.busy ? t(lang, "saving") : t(lang, "save")}
        </button>
      </div>
    </form>
  );
}

// ─── 2. Documents ───

function DocumentRow({ operator, docType, lang, required }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = operator.documents?.[docType];

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await uploadDocument(operator.id, docType, file);
    } catch (err) {
      const code = err?.message;
      setError(code === "bad_type" ? t(lang, "fileBadType") : code === "too_big" ? t(lang, "fileTooBig") : errorMessage(err, t(lang, "genericError")));
    } finally {
      setBusy(false);
    }
  };

  const view = async () => {
    try {
      const url = await documentUrl(current.path);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      setError(errorMessage(err, t(lang, "genericError")));
    }
  };

  return (
    <div className="biz-doc">
      <div className="biz-doc-text">
        <div className="biz-step-title">
          {t(lang, `docTypes.${docType}.title`)}
          {!required && <span className="biz-small"> ({t(lang, "optional")})</span>}
        </div>
        <div className="biz-step-body">{t(lang, `docTypes.${docType}.body`)}</div>
        {current?.name && <div className="biz-doc-file">📎 {current.name}</div>}
        {error && <div className="biz-error">{error}</div>}
      </div>
      <div className="biz-doc-actions">
        {current?.path && (
          <button type="button" className="biz-btn ghost small" onClick={view}>{t(lang, "view")}</button>
        )}
        <button type="button" className="biz-btn primary small" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? t(lang, "uploading") : current?.path ? t(lang, "replace") : t(lang, "upload")}
        </button>
        <input ref={inputRef} className="biz-file-input" type="file" accept="image/*,application/pdf" onChange={onFile} />
      </div>
    </div>
  );
}

export function DocumentsStep({ operator, lang }) {
  const required = requiredDocumentTypes(operator.profile?.businessType);
  const review = operator.review?.documents;
  const allUploaded = required.every(id => operator.documents?.[id]?.path);
  // Show required docs first, then optional ones; hide BRELA for individuals.
  const shown = DOCUMENT_TYPES
    .filter(d => required.includes(d.id) || d.requiredFor.length === 0)
    .map(d => d.id);

  return (
    <>
      <StepHeader lang={lang} stepId="documents" />
      {review === "changes_requested" && (
        <div className="biz-banner danger">
          {t(lang, "docsReview.changes_requested")}
          {operator.review?.note ? ` — ${operator.review.note}` : ""}
        </div>
      )}
      {review === "approved" && <div className="biz-banner success">✓ {t(lang, "docsReview.approved")}</div>}
      {allUploaded && !review && <div className="biz-banner info">{t(lang, "docsReview.pending")}</div>}
      <div className="biz-card">
        {shown.map(id => (
          <DocumentRow key={id} operator={operator} docType={id} lang={lang} required={required.includes(id)} />
        ))}
        <p className="biz-small" style={{ marginTop: 10 }}>{t(lang, "fileRules")}</p>
      </div>
    </>
  );
}

// ─── 3. Settlement ───

export function SettlementStep({ operator, lang, onDone }) {
  const [form, setForm] = useState(() => ({
    method: "", institution: "", accountName: "", confirmedWithPawapay: false,
    ...(operator.settlement || {}),
  }));
  const [saver, run] = useSaver(lang);

  const submit = async (e) => {
    e.preventDefault();
    if (await run(() => saveSettlement(operator.id, form))) onDone?.();
  };

  return (
    <form onSubmit={submit}>
      <StepHeader lang={lang} stepId="settlement" />
      <div className="biz-card tint"><p className="biz-muted">{t(lang, "settlementIntro")}</p></div>
      <div className="biz-card">
        <div className="biz-field" style={{ marginTop: 0 }}>
          <span className="biz-label">{t(lang, "settlementMethod")}</span>
          <div className="biz-radio-group">
            {SETTLEMENT_METHODS.map(m => (
              <label key={m} className={`biz-radio ${form.method === m ? "on" : ""}`}>
                <input type="radio" name="method" value={m} checked={form.method === m} onChange={e => setForm(p => ({ ...p, method: e.target.value }))} required />
                {t(lang, `settlementMethods.${m}`)}
              </label>
            ))}
          </div>
        </div>
        <Field label={t(lang, "institution")} lang={lang}>
          <input className="biz-input" value={form.institution} placeholder={t(lang, "institutionPlaceholder")} onChange={e => setForm(p => ({ ...p, institution: e.target.value }))} required maxLength={60} />
        </Field>
        <Field label={t(lang, "accountName")} lang={lang} hint={t(lang, "accountNameHint")}>
          <input className="biz-input" value={form.accountName} onChange={e => setForm(p => ({ ...p, accountName: e.target.value }))} required maxLength={120} />
        </Field>
        <label className="biz-check">
          <input type="checkbox" checked={form.confirmedWithPawapay === true} onChange={e => setForm(p => ({ ...p, confirmedWithPawapay: e.target.checked }))} required />
          <span>{t(lang, "confirmedWithPawapay")}</span>
        </label>
        <p className="biz-small" style={{ marginTop: 12 }}>🔒 {t(lang, "noAccountNumber")}</p>
      </div>
      {saver.error && <div className="biz-error">{saver.error}</div>}
      <div className="biz-actions">
        <button className="biz-btn primary block" disabled={saver.busy}>{saver.busy ? t(lang, "saving") : t(lang, "save")}</button>
      </div>
    </form>
  );
}

// ─── 4. pawaPay application ───

export function ApplicationStep({ operator, lang, onDone }) {
  const [form, setForm] = useState(() => ({
    status: "not_started", merchantName: "", note: "",
    ...(operator.pawapayApplication || {}),
  }));
  const [saver, run] = useSaver(lang);
  const checklist = t(lang, "applicationChecklist");
  const how = t(lang, "applicationHow");

  const submit = async (e) => {
    e.preventDefault();
    const saved = await run(() => savePawapayApplication(operator.id, {
      status: form.status,
      merchantName: form.merchantName || "",
      note: form.note || "",
    }));
    if (saved) onDone?.();
  };

  return (
    <form onSubmit={submit}>
      <StepHeader lang={lang} stepId="application" />
      <div className="biz-card tint"><p className="biz-muted">{t(lang, "applicationIntro")}</p></div>

      <div className="biz-card">
        <h2 className="biz-h2">{t(lang, "applicationChecklistTitle")}</h2>
        <ul className="biz-list">{checklist.map(item => <li key={item}>{item}</li>)}</ul>
        <h2 className="biz-h2" style={{ marginTop: 16 }}>{t(lang, "applicationHowTitle")}</h2>
        <ol className="biz-list">{how.map(item => <li key={item}>{item}</li>)}</ol>
        <p className="biz-small" style={{ marginTop: 10 }}>{t(lang, "applicationConfirmNote")}</p>
        <div className="biz-actions">
          <a className="biz-btn dark" href="https://pawapay.io" target="_blank" rel="noopener noreferrer">{t(lang, "openPawapay")} ↗</a>
        </div>
      </div>

      <div className="biz-card">
        <span className="biz-label">{t(lang, "applicationStatus")}</span>
        <div className="biz-radio-group">
          {PAWAPAY_APPLICATION_STATUSES.map(s => (
            <label key={s} className={`biz-radio ${form.status === s ? "on" : ""}`}>
              <input type="radio" name="appStatus" value={s} checked={form.status === s} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} />
              {t(lang, `applicationStatuses.${s}`)}
            </label>
          ))}
        </div>
        {form.status !== "not_started" && (
          <>
            <Field label={t(lang, "merchantName")} optional lang={lang}>
              <input className="biz-input" value={form.merchantName} onChange={e => setForm(p => ({ ...p, merchantName: e.target.value }))} maxLength={120} />
            </Field>
            <Field label={t(lang, "applicationNote")} optional lang={lang}>
              <textarea className="biz-textarea" value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} maxLength={500} />
            </Field>
          </>
        )}
      </div>
      {saver.error && <div className="biz-error">{saver.error}</div>}
      <div className="biz-actions">
        <button className="biz-btn primary block" disabled={saver.busy}>{saver.busy ? t(lang, "saving") : t(lang, "save")}</button>
      </div>
    </form>
  );
}

// ─── 5 / 7. Connect a pawaPay token (sandbox or production) ───

export function ConnectPanel({ operator, lang, environment, adminOperatorId }) {
  const [token, setToken] = useState("");
  const [saver, run] = useSaver(lang);
  const connection = operator.pawapay?.[environment];

  const connect = async (e) => {
    e.preventDefault();
    const ok = await run(() => connectPawapay(environment, token.trim(), adminOperatorId));
    if (ok) setToken("");
  };
  const disconnect = () => run(() => disconnectPawapay(environment, adminOperatorId));

  return (
    <div className="biz-card">
      <p className="biz-muted">{t(lang, environment === "sandbox" ? "sandboxIntro" : "productionIntro")}</p>
      {connection?.connected ? (
        <>
          <div className="biz-connected">
            <div className="biz-connected-icon">✓</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{t(lang, "connectedAs", { name: connection.companyName || "pawaPay" })}</div>
              <div className="biz-small">{environment.toUpperCase()} · {t(lang, "connectedToken", { last4: connection.tokenLast4 || "••••" })}</div>
            </div>
          </div>
          <div className="biz-actions">
            <button type="button" className="biz-btn danger small" disabled={saver.busy} onClick={disconnect}>{t(lang, "disconnect")}</button>
          </div>
        </>
      ) : (
        <form onSubmit={connect}>
          <Field label={t(lang, "apiToken")} lang={lang}>
            <textarea
              className="biz-textarea biz-input mono"
              value={token}
              onChange={e => setToken(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
              placeholder="eyJ…"
            />
          </Field>
          <div className="biz-actions">
            <button className="biz-btn primary" disabled={saver.busy || token.trim().length < 20}>
              {saver.busy ? t(lang, "connecting") : t(lang, "connect")}
            </button>
          </div>
        </form>
      )}
      {saver.error && <div className="biz-error">{saver.error}</div>}
    </div>
  );
}

function CallbackCard({ operator, lang }) {
  return (
    <div className="biz-card">
      <h2 className="biz-h2">{t(lang, "callbackTitle")}</h2>
      <p className="biz-muted">{t(lang, "callbackBody")}</p>
      <CopyBox value={callbackUrlFor(operator.id, BIZ_CALLBACK_BASE)} lang={lang} />
      <p className="biz-small" style={{ marginTop: 10 }}>{t(lang, "signedCallbacksOff")}</p>
    </div>
  );
}

export function SandboxStep({ operator, lang }) {
  return (
    <>
      <StepHeader lang={lang} stepId="sandbox" />
      <ConnectPanel operator={operator} lang={lang} environment="sandbox" />
      {operator.pawapay?.sandbox?.connected && <CallbackCard operator={operator} lang={lang} />}
    </>
  );
}

// ─── 6. Test payment ───

export function TestStep({ operator, lang }) {
  const providers = operator.pawapay?.sandbox?.providers?.length ? operator.pawapay.sandbox.providers : TZ_PROVIDERS;
  const [form, setForm] = useState({ phone: operator.profile?.contactPhone || "", provider: providers[0]?.provider || "VODACOM_TZA", amount: "1000" });
  const [saver, run] = useSaver(lang);
  const test = operator.pawapay?.testDeposit;
  const status = test?.status;

  // While a test is pending, re-check with pawaPay every few seconds in case
  // the operator hasn't set up the callback URL yet.
  useEffect(() => {
    if (status !== "pending" || !test?.depositId) return undefined;
    let stopped = false;
    let tries = 0;
    let timer = null;
    const tick = async () => {
      if (stopped || tries >= 12) return;
      tries += 1;
      try { await refreshDeposit(test.depositId); } catch (_) { /* keep polling */ }
      if (!stopped) timer = setTimeout(tick, 5000);
    };
    timer = setTimeout(tick, 4000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [status, test?.depositId]);

  const send = async (e) => {
    e.preventDefault();
    await run(() => createTestDeposit(form));
  };

  return (
    <>
      <StepHeader lang={lang} stepId="test" />
      <div className="biz-card tint"><p className="biz-muted">{t(lang, "testIntro")}</p></div>

      {status && (
        <div className={`biz-banner ${status === "paid" ? "success" : status === "failed" ? "danger" : "warning"}`}>
          <strong>{t(lang, `testStatus.${status}`) || status}</strong>
          {test?.amount ? ` · TZS ${Number(test.amount).toLocaleString()}` : ""}
          {test?.pawaPayStatus ? ` · ${test.pawaPayStatus}` : ""}
          {status === "pending" && (
            <div className="biz-actions" style={{ marginTop: 10 }}>
              <button type="button" className="biz-btn ghost small" disabled={saver.busy} onClick={() => run(() => refreshDeposit(test.depositId))}>
                {t(lang, "checkStatus")}
              </button>
            </div>
          )}
        </div>
      )}

      {status !== "paid" && status !== "pending" && (
        <form onSubmit={send} className="biz-card">
          <div className="biz-row">
            <Field label={t(lang, "testPhone")} lang={lang}>
              <input className="biz-input" type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} required placeholder="07XX XXX XXX" />
            </Field>
            <Field label={t(lang, "testAmount")} lang={lang}>
              <input className="biz-input" inputMode="numeric" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value.replace(/[^\d]/g, "") }))} required />
            </Field>
          </div>
          <Field label={t(lang, "testProvider")} lang={lang}>
            <select className="biz-select" value={form.provider} onChange={e => setForm(p => ({ ...p, provider: e.target.value }))}>
              {providers.map(p => <option key={p.provider} value={p.provider}>{p.displayName}</option>)}
            </select>
          </Field>
          <div className="biz-actions">
            <button className="biz-btn primary block" disabled={saver.busy}>
              {saver.busy ? t(lang, "sending") : status === "failed" ? t(lang, "tryAgain") : t(lang, "sendTest")}
            </button>
          </div>
        </form>
      )}
      {saver.error && <div className="biz-error">{saver.error}</div>}
    </>
  );
}

// ─── 7. Go live ───

export function LiveStep({ operator, lang }) {
  const waiting = operator.pawapay?.production?.connected && operator.status === "in_review";
  return (
    <>
      <StepHeader lang={lang} stepId="live" />
      {operator.status === "live"
        ? <div className="biz-banner success">{t(lang, "liveBanner")}</div>
        : <div className="biz-card tint"><p className="biz-muted">{t(lang, "liveIntro")}</p></div>}
      <ConnectPanel operator={operator} lang={lang} environment="production" />
      {operator.pawapay?.production?.connected && <CallbackCard operator={operator} lang={lang} />}
      {operator.status !== "live" && (
        <div className={`biz-banner ${waiting ? "info" : "warning"}`}>
          {waiting ? t(lang, "waitingForKampasika") : t(lang, "needsSubmit")}
        </div>
      )}
    </>
  );
}

export const STEP_COMPONENTS = {
  profile: ProfileStep,
  documents: DocumentsStep,
  settlement: SettlementStep,
  application: ApplicationStep,
  sandbox: SandboxStep,
  test: TestStep,
  live: LiveStep,
};
