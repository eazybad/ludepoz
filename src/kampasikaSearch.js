// ═══════════════════════════════════════════════════════════════════════
// KAMPASIKA AI SEARCH — Frontend
// ═══════════════════════════════════════════════════════════════════════
//
// What this does:
//   1. shouldUseAI(query) — heuristic that decides if query needs AI parsing
//   2. parseWithAI(query) — calls the Firebase Function if needed
//   3. applyFilters(items, parsed, type) — filters listings/services/rooms/collections
//   4. useKampasikaSearch() — React hook that ties it all together
//
// The UX goal: user types in ONE search bar. Magic happens. They never see
// the AI unless it helps them.
// ═══════════════════════════════════════════════════════════════════════

import { useState, useCallback, useRef } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";

// ─────────────────────────────────────────────────────────────────────
// HEURISTIC: does this query need AI, or is keyword match enough?
// ─────────────────────────────────────────────────────────────────────
// Tuning philosophy: err on the side of NOT using AI. Keyword match is
// instant and free. AI only wins when it can extract real filters.

export function shouldUseAI(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q || q.length < 2) return false;

  // Price signals — strong indicator AI helps
  const priceSignals = /\b(chini ya|juu ya|kati ya|under|above|below|between|over)\b|\d+\s*k\b|\d+\s*m\b|elfu|laki|milioni|tsh/i;
  if (priceSignals.test(q)) return true;

  // Location signals
  const locationSignals = /\b(karibu na|near|around|in|at|mlimani|kijitonyama|ubungo|mbezi|kinondoni|survey|aru|udsm)\b/i;
  if (locationSignals.test(q)) return true;

  // Room/housing descriptor signals
  const roomSignals = /\b(master|single|self|contained|ensuite|na wifi|na choo|furnished|samani|apartment|nyumba)\b/i;
  if (roomSignals.test(q)) return true;

  // Multi-word descriptive queries (3+ meaningful words)
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  if (words.length >= 3) return true;

  // Swahili phrase markers
  const swahiliPhrase = /\b(cha|ya|wa|za|kwa|na|au)\b/i;
  if (swahiliPhrase.test(q) && words.length >= 2) return true;

  // Otherwise — simple keyword, no AI needed
  return false;
}

// ─────────────────────────────────────────────────────────────────────
// Call the Firebase Function
// ─────────────────────────────────────────────────────────────────────
export async function parseWithAI(app, query) {
  const functions = getFunctions(app);
  const searchFn = httpsCallable(functions, "kampasikaSearch");
  const result = await searchFn({ query });
  return result.data; // { intent, keywords, filters, rewritten, fallback? }
}

// ─────────────────────────────────────────────────────────────────────
// Turn any query into a normalized parsed shape (AI or local)
// ─────────────────────────────────────────────────────────────────────
export function localParse(query) {
  const q = (query || "").trim().toLowerCase();
  return {
    intent: "any",
    keywords: q.split(/\s+/).filter((w) => w.length > 1),
    filters: {
      maxPrice: null, minPrice: null, category: null,
      serviceCategory: null, roomType: null, amenities: [],
      location: null, sizeOrOption: null,
    },
    rewritten: query,
    local: true,
  };
}

// ─────────────────────────────────────────────────────────────────────
// FILTER APPLIERS
// Each takes a list of items + parsed search + returns filtered items.
// The returned items also get a `_score` used for ranking.
// ─────────────────────────────────────────────────────────────────────

function scoreMatch(item, keywords, searchableFields) {
  if (!keywords || keywords.length === 0) return 1;
  const haystack = searchableFields
    .map((f) => (item[f] || "").toString().toLowerCase())
    .join(" ");
  let score = 0;
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    if (!k) continue;
    // Exact word match — high score
    if (new RegExp(`\\b${escapeRegex(k)}\\b`, "i").test(haystack)) score += 3;
    // Substring match — lower score
    else if (haystack.includes(k)) score += 1;
  }
  return score;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── LISTINGS ──
export function filterListings(listings, parsed) {
  const { intent, keywords, filters } = parsed;
  // If user was clearly searching for something non-listing, exclude
  if (intent !== "any" && intent !== "listing") return [];

  return listings
    .map((item) => {
      // Price filter
      if (filters.maxPrice != null && item.price > filters.maxPrice) return null;
      if (filters.minPrice != null && item.price < filters.minPrice) return null;
      // Category filter
      if (filters.category && item.category !== filters.category) return null;
      // Keyword scoring
      const score = scoreMatch(item, keywords, ["title", "description", "category"]);
      if (keywords.length > 0 && score === 0) return null;
      return { ...item, _score: score };
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score);
}

// ── SERVICES ──
export function filterServices(services, parsed) {
  const { intent, keywords, filters } = parsed;
  if (intent !== "any" && intent !== "service") return [];

  return services
    .map((item) => {
      if (filters.maxPrice != null && item.price && item.price > filters.maxPrice) return null;
      if (filters.minPrice != null && item.price && item.price < filters.minPrice) return null;
      if (filters.serviceCategory && item.category !== filters.serviceCategory) return null;

      const score = scoreMatch(item, keywords, ["title", "description", "category", "location"]);
      // Location bonus
      let locationScore = 0;
      if (filters.location && item.location) {
        if (item.location.toLowerCase().includes(filters.location.toLowerCase())) locationScore = 5;
      }
      const totalScore = score + locationScore;
      if (keywords.length > 0 && totalScore === 0) return null;
      return { ...item, _score: totalScore };
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score);
}

// ── ROOMS ──
export function filterRooms(rooms, parsed) {
  const { intent, keywords, filters } = parsed;
  if (intent !== "any" && intent !== "room") return [];

  return rooms
    .map((item) => {
      if (filters.maxPrice != null && item.price > filters.maxPrice) return null;
      if (filters.minPrice != null && item.price < filters.minPrice) return null;
      if (filters.roomType && item.type !== filters.roomType) return null;

      // Amenity filter — require ALL requested amenities
      if (filters.amenities && filters.amenities.length > 0) {
        const itemAmenities = item.amenities || [];
        const hasAll = filters.amenities.every((a) => itemAmenities.includes(a));
        if (!hasAll) return null;
      }

      const score = scoreMatch(item, keywords, ["title", "description", "location", "type"]);
      let locationScore = 0;
      if (filters.location && item.location) {
        if (item.location.toLowerCase().includes(filters.location.toLowerCase())) locationScore = 5;
      }
      const totalScore = score + locationScore;
      if (keywords.length > 0 && totalScore === 0 && !filters.roomType && filters.amenities.length === 0) return null;
      return { ...item, _score: Math.max(totalScore, 1) };
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score);
}

// ── COLLECTIONS ──
export function filterCollections(collections, parsed) {
  const { intent, keywords, filters } = parsed;
  if (intent !== "any" && intent !== "collection") return [];

  return collections
    .map((item) => {
      if (filters.maxPrice != null && item.price > filters.maxPrice) return null;
      if (filters.minPrice != null && item.price < filters.minPrice) return null;
      const score = scoreMatch(item, keywords, ["title", "description"]);
      if (keywords.length > 0 && score === 0) return null;
      return { ...item, _score: score };
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score);
}

// ─────────────────────────────────────────────────────────────────────
// REACT HOOK — the thing your App.jsx actually calls
// ─────────────────────────────────────────────────────────────────────

export function useKampasikaSearch(app) {
  const [parsed, setParsed] = useState(null);
  const [isAIActive, setIsAIActive] = useState(false); // true if last parse used AI
  const [isSearching, setIsSearching] = useState(false);
  const [aiError, setAiError] = useState(null);
  const lastQueryRef = useRef("");

  const search = useCallback(async (query) => {
    const trimmed = (query || "").trim();
    lastQueryRef.current = trimmed;
    setAiError(null);

    if (!trimmed) {
      setParsed(null);
      setIsAIActive(false);
      return null;
    }

    // Decide: AI or local?
    if (shouldUseAI(trimmed)) {
      setIsSearching(true);
      try {
        const result = await parseWithAI(app, trimmed);
        // If query changed while we were waiting, ignore stale result
        if (lastQueryRef.current !== trimmed) return null;
        setParsed(result);
        setIsAIActive(!result.fallback);
        return result;
      } catch (err) {
        console.error("AI search failed, falling back:", err);
        setAiError(err.message);
        const local = localParse(trimmed);
        setParsed(local);
        setIsAIActive(false);
        return local;
      } finally {
        setIsSearching(false);
      }
    } else {
      const local = localParse(trimmed);
      setParsed(local);
      setIsAIActive(false);
      return local;
    }
  }, [app]);

  const clear = useCallback(() => {
    setParsed(null);
    setIsAIActive(false);
    setAiError(null);
    lastQueryRef.current = "";
  }, []);

  return { parsed, isAIActive, isSearching, aiError, search, clear };
}

// ─────────────────────────────────────────────────────────────────────
// UI HELPER — little badge showing the user what the AI understood
// Only show this when AI was actually used, so users learn the bar is smart.
// ─────────────────────────────────────────────────────────────────────

export function AISearchBadge({ parsed, isAIActive, onClear }) {
  if (!parsed || !isAIActive) return null;
  const { filters, rewritten, intent } = parsed;

  const chips = [];
  if (intent !== "any") chips.push(intentLabel(intent));
  if (filters.maxPrice) chips.push(`≤ ${filters.maxPrice.toLocaleString()} TSh`);
  if (filters.minPrice) chips.push(`≥ ${filters.minPrice.toLocaleString()} TSh`);
  if (filters.category) chips.push(categoryLabel(filters.category));
  if (filters.serviceCategory) chips.push(serviceCategoryLabel(filters.serviceCategory));
  if (filters.roomType) chips.push(roomTypeLabel(filters.roomType));
  if (filters.location) chips.push(`📍 ${filters.location}`);
  (filters.amenities || []).forEach((a) => chips.push(amenityLabel(a)));

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px",
      padding: "8px 12px", background: "linear-gradient(90deg, #f0fdfa, #ecfeff)",
      borderBottom: "1px solid #99f6e4", fontSize: "12px",
    }}>
      <span style={{ fontSize: "14px" }}>✨</span>
      <span style={{ color: "#0f766e", fontWeight: "600" }}>AI:</span>
      {chips.map((c, i) => (
        <span key={i} style={{
          background: "#fff", border: "1px solid #99f6e4",
          padding: "2px 8px", borderRadius: "10px", color: "#115e59",
          fontSize: "11px", fontWeight: "500",
        }}>
          {c}
        </span>
      ))}
      {chips.length === 0 && (
        <span style={{ color: "#6b7280", fontSize: "11px" }}>{rewritten}</span>
      )}
      <button onClick={onClear} style={{
        marginLeft: "auto", background: "none", border: "none",
        color: "#0f766e", fontSize: "12px", cursor: "pointer", fontWeight: "600",
      }}>
        ✕ Clear
      </button>
    </div>
  );
}

// Labels — match your existing CATEGORIES/SERVICE_CATEGORIES/ROOM_TYPES arrays
function intentLabel(i) {
  return { listing: "🛍 Goods", service: "⚡ Services", room: "🏠 Rooms", collection: "📋 Collections" }[i] || i;
}
function categoryLabel(c) {
  return { notes: "📓 Notes", electronics: "💻 Electronics", furniture: "🪑 Furniture", clothing: "👕 Clothing", other: "📦 Other" }[c] || c;
}
function serviceCategoryLabel(c) {
  return { personal_care: "💇 Personal Care", creative: "📸 Creative", clothing_brand: "👕 Brands", food: "🍲 Food", delivery: "🏃 Delivery", other_service: "🔧 Other" }[c] || c;
}
function roomTypeLabel(t) {
  return { single: "🚪 Single", master: "🛏 Master", apartment: "🏢 Apartment" }[t] || t;
}
function amenityLabel(a) {
  return { electricity: "⚡ Electricity", water: "💧 Water", wifi: "📶 WiFi", toilet_inside: "🚿 Toilet inside", toilet_shared: "🚻 Shared toilet", furnished: "🪑 Furnished", parking: "🅿 Parking", security: "🔒 Security" }[a] || a;
}
