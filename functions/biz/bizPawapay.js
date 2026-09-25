// ─── Kampasika Biz · pawaPay helpers ───
//
// Everything in here works with an OPERATOR's own pawaPay account, never
// Kampasika's (that one lives in PAWAPAY_API_TOKEN in index.js and is
// untouched by Biz). Money collected with these helpers settles straight to
// the operator — Kampasika only triggers the request and records the result.
//
// Operator API tokens are encrypted (AES-256-GCM) with BIZ_CREDENTIALS_KEY
// before they are written to Firestore, so even if a Firestore rule is ever
// too open the stored value is useless without the Functions secret.

const crypto = require("crypto");

const PAWAPAY_BASE_URLS = {
  sandbox: "https://api.sandbox.pawapay.io",
  production: "https://api.pawapay.io",
};

const ENVIRONMENTS = new Set(["sandbox", "production"]);

// Tanzania mobile-money providers pawaPay supports today. active-conf is
// the source of truth when we have it; this list is only the fallback.
const DEFAULT_TZ_PROVIDERS = [
  { provider: "VODACOM_TZA", displayName: "M-Pesa (Vodacom)" },
  { provider: "AIRTEL_TZA", displayName: "Airtel Money" },
  { provider: "TIGO_TZA", displayName: "Mixx by Yas (Tigo Pesa)" },
  { provider: "HALOTEL_TZA", displayName: "HaloPesa" },
];

function cleanEnvironment(value) {
  const env = String(value || "").trim().toLowerCase();
  return ENVIRONMENTS.has(env) ? env : "";
}

function baseUrlFor(environment) {
  return PAWAPAY_BASE_URLS[environment] || PAWAPAY_BASE_URLS.sandbox;
}

// ─── Token encryption ───
function keyFromSecret(secretValue) {
  if (!secretValue) throw new Error("BIZ_CREDENTIALS_KEY is not configured.");
  // Hashing lets any sufficiently random secret string work as the key.
  return crypto.createHash("sha256").update(String(secretValue)).digest();
}

// `binding` (operatorId + environment) is authenticated with the token, so
// an encrypted token copied onto another operator's record — or from
// sandbox to production — fails to decrypt instead of silently redirecting
// that operator's payments to someone else's pawaPay account.
function bindingFor(operatorId, environment) {
  return Buffer.from(`kampasika-biz:${operatorId}:${environment}`, "utf8");
}

function encryptToken(token, secretValue, operatorId, environment) {
  const key = keyFromSecret(secretValue);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(bindingFor(operatorId, environment));
  const ciphertext = Buffer.concat([cipher.update(String(token), "utf8"), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptToken(box, secretValue, operatorId, environment) {
  if (!box || !box.ciphertext) return "";
  const key = keyFromSecret(secretValue);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64"));
  decipher.setAAD(bindingFor(operatorId, environment));
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(box.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

// ─── Input cleaning (same rules as the group-payment helpers in index.js) ───
function normalizePhone(rawPhone) {
  const compact = String(rawPhone || "").replace(/\s+/g, "").replace(/-/g, "").replace(/^\+/, "");
  if (/^0[67]\d{8}$/.test(compact)) return `255${compact.slice(1)}`;
  if (/^255[67]\d{8}$/.test(compact)) return compact;
  return "";
}

function normalizeProvider(value) {
  const clean = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  const providers = {
    airtel: "AIRTEL_TZA",
    airtelmoney: "AIRTEL_TZA",
    airteltza: "AIRTEL_TZA",
    vodacom: "VODACOM_TZA",
    vodacomtza: "VODACOM_TZA",
    mpesa: "VODACOM_TZA",
    tigo: "TIGO_TZA",
    tigotza: "TIGO_TZA",
    tigopesa: "TIGO_TZA",
    yas: "TIGO_TZA",
    mixx: "TIGO_TZA",
    halotel: "HALOTEL_TZA",
    haloteltza: "HALOTEL_TZA",
    halopesa: "HALOTEL_TZA",
  };
  if (providers[clean]) return providers[clean];
  const upper = String(value || "").trim().toUpperCase();
  return DEFAULT_TZ_PROVIDERS.some(p => p.provider === upper) ? upper : "";
}

function cleanAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return String(Math.round(amount));
}

function cleanCustomerMessage(value, fallback) {
  const text = String(value || fallback || "").replace(/[^a-zA-Z0-9 ]+/g, "").trim().slice(0, 22);
  return text.length >= 4 ? text : "Kampasika Biz";
}

// ─── pawaPay API calls ───
async function pawaPayFetch(environment, token, path, options = {}) {
  const response = await fetch(`${baseUrlFor(environment)}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, payload };
}

// Checks a token really works and reads which merchant it belongs to.
// GET /v2/active-conf — https://docs.pawapay.io/v2/api-reference/toolkit/active-configuration
async function fetchActiveConfig(environment, token) {
  const result = await pawaPayFetch(environment, token, "/v2/active-conf?country=TZA&operationType=DEPOSIT", { method: "GET" });
  if (!result.ok || !result.payload) return { ok: false, status: result.status, payload: result.payload };

  const country = (result.payload.countries || []).find(c => c && c.country === "TZA");
  const providers = (country?.providers || []).map(p => ({
    provider: p.provider,
    displayName: p.displayName || p.nameDisplayedToCustomer || p.provider,
  })).filter(p => p.provider);

  return {
    ok: true,
    status: result.status,
    companyName: result.payload.companyName || "",
    signedCallbacks: !!result.payload.signatureConfiguration?.signedCallbacks,
    providers,
  };
}

async function createDeposit(environment, token, body) {
  return pawaPayFetch(environment, token, "/v2/deposits", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// GET /v2/deposits/{depositId} — the source of truth for a deposit's status.
async function checkDeposit(environment, token, depositId) {
  const result = await pawaPayFetch(environment, token, `/v2/deposits/${encodeURIComponent(depositId)}`, { method: "GET" });
  if (!result.ok || !result.payload) return { ok: false, status: result.status, payload: result.payload };
  if (result.payload.status !== "FOUND" || !result.payload.data) {
    return { ok: true, found: false, payload: result.payload };
  }
  return { ok: true, found: true, deposit: result.payload.data };
}

module.exports = {
  DEFAULT_TZ_PROVIDERS,
  cleanEnvironment,
  encryptToken,
  decryptToken,
  normalizePhone,
  normalizeProvider,
  cleanAmount,
  cleanCustomerMessage,
  fetchActiveConfig,
  createDeposit,
  checkDeposit,
};
