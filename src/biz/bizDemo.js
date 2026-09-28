// ─── Kampasika Biz · demo mode (/biz/demo) ───
// A read-only copy of Kampasika Biz filled with made-up sample data, for
// showing hostel owners what they get. No sign-in, nothing is saved, and no
// Firestore / Cloud Functions are touched: bizService.js asks isBizDemo() and
// serves these objects instead. Every name, phone number and amount here is
// fictional. Dates are relative to today so the demo always looks current.

import { defaultClauses, renderText } from "./bizLeaseTemplate";

export const DEMO_OPERATOR_ID = "demo-owner";

export function isBizDemo() {
  return typeof window !== "undefined" && /^\/biz\/demo(\/|$)/.test(window.location.pathname);
}

export class DemoError extends Error {
  constructor() {
    super("This is a demo with sample data — nothing is saved. Create your own Kampasika Biz account to do this for real.");
    this.code = "demo";
  }
}

// ── date helpers (local calendar days, ISO yyyy-mm-dd) ──
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysFromToday(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}
function addMonths(date, n) {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d;
}
function stamp(date) {
  return { toMillis: () => date.getTime(), toDate: () => date };
}

// Small deterministic random so the demo looks the same on every load.
function rng(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

const FIRST = ["Juma", "Neema", "Baraka", "Rehema", "Peter", "Aisha", "Emmanuel", "Grace", "Khamis", "Upendo", "Daudi", "Zawadi", "Frank", "Mwanaidi", "Joseph", "Halima", "Brian", "Esther", "Salum", "Janeth", "Kelvin", "Faraja"];
const LAST = ["Ali", "Joseph", "Mushi", "Mwakyusa", "John", "Hassan", "Massawe", "Kimaro", "Shabani", "Lema", "Mollel", "Mbwana", "Temba", "Said", "Nyerere", "Komba", "Swai", "Mapunda", "Omari", "Mrema", "Chuwa", "Minja"];
const UNIS = ["ARU", "UDSM", "CBE", "DIT", "IFM", "MUHAS"];

let cache = null;

export function demoData() {
  if (cache) return cache;
  const rand = rng(20261001);
  const today = iso(daysFromToday(0));

  const operator = {
    id: DEMO_OPERATOR_ID,
    ownerUid: DEMO_OPERATOR_ID,
    status: "live",
    paymentMode: "operator_own",
    profile: {
      businessName: "Mwenge Student Hostels (demo)",
      businessType: "company",
      brelaNumber: "000000",
      tin: "000-000-000",
      contactName: "Asha Mushi",
      contactPhone: "0700 000 000",
      contactEmail: "",
      region: "Dar es Salaam",
      area: "Mwenge",
      nearUni: "ARU",
      propertyCount: "2",
      bedCount: "20",
    },
    documents: { brela: { path: "demo", name: "brela.pdf" }, tin: { path: "demo", name: "tin.pdf" }, ownerId: { path: "demo", name: "id.pdf" } },
    settlement: { method: "bank", institution: "Demo Bank", accountName: "Mwenge Student Hostels", confirmedWithPawapay: true },
    pawapayApplication: { status: "approved" },
    review: { documents: "approved", live: "approved" },
    pawapay: {
      sandbox: { connected: true, testPassedAt: 1, companyName: "Mwenge Student Hostels" },
      production: { connected: true, companyName: "Mwenge Student Hostels" },
      testDeposit: { status: "paid" },
    },
    settings: { acceptingApplications: true },
    payTo: { method: "lipa", provider: "M-Pesa", number: "000 000", name: "MWENGE STUDENT HOSTELS", note: "Use your room number as the reference." },
    billing: { placements: 0 },
  };

  const properties = [
    { id: "pA", name: "Block A — Mwenge", ownerId: DEMO_OPERATOR_ID },
    { id: "pB", name: "Block B — Makongo", ownerId: DEMO_OPERATOR_ID },
  ];
  const rooms = [];
  for (let i = 1; i <= 12; i += 1) rooms.push({ id: `rA${i}`, propertyId: "pA", number: `A${i}`, roomType: i % 4 === 0 ? "master" : "single", price: i % 4 === 0 ? 130000 : 90000 });
  for (let i = 1; i <= 8; i += 1) rooms.push({ id: `rB${i}`, propertyId: "pB", number: `B${i}`, roomType: i % 3 === 0 ? "master" : "single", price: i % 3 === 0 ? 120000 : 80000 });

  const roomLabel = (r) => `Room ${r.number}, ${r.roomType === "master" ? "Master room" : "Single room"}, ${properties.find(p => p.id === r.propertyId).name.split(" — ")[0]}`;
  const clausesFor = (values) => defaultClauses("en").map(c => ({ title: renderText(c.title, values), body: renderText(c.body, values) }));

  // 14 signed leases (9 in Block A, 5 in Block B), started 1–7 months ago.
  const occupied = [...rooms.filter(r => r.propertyId === "pA").slice(0, 9), ...rooms.filter(r => r.propertyId === "pB").slice(0, 5)];
  const leases = [];
  const charges = [];
  // Who is behind: index → how the current / previous month looks.
  const behind = { 2: "overdue", 6: "partial", 9: "overdue2", 12: "overdue" };

  occupied.forEach((room, i) => {
    const name = `${FIRST[i]} ${LAST[i]}`;
    const startsAgo = 1 + Math.floor(rand() * 7);
    const start = addMonths(daysFromToday(0), -startsAgo);
    start.setDate(1 + Math.floor(rand() * 27));
    const end = addMonths(start, 10);
    end.setDate(end.getDate() - 1);
    const leaseId = `demoL${i + 1}`;
    const reference = `KPL-2026-DEMO${String(i + 1).padStart(2, "0")}`;
    const terms = { language: "en", rent: room.price, rentPeriod: "month", deposit: room.price, startDate: iso(start), endDate: iso(end), dueDay: 5, noticeDays: 30, utilities: "included in the rent", extraTerms: "" };
    const tenant = { name, phone: "0700 000 000", university: UNIS[i % UNIS.length], regNumber: `DEMO/${2024 + (i % 2)}/${1000 + i}` };
    const label = roomLabel(room);
    const values = {
      businessName: operator.profile.businessName, landlordContact: "Asha Mushi", studentName: name, university: tenant.university,
      regNumber: tenant.regNumber, roomLabel: label, location: "Mwenge, Dar es Salaam", rent: room.price.toLocaleString("en-US"),
      rentPeriod: "month", deposit: room.price.toLocaleString("en-US"), startDate: iso(start), endDate: iso(end), dueDay: "5",
      noticeDays: "30", utilities: "included in the rent", extraTerms: "None.",
    };
    const signedAt = new Date(start); signedAt.setDate(signedAt.getDate() - 3);
    leases.push({
      id: leaseId, reference, language: "en", status: "signed", operatorId: DEMO_OPERATOR_ID, studentUid: `demoS${i + 1}`,
      applicationId: `demoA${i + 1}`, roomId: room.id, propertyId: room.propertyId,
      parties: { landlord: { businessName: operator.profile.businessName, contactName: "Asha Mushi", tin: "000-000-000", brelaNumber: "000000" }, tenant },
      room: { label, location: "Mwenge, Dar es Salaam" }, terms, clauses: clausesFor(values), contentHash: "demo0000000000000000",
      signatures: {
        landlord: { name: "Asha Mushi", issuedAt: signedAt.toISOString() },
        tenant: { typedName: name, signedAt: new Date(signedAt.getTime() + 86400000).toISOString(), contentHash: "demo0000000000000000" },
      },
      createdAt: stamp(signedAt),
    });

    const base = {
      operatorId: DEMO_OPERATOR_ID, studentUid: `demoS${i + 1}`, leaseId, leaseReference: reference, propertyId: room.propertyId,
      roomId: room.id, roomLabel: label, tenantName: name, tenantPhone: tenant.phone, businessName: operator.profile.businessName, currency: "TZS",
    };
    // Deposit, paid before moving in.
    const depPaid = new Date(start); depPaid.setDate(depPaid.getDate() - 2);
    charges.push({ ...base, id: `${leaseId}_dep`, type: "deposit", label: "Deposit", dueDate: iso(start), periodStart: iso(start), periodEnd: iso(start), amount: room.price, amountPaid: room.price, status: "paid", payments: [{ amount: room.price, method: "pawapay", paidOn: iso(depPaid), reference: `MP${100000 + i * 7}`, at: depPaid.toISOString() }] });

    // Monthly rent from the start until two months ahead.
    for (let m = 0; m < 10; m += 1) {
      const ps = addMonths(start, m);
      if (ps > daysFromToday(62)) break;
      const pe = addMonths(start, m + 1); pe.setDate(pe.getDate() - 1);
      const due = new Date(ps); due.setDate(due.getDate() + 4);
      const dueIso = iso(due);
      const c = { ...base, id: `${leaseId}_r${String(m + 1).padStart(2, "0")}`, type: "rent", label: `Rent ${ps.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${pe.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`, periodStart: iso(ps), periodEnd: iso(pe), dueDate: dueIso, amount: room.price, amountPaid: 0, status: "due", payments: [] };
      const isPast = dueIso < today;
      const monthsBack = Math.round((daysFromToday(0) - due) / (30 * 86400000));
      const pay = (amount, dayOffset, method) => {
        const d = new Date(due); d.setDate(d.getDate() + dayOffset);
        if (d > daysFromToday(0)) d.setTime(daysFromToday(-1).getTime());
        c.payments.push({ amount, method, paidOn: iso(d), reference: method === "cash" ? `Receipt ${40 + m + i}` : `MP${200000 + i * 31 + m}`, at: d.toISOString() });
        c.amountPaid += amount;
      };
      const kind = behind[i];
      if (isPast) {
        if (kind === "overdue" && monthsBack <= 0) { /* this month's rent not paid */ }
        else if (kind === "overdue2" && monthsBack <= 1) { /* two months behind */ }
        else if (kind === "partial" && monthsBack <= 0) pay(Math.round(room.price / 2), 1, "pawapay");
        else pay(room.price, Math.floor(rand() * 6) - 3, rand() < 0.8 ? "pawapay" : "cash");
      } else if (dueIso <= iso(daysFromToday(3)) && rand() < 0.4) {
        pay(room.price, -2, "pawapay"); // some pay early
      }
      c.status = c.amountPaid >= c.amount ? "paid" : c.amountPaid > 0 ? "partial" : "due";
      charges.push(c);
    }
  });

  // Leases still waiting on the student.
  const waitingRooms = [rooms.find(r => r.id === "rA10"), rooms.find(r => r.id === "rB6")];
  waitingRooms.forEach((room, k) => {
    const i = 14 + k;
    const name = `${FIRST[i]} ${LAST[i]}`;
    const start = daysFromToday(10 + k * 5);
    const end = addMonths(start, 6); end.setDate(end.getDate() - 1);
    const label = roomLabel(room);
    const sentAt = daysFromToday(-1 - k);
    leases.push({
      id: `demoL${i + 1}`, reference: `KPL-2026-DEMO${i + 1}`, language: "en", status: k === 0 ? "sent" : "pending_fee",
      operatorId: DEMO_OPERATOR_ID, studentUid: `demoS${i + 1}`, applicationId: `demoA${i + 1}`, roomId: room.id, propertyId: room.propertyId,
      parties: { landlord: { businessName: operator.profile.businessName, contactName: "Asha Mushi" }, tenant: { name, university: UNIS[i % UNIS.length] } },
      room: { label, location: "Mwenge, Dar es Salaam" },
      terms: { language: "en", rent: room.price, rentPeriod: "month", deposit: room.price, startDate: iso(start), endDate: iso(end), dueDay: 5, noticeDays: 30 },
      clauses: clausesFor({ businessName: operator.profile.businessName, studentName: name, roomLabel: label, rent: room.price.toLocaleString("en-US"), rentPeriod: "month" }),
      contentHash: "demo", serviceFee: k === 1 ? { amount: 45000, percent: 10, capPercentOfMonth: 50 } : null,
      signatures: { landlord: { name: "Asha Mushi", issuedAt: sentAt.toISOString() }, ...(k === 1 ? { tenant: { typedName: name, signedAt: new Date().toISOString(), contentHash: "demo" } } : {}) },
      createdAt: stamp(sentAt),
    });
  });

  // Applications: new, shortlisted, approved (the waiting leases), closed.
  const appRooms = ["rA11", "rA12", "rB7", "rB8", "rA11", "rB7", "rA12"];
  const appStatus = ["submitted", "submitted", "submitted", "shortlisted", "shortlisted", "rejected", "withdrawn"];
  const apps = appRooms.map((rid, k) => {
    const i = 16 + (k % 6);
    const room = rooms.find(r => r.id === rid);
    const created = new Date(Date.now() - (k * 7 + 1) * 3600 * 1000 * (k < 3 ? 1 : 5));
    return {
      id: `demoApp${k + 1}`, status: appStatus[k], operatorId: DEMO_OPERATOR_ID, studentUid: `demoX${k + 1}`, roomId: rid, propertyId: room.propertyId,
      businessName: operator.profile.businessName,
      room: { roomType: room.roomType, roomNumber: room.number, propertyName: properties.find(p => p.id === room.propertyId).name.split(" — ")[0], price: room.price },
      applicant: {
        name: `${FIRST[i]} ${LAST[(i + k) % LAST.length]}`, phone: "0700 000 000", university: UNIS[(k + 2) % UNIS.length],
        course: ["BSc Computer Science", "BA Economics", "BSc Land Management", "Diploma in ICT", "BSc Architecture", "BCom Accounting", "BSc Nursing"][k],
        yearOfStudy: String(1 + (k % 3)), regNumber: "", moveInDate: iso(daysFromToday(7 + k * 4)), duration: k % 2 ? "academic_year" : "semester",
        message: k === 0 ? "Habari, natafuta chumba cha single karibu na chuo kwa semester hii. Naweza kuja kuona chumba Jumamosi." : "",
      },
      history: [{ status: "submitted", at: created.toISOString() }],
      createdAt: stamp(created),
    };
  });
  waitingRooms.forEach((room, k) => {
    const i = 14 + k;
    apps.push({
      id: `demoA${i + 1}`, status: "approved", operatorId: DEMO_OPERATOR_ID, studentUid: `demoS${i + 1}`, roomId: room.id,
      room: { roomType: room.roomType, roomNumber: room.number, propertyName: properties.find(p => p.id === room.propertyId).name.split(" — ")[0], price: room.price },
      applicant: { name: `${FIRST[i]} ${LAST[i]}`, phone: "0700 000 000", university: UNIS[i % UNIS.length], moveInDate: iso(daysFromToday(10 + k * 5)), duration: "semester" },
      lease: { id: `demoL${i + 1}`, status: k === 0 ? "sent" : "pending_fee" },
      createdAt: stamp(daysFromToday(-4 - k)),
    });
  });

  // One tenant reported paying directly and waits for the owner to confirm.
  const claimed = charges.find(c => c.leaseId === "demoL3" && c.type === "rent" && c.status !== "paid" && c.dueDate < today)
    || charges.find(c => c.type === "rent" && c.status !== "paid" && c.dueDate < today);
  if (claimed) {
    claimed.claims = [{ id: "demoClaim1", amount: claimed.amount - claimed.amountPaid, reference: "QK7H2M9P1X", paidOn: iso(daysFromToday(-1)), method: "lipa", status: "pending", by: claimed.studentUid, at: daysFromToday(-1).toISOString() }];
    claimed.pendingClaim = true;
  }

  cache = {
    operator,
    properties,
    rooms,
    leases,
    charges: charges.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))),
    apps: apps.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()),
    invoices: [],
    pricing: {
      serviceFee: { enabled: true, percent: 10, capPercentOfMonth: 50 },
      placementFee: { enabled: false, type: "percent", amount: 0, freePlacements: 0, dueDays: 7 },
      graceDays: 14,
      platformEnvironment: "sandbox",
    },
  };
  return cache;
}

// onSnapshot-style helper: deliver once, return an unsubscribe.
export function demoDeliver(value, onData) {
  const timer = setTimeout(() => onData(typeof value === "function" ? value() : value), 120);
  return () => clearTimeout(timer);
}

// Demo-only switches for trying the student side: ?as=student&pay=direct
export function demoParam(name) {
  try { return new URLSearchParams(window.location.search).get(name); } catch (_) { return null; }
}
