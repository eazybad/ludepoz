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
//   /biz/fees              Kampasika placement fees the operator owes / paid
//   /biz/setup             onboarding checklist (the home page until documents are approved;
//                          after that /biz shows the Overview dashboard)
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
  stepsFor,
  canSubmitForReview,
  computeSteps,
  createOperator,
  errorMessage,
  progressPercent,
  submitForReview,
  subscribeOperator,
} from "./bizService";
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
  const [form, setForm] = useState({ businessName: "", contactName: "", contactPhone: "" });
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

  const start = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await createOperator(user, form);
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
          <input className="biz-input" value={form.businessName} onChange={e => setForm(p => ({ ...p, businessName: e.target.value }))} required maxLength={120} />
        </label>
        <label className="biz-field">
          <span className="biz-label">{t(lang, "contactName")}</span>
          <input className="biz-input" value={form.contactName} onChange={e => setForm(p => ({ ...p, contactName: e.target.value }))} required maxLength={80} />
        </label>
        <label className="biz-field">
          <span className="biz-label">{t(lang, "contactPhone")}</span>
          <input className="biz-input" type="tel" value={form.contactPhone} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))} required maxLength={20} />
        </label>
        {error && <div className="biz-error">{error}</div>}
        <div className="biz-actions">
          <button className="biz-btn primary block" disabled={busy}>{busy ? t(lang, "saving") : t(lang, "startSetup")}</button>
        </div>
      </form>
    </>
  );
}

export function Home({ lang, operator, onNavigate, newApplications = 0, feesDue = 0, showFees = false }) {
  const steps = computeSteps(operator);
  const pct = progressPercent(steps);
  const status = operator.status || "draft";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await submitForReview(operator.id);
    } catch (err) {
      setError(errorMessage(err, t(lang, "genericError")));
    } finally {
      setBusy(false);
    }
  };

  // First step that still needs the operator — highlighted as "next".
  const stepIds = stepsFor(operator);
  const nextStep = stepIds.find(id => steps[id] === "todo");

  return (
    <>
      <div className="biz-hero">
        <div className="biz-hero-top">
          <h1 className="biz-hero-name">{operator.profile?.businessName || t(lang, "brand")}</h1>
          <span className={`biz-pill ${status}`}>{t(lang, `statusLabel.${status}`)}</span>
        </div>
        <div className="biz-progress"><span style={{ width: `${pct}%` }} /></div>
        <p className="biz-muted">{t(lang, "progress", { percent: pct })} · {t(lang, "tagline")}</p>
      </div>

      {status === "live" && <div className="biz-banner success">{t(lang, operator.paymentMode === "direct" ? "liveBannerDirect" : "liveBanner")}</div>}
      {status === "suspended" && <div className="biz-banner danger">{t(lang, "suspendedBanner")}</div>}
      {status === "needs_changes" && (
        <div className="biz-banner danger">
          {t(lang, "changesNeeded")} {operator.review?.note || ""}
        </div>
      )}
      {status === "in_review" && <div className="biz-banner warning">{t(lang, "submitted")}</div>}

      {applicationsUnlocked(operator) && (
        <button type="button" className="biz-op-row" onClick={() => onNavigate("/biz/applications")}>
          <div className="biz-op-main">
            <div className="biz-op-name">📝 {t(lang, "applicationsTitle")}</div>
            <div className="biz-small">
              {operator.settings?.acceptingApplications === false ? t(lang, "acceptingOff") : t(lang, "acceptingOn")}
            </div>
          </div>
          {newApplications > 0 && <span className="biz-count">{newApplications}</span>}
          <span className="biz-chevron">›</span>
        </button>
      )}

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

      <div className="biz-card">
        <h2 className="biz-h2">{t(lang, "checklistTitle")}</h2>
        <ol className="biz-steps">
          {stepIds.map((id, index) => {
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
      </div>

      {["draft", "needs_changes"].includes(status) && (
        <div className="biz-card">
          <p className="biz-muted">{t(lang, "submitHint")}</p>
          {error && <div className="biz-error">{error}</div>}
          <div className="biz-actions">
            <button type="button" className="biz-btn dark block" disabled={busy || !canSubmitForReview(operator)} onClick={submit}>
              {t(lang, "submitForReview")}
            </button>
          </div>
        </div>
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
    setMeta('meta[name="description"]', "content", "For hostel and student-accommodation owners: get student applications from Kampasika, sign leases online and collect rent by mobile money straight into your own pawaPay account. Kiswahili and English.");
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
        <button type="button" className="biz-back" onClick={() => navigate(applicationsUnlocked(operator) ? "/biz/setup" : "/biz")}>‹ {t(lang, "back")}</button>
        <Step operator={operator} lang={lang} onDone={() => navigate(applicationsUnlocked(operator) ? "/biz/setup" : "/biz")} />
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
    body = <Home lang={lang} operator={operator} onNavigate={navigate} newApplications={newApplications} feesDue={feesDue} showFees={showFees} />;
  }

  const wide = route.view === "admin" || route.view === "adminDetail";
  const withNav = Boolean(operator && applicationsUnlocked(operator) && !wide);
  const navItems = withNav ? [
    { id: "home", icon: "▦", label: t(lang, "navOverview"), path: "/biz", on: route.view === "home" },
    { id: "applications", icon: "✎", label: t(lang, "navApplications"), path: "/biz/applications", on: ["applications", "applicationDetail", "createLease"].includes(route.view), count: newApplications },
    { id: "leases", icon: "▤", label: t(lang, "navLeases"), path: "/biz/leases", on: ["leases", "leaseTemplate", "lease"].includes(route.view), count: waitingLeases, countTone: "warn" },
    { id: "rent", icon: "◷", label: t(lang, "navRent"), path: "/biz/rent", on: route.view === "rent", count: overdueCharges },
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
                <span className={`biz-pill ${operator.status || "draft"}`}>{t(lang, `statusLabel.${operator.status || "draft"}`)}</span>
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
