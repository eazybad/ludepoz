// The "Open Kampasika Biz" card shown inside the student app, on the
// landlord tabs (My Properties / My Rooms). Deliberately has no Firebase or
// Biz imports, so it adds almost nothing to the main bundle — tapping it does
// a full navigation to /biz, which loads the Biz code on its own.

export function BizEntryCard() {
  return (
    <a
      href="/biz"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "14px",
        borderRadius: "14px",
        background: "linear-gradient(135deg, #0f1b2d 0%, #13324a 100%)",
        color: "#fff",
        textDecoration: "none",
      }}
    >
      <span
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "11px",
          background: "#06d6c7",
          color: "#0f1b2d",
          display: "grid",
          placeItems: "center",
          fontWeight: 900,
          fontSize: "18px",
          flex: "none",
        }}
      >
        K
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 800, fontSize: "15px" }}>
          Kampasika Biz
          <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: "999px", background: "#fbbf24", color: "#0f1b2d" }}>
            NEW
          </span>
        </span>
        <span style={{ display: "block", fontSize: "12.5px", color: "rgba(255,255,255,0.8)", marginTop: "2px", lineHeight: 1.35 }}>
          Pokea kodi moja kwa moja kwenye akaunti yako · Collect rent straight to your own account
        </span>
      </span>
      <span style={{ fontSize: "20px", opacity: 0.8 }}>›</span>
    </a>
  );
}
