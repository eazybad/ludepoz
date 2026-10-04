// ─── Kampasika Biz ───
// The business side of Kampasika for hostel / PBSA operators, served at
// /biz on the same site and Firebase project. index.js loads this instead
// of App.js for /biz paths, so the student app is never touched.
//
// Routes:
//   /biz                   home: welcome (no business yet) or readiness checklist
//   /biz/step/<stepId>     one onboarding step
//   /biz/applications      student applications for the operator's rooms (step 2)
//   /biz/applications/<id> one application
//   /biz/applications/<id>/lease   create a lease for an approved application (step 3)
//   /biz/leases            the operator's leases
//   /biz/lease-template    edit the lease template
//   /biz/lease/<id>        one lease — opened by the operator AND the student
//   /biz/rent              rent: occupancy, arrears, payments (step 4)
//   /biz/statement         every payment received, by month, with CSV export
//   /biz/fees              Kampasika placement fees the operator owes / paid
//   /biz/setup             settings: payment number, Verified badge (optional),
//                          online payments (optional). /biz is always the
//                          Overview — a business is open the moment it's created.
//   /biz/demo/...          the same app with sample data, no sign-in (bizDemo.js)
//   /biz/admin             Kampasika admin: all businesses
//   /biz/admin/<uid>       Kampasika admin: one business

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import "./Biz.css";
import { t } from "./bizCopy";
import { auth, db, BIZ_ADMIN_UIDS } from "./bizFirebase";
import {
  ALL_STEP_IDS,
  BUSINESS_TYPES,
  PAY_TO_METHODS,
  stepsFor,
  canSubmitForReview,
  computeSteps,
  createOperator,
  documentsState,
  errorMessage,
  isManualOperator,
  isVerified,
  onlinePaymentsLive,
  payToState,
  progressPercent,
  requestVerification,
  submitForReview,
  subscribeOperator,
} from "./bizService";
import { Statement } from "./BizStatement";
import { STEP_COMPONENTS } from "./BizSteps";
import { BizAdminDetail, BizAdminList } from "./BizAdmin";
import { ApplicationDetail, ApplicationsList, useOperatorApplications } from "./BizApplications";
import { applicationsUnlocked } from "./bizService";
import { CreateLeaseForm, LeasePage, LeaseTemplateEditor, LeasesList, useOperatorLeases } from "./BizLeases";
import { OperatorRent, useOperatorCharges } from "./BizRent";
import { isOverdue, pendingClaim } from "./bizService";
import { FeesBanner, FeesPage, useOperatorInvoices, usePricing } from "./BizFees";
import { BizOverview } from "./BizDashboard";
import { DEMO_OPERATOR_ID, demoParam, isBizDemo } from "./bizDemo";

const DEMO = isBizDemo();
const BASE = DEMO ? "/biz/demo" : "/biz";
// In the demo, every "/biz/..." link stays inside "/biz/demo/...".
const toUrl = (path) => (DEMO ? path.replace(/^\/biz(?=\/|$)/, BASE) : path);

function readLang() {
  try { return localStorage.getItem("kp-biz-lang") === "sw" ? "sw" : "en"; } catch (_) { return "en"; }
}

function readDark() {
  try {
    const saved = localStorage.getItem("kp-theme");
    if (saved === "dark") return true;
    if (saved === "light") return false;
  } catch (_) { /* storage blocked */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches || false;
}

function parsePath(pathname) {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean); // ["biz", ...]
  if (parts[1] === "demo") parts.splice(1, 1);
  if (parts[1] === "step" && ALL_STEP_IDS.includes(parts[2])) return { view: "step", stepId: parts[2] };
  if (parts[1] === "admin") return parts[2] ? { view: "adminDetail", operatorId: parts[2] } : { view: "admin" };
  if (parts[1] === "applications" && parts[2] && parts[3] === "lease") return { view: "createLease", applicationId: parts[2] };
  if (parts[1] === "applications") return parts[2] ? { view: "applicationDetail", applicationId: parts[2] } : { view: "applications" };
  if (parts[1] === "leases") return { view: "leases" };
  if (parts[1] === "rent") return { view: "rent" };
  if (parts[1] === "fees") return { view: "fees" };
  if (parts[1] === "statement") return { view: "statement" };
  if (parts[1] === "setup") return { view: "setup" };
  if (parts[1] === "lease-template") return { view: "leaseTemplate" };
  if (parts[1] === "lease" && parts[2]) return { view: "lease", leaseId: parts[2] };
  return { view: "home" };
}

function Header({ lang, onToggleLang, isAdmin, onNavigate }) {
  return (
    <header className="biz-header">
      <div className="biz-header-inner">
        <button type="button" className="biz-logo" style={{ background: "none", border: "none", color: "inherit", padding: 0, cursor: "pointer", font: "inherit" }} onClick={() => onNavigate("/biz")}>
          <span className="biz-logo-mark">K</span>
          <span>Kampasika</span>
          <span className="biz-logo-badge">BIZ</span>
        </button>
        <span className="biz-header-spacer" />
        {DEMO && <a className="biz-header-btn demo" href="/biz">{t(lang, "demoCta")}</a>}
        {isAdmin && !DEMO && <button type="button" className="biz-header-btn" onClick={() => onNavigate("/biz/admin")}>Admin</button>}
        <button type="button" className="biz-header-btn" onClick={onToggleLang}>{t(lang, "language")}</button>
      </div>
    </header>
  );
}

function Loading({ lang }) {
  return <div className="biz-center"><div><div className="biz-spinner" /><p className="biz-muted">{t(lang, "loading")}</p></div></div>;
}

function SignIn({ lang }) {
  return (
    <div className="biz-center">
      <div>
        <h1 className="biz-h1">{t(lang, "signInTitle")}</h1>
        <p className="biz-muted" style={{ maxWidth: 420, margin: "0 auto" }}>{t(lang, "signInBody")}</p>
        <div className="biz-actions" style={{ justifyContent: "center" }}>
          <a className="biz-btn primary" href="/">{t(lang, "signInButton")}</a>
          <a className="biz-btn ghost" href="/biz/demo">👀 {t(lang, "demoLink")}</a>
        </div>
      </div>
    </div>
  );
}

export function Welcome({ lang, user }) {
  const [form, setForm] = useState({ businessName: "", contactName: "", contactPhone: "", businessType: "", area: "" });
  const [payTo, setPayTo] = useState({ method: "mobile_money", provider: "", number: "", name: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Prefill from the Kampasika profile where we can.
  useEffect(() => {
    getDoc(doc(db, "users", user.uid)).then(snap => {
      const u = snap.data() || {};
      setForm(prev => ({
        ...prev,
        contactName: prev.contactName || u.name || u.username || "",
        contactPhone: prev.contactPhone || u.phone || "",
      }));
    }).catch(() => {});
  }, [user.uid]);

  const set = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));
  const setPay = (key) => (e) => setPayTo(p => ({ ...p, [key]: e.target.value }));
  const hasNumber = String(payTo.number || "").trim().length > 0;

  const start = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const nextPayTo = hasNumber ? { ...payTo, name: payTo.name || form.contactName } : null;
      await createOperator(user, { ...form, payTo: nextPayTo });
    } catch (err) {
      setError(errorMessage(err, t(lang, "genericError")));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="biz-hero">
        <h1 className="biz-hero-name" style={{ fontSize: 24 }}>{t(lang, "welcomeTitle")}</h1>
        <p className="biz-muted" style={{ marginTop: 10 }}>{t(lang, "welcomeBody")}</p>
      </div>
      <div className="biz-card">
        <ul className="biz-points">{t(lang, "welcomePoints").map(p => <li key={p}>{p}</li>)}</ul>
        <div className="biz-actions">
          <a className="biz-btn ghost small" href="/biz/demo">👀 {t(lang, "demoLink")}</a>
        </div>
      </div>
      <form className="biz-card" onSubmit={start}>
        <label className="biz-field" style={{ marginTop: 0 }}>
          <span className="biz-label">{t(lang, "businessName")}</span>
          <input className="biz-input" value={form.businessName} onChange={set("businessName")} required maxLength={120} />
        </label>
        <div className="biz-row">
          <label className="biz-field">
            <span className="biz-label">{t(lang, "contactName")}</span>
            <input className="biz-input" value={form.contactName} onChange={set("contactName")} required maxLength={80} />
          </label>
          <label className="biz-field">
            <span className="biz-label">{t(lang, "contactPhone")}</span>
            <input className="biz-input" type="tel" value={form.contactPhone} onChange={set("contactPhone")} required maxLength={20} />
          </label>
        </div>
        <div className="biz-row">
          <label className="biz-field">
            <span className="biz-label">{t(lang, "welcomeRegistered")}</span>
            <select className="biz-input" value={form.businessType} onChange={set("businessType")} required>
              <option value="">—</option>
              {BUSINESS_TYPES.map(bt => <option key={bt} value={bt}>{t(lang, `businessTypes.${bt}`)}</option>)}
            </select>
          </label>
          <label className="biz-field">
            <span className="biz-label">{t(lang, "area")} <span className="opt">({t(lang, "optional")})</span></span>
            <input className="biz-input" value={form.area} onChange={set("area")} maxLength={80} placeholder="Mwenge, Sinza…" />
          </label>
        </div>

        <h2 className="biz-h2" style={{ marginTop: 22 }}>{t(lang, "welcomePayTitle")}</h2>
        <p className="biz-small">{t(lang, "welcomePayBody")}</p>
        <div className="biz-radio-group" style={{ marginTop: 10 }}>
          {PAY_TO_METHODS.map(m => (
            <label key={m} className={`biz-radio ${payTo.method === m ? "on" : ""}`}>
              <input type="radio" name="welcomePayMethod" value={m} checked={payTo.method === m} onChange={setPay("method")} />
              {t(lang, `payToMethods.${m}`)}
            </label>
          ))}
        </div>
        <div className="biz-row">
          <label className="biz-field">
            <span className="biz-label">{t(lang, payTo.method === "bank" ? "payToBank" : "payToNetwork")}</span>
            <input className="biz-input" value={payTo.provider} onChange={setPay("provider")} required={hasNumber} maxLength={60} placeholder={payTo.method === "bank" ? "CRDB, NMB…" : "M-Pesa, Airtel Money, Mixx…"} />
          </label>
          <label className="biz-field">
            <span className="biz-label">{t(lang, payTo.method === "lipa" ? "payToLipa" : payTo.method === "bank" ? "payToAccount" : "payToPhone")}</span>
            <input className="biz-input" value={payTo.number} onChange={setPay("number")} maxLength={40} inputMode={payTo.method === "bank" ? "text" : "numeric"} />
          </label>
        </div>
        {hasNumber && (
          <label className="biz-field">
            <span className="biz-label">{t(lang, "payToName")}</span>
            <input className="biz-input" value={payTo.name} onChange={setPay("name")} maxLength={80} placeholder={form.contactName} />
          </label>
        )}
        <p className="biz-small" style={{ marginTop: 10 }}>{t(lang, "welcomePayLater")}</p>

        {error && <div className="biz-error">{error}</div>}
        <div className="biz-actions">
          <button className="biz-btn primary block" disabled={busy}>{busy ? t(lang, "saving") : t(lang, "startSetup")}</button>
        </div>
        <p className="biz-small" style={{ textAlign: "center" }}>{t(lang, "welcomeTermsNote")} <a href="/terms" target="_blank" rel="noreferrer">{t(lang, "termsLink")}</a></p>
      </form>
    </>
  );
}

// Settings: everything here is optional except the payment number students
// pay into. The business is already open — nothing waits on Kampasika.
export function Home({ lang, operator, onNavigate, feesDue = 0, showFees = false }) {
  const steps = computeSteps(operator);
  const onlineIds = stepsFor(operator);
  const onlineSteps = Object.fromEntries(onlineIds.map(id => [id, steps[id]]));
  const pct = progressPercent(onlineSteps);
  const status = operator.status || "draft";
  const live = onlinePaymentsLive(operator);
  const manual = isManualOperator(operator);
  const payState = payToState(operator);
  const docState = documentsState(operator);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const act = async (which, fn) => {
    setBusy(which);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err, t(lang, "genericError")));
    } finally {
      setBusy("");
    }
  };

  const nextStep = onlineIds.find(id => steps[id] === "todo");
  const p = operator.payTo || {};

  return (
    <>
      <h1 className="biz-h1">{t(lang, "settingsTitle")}</h1>
      <p className="biz-muted">{t(lang, "settingsIntro")}</p>
      {status === "suspended" && <div className="biz-banner danger">{t(lang, "suspendedBanner")}</div>}
      {error && <div className="biz-error">{error}</div>}

      <div className="biz-card">
        <div className="biz-set-head">
          <h2 className="biz-h2">🏠 {t(lang, "settingsBusiness")}</h2>
          <button type="button" className="biz-btn ghost small" onClick={() => onNavigate("/biz/step/profile")}>{t(lang, "edit")}</button>
        </div>
        <p className="biz-small">
          <strong>{operator.profile?.businessName}</strong>
          {operator.profile?.area ? ` · ${operator.profile.area}` : ""}
          {operator.profile?.businessType ? ` · ${t(lang, `businessTypes.${operator.profile.businessType}`)}` : ""}
        </p>
      </div>

      <div className={`biz-card ${payState === "todo" ? "biz-card-attn" : ""}`}>
        <div className="biz-set-head">
          <h2 className="biz-h2">💵 {t(lang, "payToTitle")}</h2>
          <span className={`biz-step-state ${payState}`}>{payState === "done" ? t(lang, "stepState.done") : t(lang, "settingsNeeded")}</span>
        </div>
        {p.number
          ? <p className="biz-small"><strong>{t(lang, `payToMethods.${p.method}`)} · {p.provider} {p.number}</strong> · {p.name}</p>
          : <p className="biz-small">{t(lang, "payToCardEmpty")}</p>}
        <div className="biz-actions" style={{ marginTop: 10 }}>
          <button type="button" className={`biz-btn ${p.number ? "ghost" : "primary"} small`} onClick={() => onNavigate("/biz/step/payto")}>{p.number ? t(lang, "payToEdit") : t(lang, "payToAdd")}</button>
        </div>
      </div>

      <div className="biz-card">
        <div className="biz-set-head">
          <h2 className="biz-h2">✅ {t(lang, "verifyTitle")} <span className="opt">({t(lang, "optional")})</span></h2>
          <span className={`biz-step-state ${docState === "done" ? "done" : docState === "waiting" ? "waiting" : "todo"}`}>{t(lang, `verifyState.${docState}`)}</span>
        </div>
        <p className="biz-small">{t(lang, isVerified(operator) ? "verifyDone" : "verifyBody")}</p>
        {docState === "changes" && operator.review?.note && <div className="biz-banner danger" style={{ marginTop: 10 }}>{operator.review.note}</div>}
        {docState !== "done" && (
          <div className="biz-actions" style={{ marginTop: 10 }}>
            <button type="button" className="biz-btn ghost small" onClick={() => onNavigate("/biz/step/documents")}>{t(lang, "verifyUpload")}</button>
            {(docState === "ready" || docState === "changes") && (
              <button type="button" className="biz-btn primary small" disabled={!!busy} onClick={() => act("verify", () => requestVerification(operator.id))}>
                {busy === "verify" ? t(lang, "saving") : t(lang, "verifyAsk")}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="biz-card">
        <div className="biz-set-head">
          <h2 className="biz-h2">⚡ {t(lang, "onlineTitle")} <span className="opt">({t(lang, "optional")})</span></h2>
          {live
            ? <span className="biz-step-state done">{t(lang, "onlineOn")}</span>
            : !manual && <span className="biz-small">{t(lang, "progress", { percent: pct })}</span>}
        </div>
        <p className="biz-small">{t(lang, live ? "onlinePayLive" : manual ? "onlineManual" : "onlineBody")}</p>
        {manual && (
          <div className="biz-actions" style={{ marginTop: 10 }}>
            <button type="button" className="biz-btn ghost small" onClick={() => onNavigate("/biz/step/profile")}>{t(lang, "onlineRegistered")}</button>
          </div>
        )}
        {!manual && (
          <>
            {!live && <div className="biz-progress" style={{ marginTop: 10 }}><span style={{ width: `${pct}%` }} /></div>}
            {status === "in_review" && <div className="biz-banner warning" style={{ marginTop: 10 }}>{t(lang, "submitted")}</div>}
            <ol className="biz-steps">
              {onlineIds.map((id, index) => {
                const state = steps[id];
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="biz-step"
                      disabled={state === "blocked"}
                      onClick={() => onNavigate(`/biz/step/${id}`)}
                      style={id === nextStep ? { background: "var(--mint-tint)", borderRadius: 12, paddingLeft: 10, paddingRight: 10 } : undefined}
                    >
                      <span className={`biz-step-dot ${state}`}>{state === "done" ? "✓" : index + 1}</span>
                      <span className="biz-step-text">
                        <span className="biz-step-title" style={{ display: "block" }}>{t(lang, `steps.${id}.title`)}</span>
                        <span className="biz-step-body" style={{ display: "block" }}>{t(lang, `steps.${id}.body`)}</span>
                      </span>
                      <span className={`biz-step-state ${state}`}>{t(lang, `stepState.${state}`)}</span>
                      {state !== "blocked" && <span className="biz-chevron">›</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
            {["draft", "needs_changes"].includes(status) && (
              <>
                <p className="biz-small" style={{ marginTop: 10 }}>{t(lang, "submitHint")}</p>
                <div className="biz-actions">
                  <button type="button" className="biz-btn dark small" disabled={!!busy || !canSubmitForReview(operator)} onClick={() => act("submit", () => submitForReview(operator.id))}>
                    {t(lang, "submitForReview")}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {showFees && (
        <button type="button" className="biz-op-row" onClick={() => onNavigate("/biz/fees")}>
          <div className="biz-op-main">
            <div className="biz-op-name">💳 {t(lang, "homeFees")}</div>
            <div className="biz-small">{t(lang, "homeFeesSub")}</div>
          </div>
          {feesDue > 0 && <span className="biz-count">{feesDue}</span>}
          <span className="biz-chevron">›</span>
        </button>
      )}

      <div className="biz-actions" style={{ justifyContent: "center" }}>
        <a className="biz-btn ghost small" href="/">← {t(lang, "openKampasika")}</a>
      </div>
    </>
  );
}

export default function BizApp() {
  const [lang, setLang] = useState(readLang);
  const [dark] = useState(readDark);
  const [route, setRoute] = useState(() => parsePath(window.location.pathname));
  // Demo: the owner's view, or ?as=student for the tenant of the first lease.
  const [user, setUser] = useState(DEMO ? { uid: demoParam("as") === "student" ? "demoS3" : DEMO_OPERATOR_ID } : undefined); // undefined = still checking
  const [operator, setOperator] = useState(undefined);
  const [loadError, setLoadError] = useState("");

  const isAdmin = Boolean(user && BIZ_ADMIN_UIDS.includes(user.uid));
  const { apps, error: appsError } = useOperatorApplications(operator);
  const newApplications = (apps || []).filter(a => a.status === "submitted").length;
  const leases = useOperatorLeases(operator?.id, Boolean(operator && applicationsUnlocked(operator)));
  const waitingLeases = (leases || []).filter(l => ["sent", "pending_fee"].includes(l.status)).length;
  const charges = useOperatorCharges(operator?.id, Boolean(operator && applicationsUnlocked(operator)));
  const claimsToConfirm = (charges || []).filter(c => pendingClaim(c)).length;
  const overdueCharges = (charges || []).filter(c => isOverdue(c)).length + claimsToConfirm;
  const pricing = usePricing();
  const invoices = useOperatorInvoices(operator?.id, Boolean(operator && applicationsUnlocked(operator)));
  const feesDue = (invoices || []).filter(i => i.status === "due").length;
  const showFees = Boolean(pricing?.placementFee?.enabled) || (invoices || []).length > 0;

  useEffect(() => {
    // Kampasika Biz has its own title / description for search engines
    // (Google runs this JavaScript when it indexes /biz).
    document.title = "Kampasika Biz · Hostel management & rent collection in Tanzania";
    const setMeta = (selector, attr, value) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute(attr, value);
    };
    setMeta('meta[name="description"]', "content", "For hostel and student-accommodation owners: get student applications from Kampasika, sign leases online and track rent paid straight to you by mobile money or bank. Free to start, Kiswahili and English.");
    setMeta('link[rel="canonical"]', "href", "https://kampasika.org/biz");
    if (DEMO) return undefined;
    return onAuthStateChanged(auth, u => setUser(u || null));
  }, []);

  useEffect(() => {
    if (!user) { setOperator(user === null ? null : undefined); return undefined; }
    return subscribeOperator(
      user.uid,
      op => { setOperator(op); setLoadError(""); },
      err => { console.error(err); setLoadError(errorMessage(err, t(lang, "genericError"))); setOperator(null); }
    );
    // lang only affects the error text; don't resubscribe on language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const onPop = () => setRoute(parsePath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((path) => {
    const url = toUrl(path);
    if (window.location.pathname !== url) window.history.pushState({}, "", url);
    setRoute(parsePath(url));
    window.scrollTo(0, 0);
  }, []);

  const toggleLang = () => {
    const next = lang === "en" ? "sw" : "en";
    setLang(next);
    try { localStorage.setItem("kp-biz-lang", next); } catch (_) { /* ignore */ }
  };

  let body;
  if (user === undefined) {
    body = <Loading lang={lang} />;
  } else if (user === null) {
    body = <SignIn lang={lang} />;
  } else if (route.view === "lease") {
    // Open to both parties — the student has no operator profile.
    body = (
      <>
        {operator && <button type="button" className="biz-back biz-noprint" onClick={() => navigate("/biz/leases")}>‹ {t(lang, "back")}</button>}
        <LeasePage lang={lang} leaseId={route.leaseId} user={user} isAdmin={isAdmin} />
      </>
    );
  } else if (route.view === "admin" || route.view === "adminDetail") {
    body = !isAdmin
      ? <div className="biz-card"><p className="biz-muted">{t(lang, "adminOnlyNotice")}</p></div>
      : route.view === "admin"
        ? <BizAdminList lang={lang} onOpen={id => navigate(`/biz/admin/${id}`)} />
        : (
          <>
            <button type="button" className="biz-back" onClick={() => navigate("/biz/admin")}>‹ {t(lang, "back")}</button>
            <BizAdminDetail lang={lang} operatorId={route.operatorId} onBack={() => navigate("/biz/admin")} />
          </>
        );
  } else if (operator === undefined) {
    body = <Loading lang={lang} />;
  } else if (operator === null) {
    body = loadError ? <div className="biz-error">{loadError}</div> : <Welcome lang={lang} user={user} />;
  } else if (route.view === "applications") {
    body = <ApplicationsList operator={operator} lang={lang} apps={apps} error={appsError} onOpen={id => navigate(`/biz/applications/${id}`)} />;
  } else if (route.view === "applicationDetail") {
    body = (
      <>
        <button type="button" className="biz-back" onClick={() => navigate("/biz/applications")}>‹ {t(lang, "back")}</button>
        <ApplicationDetail lang={lang} apps={apps} applicationId={route.applicationId} onNavigate={navigate} />
      </>
    );
  } else if (route.view === "rent") {
    body = <OperatorRent operator={operator} lang={lang} charges={charges} leases={leases} onNavigate={navigate} />;
  } else if (route.view === "statement") {
    body = <Statement operator={operator} lang={lang} charges={charges} />;
  } else if (route.view === "fees") {
    body = (
      <>
        <button type="button" className="biz-back" onClick={() => navigate("/biz")}>‹ {t(lang, "back")}</button>
        <FeesPage operator={operator} lang={lang} invoices={invoices} pricing={pricing} />
      </>
    );
  } else if (route.view === "leases") {
    body = <LeasesList operator={operator} lang={lang} leases={leases} onNavigate={navigate} />;
  } else if (route.view === "leaseTemplate") {
    body = (
      <>
        <button type="button" className="biz-back" onClick={() => navigate("/biz/leases")}>‹ {t(lang, "back")}</button>
        <LeaseTemplateEditor operator={operator} lang={lang} />
      </>
    );
  } else if (route.view === "createLease") {
    const application = (apps || []).find(a => a.id === route.applicationId);
    body = (
      <>
        <button type="button" className="biz-back" onClick={() => navigate(`/biz/applications/${route.applicationId}`)}>‹ {t(lang, "back")}</button>
        {apps === null
          ? <Loading lang={lang} />
          : <CreateLeaseForm key={application?.id || "none"} operator={operator} lang={lang} application={application} pricing={pricing} onCreated={id => navigate(`/biz/lease/${id}`)} />}
      </>
    );
  } else if (route.view === "step") {
    const Step = STEP_COMPONENTS[route.stepId];
    body = (
      <>
        <button type="button" className="biz-back" onClick={() => navigate("/biz/setup")}>‹ {t(lang, "back")}</button>
        <Step operator={operator} lang={lang} onDone={() => navigate("/biz/setup")} />
      </>
    );
  } else if (route.view === "home" && applicationsUnlocked(operator)) {
    body = (
      <>
        <BizOverview operator={operator} lang={lang} apps={apps} leases={leases} charges={charges} onNavigate={navigate} />
        <div className="bd-more">
          <button type="button" className="biz-op-row" onClick={() => navigate("/biz/setup")}>
            <div className="biz-op-main"><div className="biz-op-name">⚙️ {t(lang, "navSetupFull")}</div><div className="biz-small">{t(lang, "dashSetupLinkSub")}</div></div>
            <span className="biz-chevron">›</span>
          </button>
          {showFees && (
            <button type="button" className="biz-op-row" onClick={() => navigate("/biz/fees")}>
              <div className="biz-op-main"><div className="biz-op-name">💳 {t(lang, "homeFees")}</div><div className="biz-small">{t(lang, "homeFeesSub")}</div></div>
              {feesDue > 0 && <span className="biz-count">{feesDue}</span>}
              <span className="biz-chevron">›</span>
            </button>
          )}
        </div>
      </>
    );
  } else {
    body = <Home lang={lang} operator={operator} onNavigate={navigate} feesDue={feesDue} showFees={showFees} />;
  }

  const wide = route.view === "admin" || route.view === "adminDetail";
  const withNav = Boolean(operator && applicationsUnlocked(operator) && !wide);
  const navItems = withNav ? [
    { id: "home", icon: "▦", label: t(lang, "navOverview"), path: "/biz", on: route.view === "home" },
    { id: "applications", icon: "✎", label: t(lang, "navApplications"), path: "/biz/applications", on: ["applications", "applicationDetail", "createLease"].includes(route.view), count: newApplications },
    { id: "leases", icon: "▤", label: t(lang, "navLeases"), path: "/biz/leases", on: ["leases", "leaseTemplate", "lease"].includes(route.view), count: waitingLeases, countTone: "warn" },
    { id: "rent", icon: "◷", label: t(lang, "navRent"), path: "/biz/rent", on: route.view === "rent", count: overdueCharges },
    { id: "statement", icon: "≡", label: t(lang, "navStatement"), path: "/biz/statement", on: route.view === "statement" },
  ] : [];
  const sideExtra = withNav ? [
    ...(showFees ? [{ id: "fees", icon: "◈", label: t(lang, "homeFees"), path: "/biz/fees", on: route.view === "fees", count: feesDue }] : []),
    { id: "setup", icon: "⚙", label: t(lang, "navSetupFull"), path: "/biz/setup", on: ["setup", "step"].includes(route.view) },
  ] : [];

  return (
    <div className={`biz-app ${dark ? "dark" : ""} ${withNav ? "has-side" : ""}`}>
      <Header lang={lang} onToggleLang={toggleLang} isAdmin={isAdmin} onNavigate={navigate} />
      {DEMO && (
        <div className="biz-demo-bar">
          <span>👀 {t(lang, "demoBanner")}</span>
          <a href="/biz">{t(lang, "demoCta")} ›</a>
        </div>
      )}
      {withNav && (
        <div className="biz-mobile-nav" style={{ padding: "0 16px" }}>
          <nav className="biz-nav">
            {navItems.map(n => (
              <button key={n.id} type="button" className={n.on ? "on" : ""} onClick={() => navigate(n.path)}>
                {n.label}
                {n.count > 0 && <span className="biz-count" style={n.countTone === "warn" ? { background: "#f59e0b" } : undefined}>{n.count}</span>}
              </button>
            ))}
          </nav>
        </div>
      )}
      <div className={withNav ? "biz-layout" : ""}>
        {withNav && (
          <aside className="biz-side">
            <div className="biz-side-biz">
              <div className="biz-side-avatar">{String(operator.profile?.businessName || "K").trim().charAt(0).toUpperCase()}</div>
              <div style={{ minWidth: 0 }}>
                <div className="biz-side-name">{operator.profile?.businessName}</div>
                <span className={`biz-pill ${isVerified(operator) ? "live" : "draft"}`}>{isVerified(operator) ? `✓ ${t(lang, "verifiedPill")}` : t(lang, "openPill")}</span>
              </div>
            </div>
            <nav className="biz-side-nav">
              {navItems.map(n => (
                <button key={n.id} type="button" className={n.on ? "on" : ""} onClick={() => navigate(n.path)}>
                  <span className="biz-side-icon" aria-hidden="true">{n.icon}</span>
                  <span className="biz-side-label">{n.label}</span>
                  {n.count > 0 && <span className="biz-count" style={n.countTone === "warn" ? { background: "#f59e0b" } : undefined}>{n.count}</span>}
                </button>
              ))}
              <div className="biz-side-sep" />
              {sideExtra.map(n => (
                <button key={n.id} type="button" className={n.on ? "on" : ""} onClick={() => navigate(n.path)}>
                  <span className="biz-side-icon" aria-hidden="true">{n.icon}</span>
                  <span className="biz-side-label">{n.label}</span>
                  {n.count > 0 && <span className="biz-count">{n.count}</span>}
                </button>
              ))}
            </nav>
            <a className="biz-side-foot" href="/">← {t(lang, "openKampasika")}</a>
          </aside>
        )}
        <main className={`biz-shell ${wide ? "wide" : ""} ${withNav ? "biz-main" : ""} ${route.view === "home" && withNav ? "is-overview" : ""}`}>
          {operator && !wide && route.view !== "fees" && route.view !== "lease" && (
            <FeesBanner invoices={invoices} pricing={pricing} lang={lang} onOpen={() => navigate("/biz/fees")} />
          )}
          <div className="biz-page" key={`${route.view}-${route.applicationId || route.leaseId || route.stepId || ""}`}>{body}</div>
        </main>
      </div>
    </div>
  );
}
