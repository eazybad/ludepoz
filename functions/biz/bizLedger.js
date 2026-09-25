// ─── Kampasika Biz · rent ledger helpers ───
// Shared by bizFunctions.js (pawaPay deposits) and bizRent.js (charges,
// manual payments), kept separate so neither module requires the other.

const admin = require("firebase-admin");

const db = () => admin.firestore();
const FieldValue = () => admin.firestore.FieldValue;

function chargeStatus(amount, amountPaid, current) {
  if (current === "waived") return "waived";
  if (amountPaid >= amount) return "paid";
  if (amountPaid > 0) return "partial";
  return "due";
}

function formatTzs(n) {
  return `TZS ${Number(n || 0).toLocaleString("en-US")}`;
}

// Adds one payment to a charge. When it comes from a pawaPay deposit, the
// deposit is marked appliedToCharge in the same transaction, so a callback
// and a manual "check status" arriving together can't count it twice.
async function applyPaymentToCharge(chargeId, payment, { depositId } = {}) {
  const chargeRef = db().collection("bizCharges").doc(chargeId);
  const depositRef = depositId ? db().collection("bizDeposits").doc(depositId) : null;

  const result = await db().runTransaction(async tx => {
    const chargeSnap = await tx.get(chargeRef);
    if (!chargeSnap.exists) return null;
    if (depositRef) {
      const depositSnap = await tx.get(depositRef);
      if (!depositSnap.exists || depositSnap.data()?.appliedToCharge) return null;
    }
    const charge = chargeSnap.data() || {};
    const amountPaid = Number(charge.amountPaid || 0) + Number(payment.amount || 0);
    const status = chargeStatus(Number(charge.amount || 0), amountPaid, charge.status);
    const update = {
      amountPaid,
      status,
      payments: FieldValue().arrayUnion({ ...payment, at: payment.at || new Date().toISOString() }),
      updatedAt: FieldValue().serverTimestamp(),
    };
    if (status === "paid") update.paidAt = FieldValue().serverTimestamp();
    tx.update(chargeRef, update);
    if (depositRef) tx.update(depositRef, { appliedToCharge: true, updatedAt: FieldValue().serverTimestamp() });
    return { charge: { ...charge, amountPaid, status }, amount: Number(payment.amount || 0) };
  });

  if (result) {
    const { charge, amount } = result;
    const label = `${charge.label || "Rent"}${charge.roomLabel ? ` · ${charge.roomLabel}` : ""}`;
    const notes = [
      { userId: charge.operatorId, title: "Kampasika Biz · Payment received", message: `${charge.tenantName || "A tenant"} paid ${formatTzs(amount)} for ${label}.` },
      { userId: charge.studentUid, title: "Payment received", message: `${formatTzs(amount)} received for ${label}. ${charge.status === "paid" ? "Fully paid ✓" : `Balance ${formatTzs(charge.amount - charge.amountPaid)}.`}` },
    ];
    await Promise.all(notes.map(n => db().collection("notifications").add({
      ...n, type: "biz_rent", chargeId, read: false, createdAt: FieldValue().serverTimestamp(),
    }).catch(() => {})));
  }
  return result;
}

module.exports = { applyPaymentToCharge, chargeStatus, formatTzs };
