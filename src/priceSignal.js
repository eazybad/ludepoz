// ═══════════════════════════════════════════════════════════════════════
// KAMPASIKA PRICE SIGNAL
// ═══════════════════════════════════════════════════════════════════════
//
// Tells a student/parent: "This price is fair / above average / below average"
// compared to similar items. No AI needed — just a median calculation over
// comparable listings.
//
// This is the single most anti-exploitation feature in the app. Brokers
// profit from information asymmetry. A simple market-median signal arms
// students with exactly what brokers spend their career hiding.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Compute the fair-price signal for a single item.
 *
 * @param {object} target - the item being viewed (has price, category, roomType, location...)
 * @param {array}  pool   - all items of the same kind (all listings, or all rooms)
 * @param {string} kind   - "listing" | "room"
 * @returns {object|null} - { verdict, median, min, max, delta, percent, sampleSize } or null if not enough data
 */
export function computePriceSignal(target, pool, kind = "listing") {
  if (!target || !target.price || !Array.isArray(pool)) return null;

  // Find comparable items
  let comparable = pool.filter((item) => {
    if (!item || !item.price || item.id === target.id) return false;
    if (kind === "listing") {
      // Same category
      return item.category === target.category;
    } else if (kind === "room") {
      // Same room type AND (if location known) reasonable location overlap
      if (item.roomType !== target.roomType) return false;
      if (target.location && item.location) {
        // Crude location match — shared keyword
        const tKeywords = target.location.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
        const iLoc = item.location.toLowerCase();
        const overlap = tKeywords.some(k => iLoc.includes(k));
        if (!overlap && tKeywords.length > 0) return false;
      }
      return true;
    }
    return false;
  });

  // Need at least 3 comparable items to compute a meaningful signal
  if (comparable.length < 3) return null;

  const prices = comparable.map((i) => i.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  const min = prices[0];
  const max = prices[prices.length - 1];
  const delta = target.price - median;
  const percent = Math.round((delta / median) * 100);

  // Classify
  let verdict;
  if (percent <= -15) verdict = "great_deal";
  else if (percent <= -5) verdict = "below_average";
  else if (percent <= 10) verdict = "fair";
  else if (percent <= 25) verdict = "above_average";
  else verdict = "overpriced";

  return {
    verdict,
    median,
    min,
    max,
    delta,
    percent,
    sampleSize: comparable.length,
    targetPrice: target.price,
  };
}

/**
 * Build the human-readable message for a signal.
 * Bilingual — Swahili primary, with English fallback in parentheses.
 */
export function signalMessage(signal) {
  if (!signal) return null;
  const { verdict, median, sampleSize, percent } = signal;

  const medianFmt = median.toLocaleString() + " TSh";
  const range = `vitu vingine vinauzwa ~${medianFmt} (${sampleSize} comparisons)`;

  switch (verdict) {
    case "great_deal":
      return {
        icon: "💚",
        color: "#047857",
        bg: "#ecfdf5",
        label: "Bei nzuri sana!",
        detail: `${Math.abs(percent)}% chini ya wastani. ${range}.`,
      };
    case "below_average":
      return {
        icon: "✓",
        color: "#059669",
        bg: "#f0fdf4",
        label: "Bei nzuri",
        detail: `${Math.abs(percent)}% chini ya wastani. ${range}.`,
      };
    case "fair":
      return {
        icon: "✓",
        color: "#0f766e",
        bg: "#f0fdfa",
        label: "Bei ya wastani",
        detail: `Sambamba na soko. ${range}.`,
      };
    case "above_average":
      return {
        icon: "⚠",
        color: "#b45309",
        bg: "#fef3c7",
        label: "Bei juu kidogo",
        detail: `${percent}% juu ya wastani. ${range}.`,
      };
    case "overpriced":
      return {
        icon: "⚠",
        color: "#b91c1c",
        bg: "#fef2f2",
        label: "Bei juu sana",
        detail: `${percent}% juu ya wastani. ${range}. Jaribu kujadiliana.`,
      };
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// UI BADGE — drop in next to the price on any listing/room card
// ─────────────────────────────────────────────────────────────────────
export function PriceSignalBadge({ signal, compact = false }) {
  const msg = signalMessage(signal);
  if (!msg) return null;

  if (compact) {
    // Compact version for card grids
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: "4px",
        background: msg.bg, color: msg.color,
        padding: "2px 8px", borderRadius: "6px",
        fontSize: "10px", fontWeight: "600",
        whiteSpace: "nowrap",
      }}>
        {msg.icon} {msg.label}
      </span>
    );
  }

  // Full version for detail pages
  return (
    <div style={{
      background: msg.bg,
      border: `1px solid ${msg.color}20`,
      borderRadius: "10px",
      padding: "10px 12px",
      margin: "8px 0",
      display: "flex",
      alignItems: "flex-start",
      gap: "8px",
    }}>
      <span style={{ fontSize: "16px", lineHeight: 1, flexShrink: 0 }}>{msg.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: "700", color: msg.color, marginBottom: "2px" }}>
          {msg.label}
        </div>
        <div style={{ fontSize: "11px", color: "#6b7280", lineHeight: 1.4 }}>
          {msg.detail}
        </div>
      </div>
    </div>
  );
}
