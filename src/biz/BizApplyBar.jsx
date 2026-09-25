// "Apply for this room" — shown on a room in the student app when the
// room's landlord runs their hostel on Kampasika Biz (Kampasika has approved
// their documents and they're accepting applications).
//
// Lives in the main bundle, so it must NOT import ./bizFirebase: App.js
// sets Firestore up with its own options, and touching Firestore before that
// would break it. db and functions are passed in from App.js instead.

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

const STATUS_TEXT = {
  submitted: { label: "Ombi limetumwa · Application sent", color: "#92400e", bg: "#fef3c7" },
  shortlisted: { label: "Umechaguliwa awali · Shortlisted", color: "#1e40af", bg: "#dbeafe" },
  approved: { label: "Limekubaliwa · Approved 🎉", color: "#0f766e", bg: "#ccfbf1" },
  rejected: { label: "Halikufanikiwa · Not successful", color: "#991b1b", bg: "#fee2e2" },
  withdrawn: { label: "Umeondoa ombi · Withdrawn", color: "#374151", bg: "#e5e7eb" },
};

const DURATIONS = [
  { id: "semester", label: "Semester moja · One semester" },
  { id: "academic_year", label: "Mwaka wa masomo · Academic year" },
  { id: "monthly", label: "Kila mwezi · Month to month" },
  { id: "other", label: "Nyingine · Other" },
];

const inputStyle = {
  width: "100%",
  padding: "12px",
  border: "1.5px solid var(--border-color)",
  borderRadius: "10px",
  fontSize: "16px",
  outline: "none",
  background: "var(--surface-bg)",
  color: "var(--text-primary)",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const labelStyle = { display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", margin: "12px 0 6px" };

function callableError(err) {
  const msg = err?.message || "";
  return !msg || msg === "internal" ? "Imeshindikana. Jaribu tena. (Something went wrong.)" : msg;
}

export function BizApplyBar({ db, functions, room, user, userName, userPhone, roomLabel, canAccess, onNeedAccess, requireAuth, isOffline }) {
  const [business, setBusiness] = useState(null); // { operatorId, businessName, ... }
  const [application, setApplication] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: userName || "",
    phone: userPhone || "",
    university: room?.nearUni || "",
    course: "",
    yearOfStudy: "",
    regNumber: "",
    moveInDate: "",
    duration: "semester",
    message: "",
  });

  const roomId = room?.id;

  // Work out who owns the room and whether they take Biz applications.
  useEffect(() => {
    let cancelled = false;
    setBusiness(null);
    setApplication(null);
    if (!roomId || room?.available === false) return undefined;
    (async () => {
      try {
        let operatorId = room.userId || room.listedBy || "";
        if (room.propertyId) {
          const prop = await getDoc(doc(db, "properties", room.propertyId));
          if (prop.exists() && prop.data()?.ownerId) operatorId = prop.data().ownerId;
        }
        if (!operatorId || (user && operatorId === user.uid)) return;
        const pub = await getDoc(doc(db, "bizPublic", operatorId));
        if (cancelled || !pub.exists() || pub.data()?.acceptingApplications === false) return;
        setBusiness({ operatorId, ...pub.data() });
      } catch (_) { /* not a Biz room, or offline — just don't show the bar */ }
    })();
    return () => { cancelled = true; };
  }, [db, roomId, room?.propertyId, room?.userId, room?.listedBy, room?.available, user]);

  // The student's existing application for this room, if any.
  useEffect(() => {
    let cancelled = false;
    if (!business || !user || !roomId) return undefined;
    getDoc(doc(db, "bizApplications", `${roomId}_${user.uid}`))
      .then(snap => { if (!cancelled && snap.exists()) setApplication({ id: snap.id, ...snap.data() }); })
      .catch(() => {}); // no application yet reads as permission-denied
    return () => { cancelled = true; };
  }, [db, business, user, roomId]);

  useEffect(() => {
    setForm(prev => ({ ...prev, name: prev.name || userName || "", phone: prev.phone || userPhone || "" }));
  }, [userName, userPhone]);

  if (!business) return null;

  const status = application?.status;
  const canApply = !status || status === "rejected" || status === "withdrawn";
  const statusStyle = STATUS_TEXT[status];

  const startApply = () => {
    if (!canAccess) { onNeedAccess?.(); return; }
    requireAuth("apply", () => { setError(""); setOpen(true); });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const fn = httpsCallable(functions, "bizSubmitApplication");
      const res = await fn({ roomId, ...form });
      setApplication({ id: res.data.appId, status: res.data.status });
      setOpen(false);
    } catch (err) {
      setError(callableError(err));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (!application?.id) return;
    setBusy(true);
    setError("");
    try {
      const fn = httpsCallable(functions, "bizWithdrawApplication");
      await fn({ applicationId: application.id });
      setApplication(prev => ({ ...prev, status: "withdrawn" }));
    } catch (err) {
      setError(callableError(err));
    } finally {
      setBusy(false);
    }
  };

  const set = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));

  return (
    <>
      <div style={{ margin: "0 16px 16px", padding: "14px", borderRadius: "14px", background: "var(--surface-bg)", border: "1.5px solid #06d6c7" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ width: "34px", height: "34px", borderRadius: "10px", background: "#0f1b2d", color: "#06d6c7", display: "grid", placeItems: "center", fontWeight: 900, flex: "none" }}>K</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--text-primary)" }}>
              {business.businessName || "Verified hostel"} <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: "999px", background: "#ccfbf1", color: "#0f766e", verticalAlign: "middle" }}>BIZ ✓</span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
              Omba chumba hiki mtandaoni · Apply for this room online
            </div>
          </div>
        </div>
        {statusStyle && (
          <div style={{ marginTop: "12px", padding: "8px 10px", borderRadius: "8px", background: statusStyle.bg, color: statusStyle.color, fontSize: "13px", fontWeight: 700 }}>
            {statusStyle.label}
          </div>
        )}
        {application?.lease && ["sent", "signed"].includes(application.lease.status) && (
          <a
            href={`/biz/lease/${application.lease.id}${application.lease.status === "signed" ? "#rent" : ""}`}
            style={{ display: "block", marginTop: "10px", padding: "12px", borderRadius: "10px", textAlign: "center", textDecoration: "none", fontWeight: 800, fontSize: "14px", background: application.lease.status === "sent" ? "#0d9488" : "var(--surface-bg-alt)", color: application.lease.status === "sent" ? "#fff" : "var(--text-primary)", border: application.lease.status === "sent" ? "none" : "1px solid var(--border-color)" }}
          >
            {application.lease.status === "sent" ? "📄 Soma na saini mkataba · Read & sign lease" : "📄 Mkataba na kodi · Lease & rent payments"}
          </a>
        )}
        {error && !open && <div style={{ color: "#ef4444", fontSize: "13px", marginTop: "8px" }}>{error}</div>}
        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
          {application?.lease?.status === "signed" ? null : canApply ? (
            <button type="button" onClick={startApply} disabled={isOffline} style={{ flex: 1, padding: "13px", borderRadius: "10px", border: "none", background: isOffline ? "var(--border-color)" : "#0f1b2d", color: "#fff", fontSize: "15px", fontWeight: 700, cursor: isOffline ? "not-allowed" : "pointer" }}>
              {status ? "Omba tena · Apply again" : "📝 Omba · Apply"}
            </button>
          ) : (
            <button type="button" onClick={withdraw} disabled={busy || isOffline} style={{ flex: 1, padding: "11px", borderRadius: "10px", border: "1px solid var(--border-color)", background: "var(--surface-bg-alt)", color: "var(--text-primary)", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
              {busy ? "…" : "Ondoa ombi · Withdraw"}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(15,27,45,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => !busy && setOpen(false)}>
          <form
            onSubmit={submit}
            onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "560px", maxHeight: "92vh", overflowY: "auto", background: "var(--surface-bg)", borderRadius: "18px 18px 0 0", padding: "18px 16px calc(18px + env(safe-area-inset-bottom, 0px))", boxSizing: "border-box" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary)" }}>Omba chumba · Apply</div>
              <button type="button" onClick={() => setOpen(false)} style={{ border: "none", background: "var(--surface-bg-alt)", width: "32px", height: "32px", borderRadius: "50%", fontSize: "16px", cursor: "pointer", color: "var(--text-primary)" }}>✕</button>
            </div>
            <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
              {roomLabel}{room.location ? ` · ${room.location}` : ""} · {business.businessName}
            </div>

            <label style={labelStyle}>Jina kamili · Full name</label>
            <input style={inputStyle} value={form.name} onChange={set("name")} required maxLength={80} autoComplete="name" />
            <label style={labelStyle}>Namba ya simu · Phone</label>
            <input style={inputStyle} value={form.phone} onChange={set("phone")} required type="tel" placeholder="07XX XXX XXX" autoComplete="tel" />
            <label style={labelStyle}>Chuo · University</label>
            <input style={inputStyle} value={form.university} onChange={set("university")} required maxLength={80} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 10px" }}>
              <div>
                <label style={labelStyle}>Kozi · Course</label>
                <input style={inputStyle} value={form.course} onChange={set("course")} maxLength={80} />
              </div>
              <div>
                <label style={labelStyle}>Mwaka · Year</label>
                <input style={inputStyle} value={form.yearOfStudy} onChange={set("yearOfStudy")} maxLength={20} placeholder="1, 2, 3…" />
              </div>
            </div>
            <label style={labelStyle}>Namba ya usajili · Reg. number <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>(si lazima · optional)</span></label>
            <input style={inputStyle} value={form.regNumber} onChange={set("regNumber")} maxLength={40} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 10px" }}>
              <div>
                <label style={labelStyle}>Kuhamia lini · Move-in</label>
                <input style={inputStyle} value={form.moveInDate} onChange={set("moveInDate")} type="date" />
              </div>
              <div>
                <label style={labelStyle}>Muda · Stay</label>
                <select style={inputStyle} value={form.duration} onChange={set("duration")}>
                  {DURATIONS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </div>
            </div>
            <label style={labelStyle}>Ujumbe kwa mwenye hosteli · Message <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>(si lazima · optional)</span></label>
            <textarea style={{ ...inputStyle, minHeight: "70px", resize: "vertical" }} value={form.message} onChange={set("message")} maxLength={600} />

            {error && <div style={{ color: "#ef4444", fontSize: "13px", marginTop: "10px" }}>{error}</div>}
            <button type="submit" disabled={busy} style={{ width: "100%", marginTop: "16px", padding: "15px", borderRadius: "12px", border: "none", background: "#0d9488", color: "#fff", fontSize: "16px", fontWeight: 800, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
              {busy ? "Inatuma… · Sending…" : "Tuma ombi · Send application"}
            </button>
            <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", marginTop: "8px", textAlign: "center" }}>
              Taarifa zako zinaonekana kwa mwenye hosteli hii pekee · Only this landlord sees your details.
            </div>
          </form>
        </div>
      )}
    </>
  );
}
