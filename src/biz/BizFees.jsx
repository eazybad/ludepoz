// Kampasika's own fees (functions/biz/bizBilling.js):
//   • Student service fee — shown on the lease, paid by the student right
//     after signing; the lease activates when it's paid (ServiceFeeBox).
//   • Owner placement fee — optional, off by default (/biz/fees, FeesBanner).
// "Create lease" shows the operator both (FeeNotice). Admin: pricing and all
// invoices on /biz/admin (AdminFees).
import { useEffect, useState } from "react";
import { t } from "./bizCopy";
import {
  TZ_PROVIDERS,
  adminWaiveInvoice,
  errorMessage,
  freePlacementsLeft,
  invoiceBalance,
  invoiceState,
  normalizePricing,
  payInvoice,
  placementFeeFor,
  refreshPlatformDeposit,
  savePricing,
  serviceFeeFor,
  subscribeAllInvoices,
  subscribeDeposit,
  subscribeInvoice,
  subscribeOperatorInvoices,
  subscribePricing,
} from "./bizService";

const isOwnerFee = (inv) => (inv?.kind || "placement") === "placement";

function tzs(n) {
  return `TZS ${Number(n || 0).toLocaleString("en-US")}`;
}

function fmtDate(iso, lang) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function usePricing() {
  const [pricing, setPricing] = useState(null);
  useEffect(() => subscribePricing(setPricing, () => setPricing(normalizePricing(null))), []);
  return pricing;
}

export function useOperatorInvoices(operatorId, enabled) {
  const [invoices, setInvoices] = useState(null);
  useEffect(() => {
    if (!operatorId || !enabled) { setInvoices([]); return undefined; }
    return subscribeOperatorInvoices(operatorId, setInvoices, err => { console.error(err); setInvoices([]); });
  }, [operatorId, enabled]);
  return invoices;
}

// "50% of one month's rent" / "TZS 20,000 per room filled"
export function feeRuleText(pricing, lang) {
  const fee = pricing?.placementFee;
  if (!fee?.enabled || !(fee.amount > 0)) return "";
  return fee.type === "fixed"
    ? t(lang, "feeRuleFixed", { amount: tzs(fee.amount) })
    : t(lang, "feeRulePercent", { percent: fee.amount });
}

// Shown on "Create lease": the student's service fee (and the optional owner fee).
export function FeeNotice({ operator, pricing, terms, lang }) {
  const numericTerms = { ...terms, rent: Number(terms?.rent || 0) };
  const service = serviceFeeFor(numericTerms, pricing?.serviceFee);
  const fee = pricing?.placementFee;
  const ownerFee = fee?.enabled && fee.amount > 0 ? placementFeeFor(numericTerms, fee) : 0;
  if (!service && !ownerFee) return null;
  const free = freePlacementsLeft(operator, pricing) > 0;
  return (
    <div className="biz-banner warning" style={{ marginTop: 16 }}>
      {service && (
        <>
          <strong>{t(lang, "serviceFeeOpTitle")}</strong>
          <div className="biz-small">{t(lang, "serviceFeeOpBody", { amount: tzs(service.amount) })}</div>
          <div className="biz-small" style={{ marginTop: 4 }}>{t(lang, "termsNoticeOwner")} <a href="/terms.html" target="_blank" rel="noopener noreferrer">{t(lang, "termsLink")}</a></div>
        </>
      )}
      {ownerFee > 0 && (
        <>
          <strong style={service ? { display: "block", marginTop: 8 } : undefined}>{t(lang, "feeNoticeTitle")}</strong>
          <div className="biz-small">
            {free
              ? t(lang, "feeNoticeFree", { amount: tzs(ownerFee) })
              : t(lang, "feeNoticeBody", { amount: tzs(ownerFee), days: fee.dueDays })}
          </div>
        </>
      )}
    </div>
  );
}

// On the lease page. Student: what the service fee is before signing, and the
// payment form after signing. Operator: that the lease waits for the fee.
export function ServiceFeeBox({ lease, user, lang }) {
  const [invoice, setInvoice] = useState(undefined);
  const isStudent = user?.uid === lease?.studentUid;
  const amount = Number(lease?.serviceFee?.amount || 0);
  const pending = lease?.status === "pending_fee";

  useEffect(() => {
    if (!pending || !lease?.id || !user) return undefined;
    return subscribeInvoice(`${lease.id}_service`, setInvoice, () => setInvoice(null));
  }, [pending, lease?.id, user]);

  // Links from the student app end in #service-fee.
  useEffect(() => {
    if (pending && window.location.hash === "#service-fee") {
      setTimeout(() => document.getElementById("service-fee")?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    }
  }, [pending]);

  if (!(amount > 0)) return null;

  if (lease.status === "sent" && isStudent) {
    return (
      <div className="biz-card biz-noprint">
        <h2 className="biz-h2">{t(lang, "serviceFeeTitle")}: {tzs(amount)}</h2>
        <p className="biz-small">{t(lang, "serviceFeeExplain", { percent: lease.serviceFee.percent })}</p>
        <p className="biz-small" style={{ marginTop: 6 }}>{t(lang, "termsNoticeStudent")} <a href="/terms.html" target="_blank" rel="noopener noreferrer">{t(lang, "termsLink")}</a></p>
      </div>
    );
  }
  if (!pending) return null;
  if (!isStudent) return <div className="biz-banner warning biz-noprint">{t(lang, "serviceFeeOpWaiting", { amount: tzs(amount) })}</div>;

  return (
    <div className="biz-card biz-noprint" id="service-fee">
      <h2 className="biz-h2">{t(lang, "serviceFeePayTitle")}</h2>
      <p className="biz-small">{t(lang, "serviceFeePayBody", { amount: tzs(amount) })}</p>
      {invoice === undefined && <div className="biz-small">{t(lang, "loading")}</div>}
      {invoice && invoice.status === "due" && <PayInvoiceForm invoice={invoice} lang={lang} onClose={() => {}} inline />}
    </div>
  );
}

// Top-of-page banner in Biz when a fee needs attention.
export function FeesBanner({ invoices, pricing, lang, onOpen }) {
  const due = (invoices || []).filter(i => isOwnerFee(i) && i.status === "due");
  if (!due.length) return null;
  const grace = pricing?.graceDays ?? 14;
  const blocking = due.some(i => invoiceState(i, grace) === "blocking");
  const total = due.reduce((s, i) => s + invoiceBalance(i), 0);
  return (
    <button type="button" className={`biz-banner ${blocking ? "danger" : "warning"}`} style={{ width: "100%", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }} onClick={onOpen}>
      <strong>{blocking ? t(lang, "feesBlockingTitle") : t(lang, "feesDueTitle", { amount: tzs(total) })}</strong>
      <div className="biz-small">{blocking ? t(lang, "feesBlockingBody", { amount: tzs(total) }) : t(lang, "feesDueBody")} ›</div>
    </button>
  );
}

function PayInvoiceForm({ invoice, lang, onClose, inline = false }) {
  const [form, setForm] = useState({ phone: "", provider: TZ_PROVIDERS[0].provider });
  const [depositId, setDepositId] = useState("");
  const [deposit, setDeposit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!depositId) return undefined;
    const unsub = subscribeDeposit(depositId, setDeposit, () => {});
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 24) { clearInterval(timer); return; }
      refreshPlatformDeposit(depositId).catch(() => {});
    }, 5000);
    return () => { unsub(); clearInterval(timer); };
  }, [depositId]);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await payInvoice({ invoiceId: invoice.id, phone: form.phone, provider: form.provider });
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
        <div className="biz-small">{tzs(invoiceBalance(invoice) || deposit?.amount)}{deposit?.environment === "sandbox" ? ` · ${t(lang, "payTestBadge")}` : ""}</div>
        <div className="biz-actions" style={{ marginTop: 8 }}>
          {status !== "paid" && status !== "failed" && <button type="button" className="biz-btn ghost small" onClick={() => refreshPlatformDeposit(depositId).catch(() => {})}>{t(lang, "checkStatus")}</button>}
          {status === "failed" && <button type="button" className="biz-btn ghost small" onClick={() => { setDepositId(""); setDeposit(null); }}>{t(lang, "tryAgain")}</button>}
          {status === "paid" && !inline && <button type="button" className="biz-btn ghost small" onClick={onClose}>OK</button>}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={send} style={{ marginTop: 10 }}>
      <div className="biz-row">
        <label className="biz-field"><span className="biz-label">{t(lang, "payPhone")}</span>
          <input className="biz-input" type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="07XX XXX XXX" required autoComplete="tel" /></label>
        <label className="biz-field"><span className="biz-label">{t(lang, "payNetwork")}</span>
          <select className="biz-select" value={form.provider} onChange={e => setForm(p => ({ ...p, provider: e.target.value }))}>
            {TZ_PROVIDERS.map(p => <option key={p.provider} value={p.provider}>{p.displayName}</option>)}
          </select></label>
      </div>
      {error && <div className="biz-error">{error}</div>}
      <div className="biz-actions">
        <button className="biz-btn primary" disabled={busy}>{busy ? t(lang, "sending") : `${t(lang, "feePay")} ${tzs(invoiceBalance(invoice))}`}</button>
        {!inline && <button type="button" className="biz-btn ghost" onClick={onClose}>{t(lang, "cancel")}</button>}
      </div>
    </form>
  );
}

function InvoiceRow({ invoice, lang, grace, canPay, admin }) {
  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const state = invoiceState(invoice, grace);
  const pill = state === "blocking" || state === "late" ? "charge-overdue" : state === "paid" || state === "free" ? "charge-paid" : state === "waived" ? "charge-waived" : "charge-due";

  const waive = async () => {
    setBusy(true);
    setError("");
    try { await adminWaiveInvoice(invoice.id, note); } catch (err) { setError(errorMessage(err, t(lang, "genericError"))); } finally { setBusy(false); }
  };

  return (
    <div className="biz-charge">
      <button type="button" className="biz-charge-main" onClick={() => setOpen(o => !o)}>
        <div className="biz-op-main">
          <div className="biz-op-name">{admin ? `${invoice.businessName || invoice.operatorId} · ` : ""}{invoice.tenantName || "—"}</div>
          {admin && <div className="biz-small"><strong>{isOwnerFee(invoice) ? t(lang, "feeKindPlacement") : t(lang, "feeKindService")}</strong></div>}
          <div className="biz-small">{invoice.roomLabel || invoice.leaseReference}</div>
          <div className="biz-small">{invoice.status === "free" ? t(lang, "feeFreeLabel") : t(lang, "dueOn", { date: fmtDate(invoice.dueDate, lang) })}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 800 }}>{tzs(invoice.status === "due" ? invoiceBalance(invoice) : invoice.amount)}</div>
          <span className={`biz-pill ${pill}`}>{t(lang, `feeStatus.${state}`)}</span>
        </div>
      </button>
      {open && (
        <div className="biz-charge-detail">
          <dl className="biz-kv">
            <dt>{t(lang, "leaseRefShort")}</dt><dd>{invoice.leaseReference || "—"}</dd>
            <dt>{t(lang, "feeBasis")}</dt>
            <dd>{invoice.pricing?.type === "service"
              ? t(lang, "serviceFeeBasis", { percent: invoice.pricing?.rate, total: tzs(invoice.pricing?.totalRent) })
              : invoice.pricing?.type === "fixed"
                ? t(lang, "feeRuleFixed", { amount: tzs(invoice.pricing?.rate) })
                : `${t(lang, "feeRulePercent", { percent: invoice.pricing?.rate })} (${tzs(invoice.pricing?.monthlyRent)})`}</dd>
            {invoice.freePlacement && <><dt>{t(lang, "feeListPrice")}</dt><dd>{tzs(invoice.listAmount)} → {tzs(0)}</dd></>}
            {(invoice.payments || []).map((p, i) => (
              <div key={i} style={{ display: "contents" }}><dt>{t(lang, "paid")}</dt><dd>{tzs(p.amount)} · {t(lang, `methods.${p.method}`) || p.method}{p.reference ? ` · ${p.reference}` : ""}</dd></div>
            ))}
            {invoice.status === "waived" && <><dt>{t(lang, "feeStatus.waived")}</dt><dd>{invoice.waivedNote || "—"}</dd></>}
          </dl>
          {canPay && invoice.status === "due" && !paying && (
            <div className="biz-actions" style={{ marginTop: 12 }}>
              <button type="button" className="biz-btn primary small" onClick={() => setPaying(true)}>📱 {t(lang, "feePay")} {tzs(invoiceBalance(invoice))}</button>
            </div>
          )}
          {paying && <PayInvoiceForm invoice={invoice} lang={lang} onClose={() => setPaying(false)} />}
          {admin && invoice.status === "due" && (
            <div style={{ marginTop: 10 }}>
              <textarea className="biz-textarea" placeholder={t(lang, "feeWaiveNote")} value={note} onChange={e => setNote(e.target.value)} maxLength={300} />
              <div className="biz-actions">
                <button type="button" className="biz-btn danger small" disabled={busy} onClick={waive}>{t(lang, "waive")}</button>
              </div>
            </div>
          )}
          {error && <div className="biz-error">{error}</div>}
        </div>
      )}
    </div>
  );
}

// ─── Operator: /biz/fees ───
export function FeesPage({ operator, lang, invoices: allInvoices, pricing }) {
  const invoices = allInvoices && allInvoices.filter(isOwnerFee);
  const grace = pricing?.graceDays ?? 14;
  const rule = feeRuleText(pricing, lang);
  const freeLeft = freePlacementsLeft(operator, pricing);
  const open = (invoices || []).filter(i => i.status === "due");
  const done = (invoices || []).filter(i => i.status !== "due");
  const paidTotal = (invoices || []).reduce((s, i) => s + Number(i.amountPaid || 0), 0);

  return (
    <>
      <h1 className="biz-h1">{t(lang, "feesTitle")}</h1>
      <p className="biz-muted">{t(lang, "feesIntro")}</p>

      <div className="biz-card">
        <h2 className="biz-h2">{t(lang, "feeHowTitle")}</h2>
        {rule
          ? (
            <ul className="biz-points">
              <li>{t(lang, "feeHowRule", { rule })}</li>
              <li>{t(lang, "feeHowWhen")}</li>
              {pricing.placementFee.freePlacements > 0 && <li>{t(lang, "feeHowFree", { count: pricing.placementFee.freePlacements, left: freeLeft })}</li>}
              <li>{t(lang, "feeHowDue", { days: pricing.placementFee.dueDays, grace })}</li>
              <li>{t(lang, "feeHowRent")}</li>
            </ul>
          )
          : <p className="biz-muted">{t(lang, "feeNoneYet")}</p>}
      </div>

      <div className="biz-tiles">
        <div className={`biz-tile ${open.length ? "bad" : ""}`}><span>{t(lang, "feeTileDue")}</span><strong>{tzs(open.reduce((s, i) => s + invoiceBalance(i), 0))}</strong></div>
        <div className="biz-tile"><span>{t(lang, "feeTilePlacements")}</span><strong>{Number(operator.billing?.placements || 0)}</strong></div>
        <div className="biz-tile"><span>{t(lang, "feeTilePaid")}</span><strong>{tzs(paidTotal)}</strong></div>
        <div className="biz-tile"><span>{t(lang, "feeTileFreeLeft")}</span><strong>{freeLeft}</strong></div>
      </div>

      {invoices === null && <div className="biz-center"><div><div className="biz-spinner" />{t(lang, "loading")}</div></div>}
      {invoices && invoices.length === 0 && <div className="biz-card"><p className="biz-muted">{t(lang, "feeEmpty")}</p></div>}
      {open.length > 0 && <h2 className="biz-h2" style={{ marginTop: 20 }}>{t(lang, "feeToPay")}</h2>}
      {open.map(i => <InvoiceRow key={i.id} invoice={i} lang={lang} grace={grace} canPay />)}
      {done.length > 0 && <h2 className="biz-h2" style={{ marginTop: 20 }}>{t(lang, "feeHistory")}</h2>}
      {done.map(i => <InvoiceRow key={i.id} invoice={i} lang={lang} grace={grace} />)}
    </>
  );
}

// ─── Admin: pricing + all invoices ───
export function AdminFees({ lang }) {
  const pricing = usePricing();
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invoices, setInvoices] = useState(null);
  const [filter, setFilter] = useState("due");

  useEffect(() => { if (pricing && !form) setForm(pricing); }, [pricing, form]);
  useEffect(() => subscribeAllInvoices(setInvoices, err => setError(errorMessage(err, t(lang, "genericError")))), [lang]);

  if (!form) return null;
  const fee = form.placementFee;
  const sfee = form.serviceFee;
  const setFee = (key, value) => { setSaved(false); setForm(p => ({ ...p, placementFee: { ...p.placementFee, [key]: value } })); };
  const setService = (key, value) => { setSaved(false); setForm(p => ({ ...p, serviceFee: { ...p.serviceFee, [key]: value } })); };
  const serviceExample = (months) => serviceFeeFor(
    { rent: 90000, rentPeriod: "month", startDate: "2026-01-01", endDate: new Date(Date.UTC(2026, months, 0)).toISOString().slice(0, 10) },
    { ...sfee, enabled: true, percent: Number(sfee.percent) || 0, capPercentOfMonth: Number(sfee.capPercentOfMonth) || 0 }
  )?.amount || 0;

  const save = async () => {
    setBusy(true);
    setError("");
    try { await savePricing(form); setSaved(true); } catch (err) { setError(errorMessage(err, t(lang, "genericError"))); } finally { setBusy(false); }
  };

  const example = placementFeeFor({ rent: 100000, rentPeriod: "month" }, { ...fee, enabled: true });
  const shown = (invoices || []).filter(i => filter === "all" || i.status === filter);
  const totals = (invoices || []).reduce((acc, i) => {
    acc.paid += Number(i.amountPaid || 0);
    if (i.status === "due") acc.due += invoiceBalance(i);
    return acc;
  }, { paid: 0, due: 0 });

  return (
    <>
      <div className="biz-card">
        <h2 className="biz-h2">{t(lang, "adminServiceTitle")}</h2>
        <label className="biz-check">
          <input type="checkbox" checked={sfee.enabled} onChange={e => setService("enabled", e.target.checked)} />
          <span><strong>{t(lang, "adminServiceEnabled")}</strong><span className="biz-small" style={{ display: "block" }}>{t(lang, "adminServiceEnabledHint")}</span></span>
        </label>
        <div className="biz-row">
          <label className="biz-field"><span className="biz-label">{t(lang, "adminServicePercent")}</span>
            <input className="biz-input" inputMode="decimal" value={sfee.percent} onChange={e => setService("percent", e.target.value.replace(/[^\d.]/g, ""))} /></label>
          <label className="biz-field"><span className="biz-label">{t(lang, "adminServiceCap")}</span>
            <input className="biz-input" inputMode="numeric" value={sfee.capPercentOfMonth} onChange={e => setService("capPercentOfMonth", e.target.value.replace(/[^\d]/g, ""))} /></label>
        </div>
        <p className="biz-small" style={{ marginTop: 8 }}>{t(lang, "adminServiceExample", { m3: tzs(serviceExample(3)), m6: tzs(serviceExample(6)), m10: tzs(serviceExample(10)) })}</p>
        <div className="biz-actions">
          <button type="button" className="biz-btn primary small" disabled={busy} onClick={save}>{busy ? t(lang, "saving") : saved ? t(lang, "saved") : t(lang, "save")}</button>
        </div>
      </div>

      <div className="biz-card">
        <h2 className="biz-h2">{t(lang, "adminPricingTitle")}</h2>
        <label className="biz-check">
          <input type="checkbox" checked={fee.enabled} onChange={e => setFee("enabled", e.target.checked)} />
          <span><strong>{t(lang, "adminPricingEnabled")}</strong><span className="biz-small" style={{ display: "block" }}>{t(lang, "adminPricingEnabledHint")}</span></span>
        </label>
        <div className="biz-row">
          <label className="biz-field"><span className="biz-label">{t(lang, "adminPricingType")}</span>
            <select className="biz-select" value={fee.type} onChange={e => setFee("type", e.target.value)}>
              <option value="percent">{t(lang, "adminPricingPercent")}</option>
              <option value="fixed">{t(lang, "adminPricingFixed")}</option>
            </select></label>
          <label className="biz-field"><span className="biz-label">{fee.type === "fixed" ? "TZS" : "%"}</span>
            <input className="biz-input" inputMode="numeric" value={fee.amount} onChange={e => setFee("amount", e.target.value.replace(/[^\d.]/g, ""))} /></label>
        </div>
        <div className="biz-row">
          <label className="biz-field"><span className="biz-label">{t(lang, "adminPricingFree")}</span>
            <input className="biz-input" inputMode="numeric" value={fee.freePlacements} onChange={e => setFee("freePlacements", e.target.value.replace(/[^\d]/g, ""))} /></label>
          <label className="biz-field"><span className="biz-label">{t(lang, "adminPricingDueDays")}</span>
            <input className="biz-input" inputMode="numeric" value={fee.dueDays} onChange={e => setFee("dueDays", e.target.value.replace(/[^\d]/g, ""))} /></label>
        </div>
        <div className="biz-row">
          <label className="biz-field"><span className="biz-label">{t(lang, "adminPricingGrace")}</span>
            <input className="biz-input" inputMode="numeric" value={form.graceDays} onChange={e => { setSaved(false); setForm(p => ({ ...p, graceDays: e.target.value.replace(/[^\d]/g, "") })); }} /></label>
          <label className="biz-field"><span className="biz-label">{t(lang, "adminPricingEnv")}</span>
            <select className="biz-select" value={form.platformEnvironment} onChange={e => { setSaved(false); setForm(p => ({ ...p, platformEnvironment: e.target.value })); }}>
              <option value="sandbox">sandbox</option>
              <option value="production">production</option>
            </select></label>
        </div>
        <p className="biz-small" style={{ marginTop: 8 }}>{t(lang, "adminPricingExample", { amount: tzs(example) })} {t(lang, "adminPricingEnvHint")}</p>
        {error && <div className="biz-error">{error}</div>}
        <div className="biz-actions">
          <button type="button" className="biz-btn primary small" disabled={busy} onClick={save}>{busy ? t(lang, "saving") : saved ? t(lang, "saved") : t(lang, "save")}</button>
        </div>
      </div>

      <h2 className="biz-h2" style={{ marginTop: 20 }}>{t(lang, "adminInvoicesTitle")}</h2>
      <p className="biz-small">{t(lang, "adminInvoicesTotals", { paid: tzs(totals.paid), due: tzs(totals.due) })}</p>
      <div className="biz-tabs">
        {["due", "paid", "free", "waived", "all"].map(f => (
          <button key={f} type="button" className={`biz-tab ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? t(lang, "adminFilterAll") : t(lang, `feeStatus.${f}`)}
          </button>
        ))}
      </div>
      {invoices && shown.length === 0 && <div className="biz-card"><p className="biz-muted">{t(lang, "noCharges")}</p></div>}
      {shown.map(i => <InvoiceRow key={i.id} invoice={i} lang={lang} grace={form.graceDays} admin />)}
    </>
  );
}
