# Kampasika Biz

Step 1: onboarding & pawaPay readiness · Step 2: room applications · Step 3: leases · Step 4: rent

Kampasika Biz is the business side of Kampasika for hostel / PBSA operators.
It lives at **/biz** on the same site and Firebase project. Step 1 gets an
operator "pawaPay ready": business profile → documents → settlement account →
their own pawaPay merchant account → sandbox token → test payment → go live.

Money model: **operator_own**. Each operator uses their own pawaPay account;
rent settles straight to them and Kampasika never holds funds. The
`paymentMode` field and `createDepositForOperator()` in
`functions/biz/bizFunctions.js` are where a future `kampasika_platform` mode
(one Kampasika pawaPay account) would plug in once compliance is in place.

## What's where

| Area | Files |
|---|---|
| Entry point | `src/index.js` — `/biz/*` loads `src/biz/BizApp.jsx` on demand; everything else loads `App.js` as before |
| Screens | `src/biz/BizApp.jsx` (shell, welcome, checklist), `BizSteps.jsx` (7 steps), `BizAdmin.jsx` (admin) |
| Data + readiness logic | `src/biz/bizService.js` |
| English / Kiswahili text | `src/biz/bizCopy.js` |
| Styles | `src/biz/Biz.css` (same tokens as the main app) |
| Link from Kampasika | `src/biz/BizEntryCard.jsx`, shown on the My Properties / My Rooms tabs in `App.js` |
| Cloud Functions | `functions/biz/bizFunctions.js`, `functions/biz/bizPawapay.js`, exported from `functions/index.js` |
| Rules | `firestore.rules`, `storage.rules` |

Routes: `/biz`, `/biz/step/<profile|documents|settlement|application|sandbox|test|live>`, `/biz/admin`, `/biz/admin/<uid>`.

## Data

- `operators/{ownerUid}` — one business per owner. The owner edits `profile`,
  `documents`, `settlement`, `pawapayApplication`, and can move `status` from
  `draft`/`needs_changes` to `in_review`. Only Functions/admin write
  `review`, `pawapay`, `paymentMode`, `liveAt`, and the `live`/`suspended` statuses.
- `bizOperatorSecrets/{ownerUid}` — operator pawaPay tokens, AES-256-GCM
  encrypted with `BIZ_CREDENTIALS_KEY` and bound to operator + environment.
  No client access.
- `bizDeposits/{depositId}` — every deposit Biz creates. Written only by Functions.
- Storage `biz/{ownerUid}/documents/*` — BRELA / TIN / ID / licence. Owner + admin only.

Callbacks never mark anything paid on their own: `bizPawapayCallback` only
learns *which* deposit changed, then asks pawaPay (`GET /v2/deposits/{id}`)
with that operator's token for the real status.

## Before deploying

1. **Set the encryption secret once** (any long random string; don't change it later):
   ```
   firebase functions:secrets:set BIZ_CREDENTIALS_KEY
   ```
2. **Test the rules in the emulator first.** `firestore.rules` changes the old
   root wildcard `match /{document=**}` to `match /{collectionName}/{document=**}`
   so it can exclude the Biz collections, and adds explicit read rules for the
   three collection-group queries the app runs (`team`, `members`,
   `collections`). Check groups, properties/team and public events still load.
3. Deploy:
   ```
   firebase deploy --only firestore:rules,storage
   firebase deploy --only functions:bizConnectPawapay,functions:bizDisconnectPawapay,functions:bizCreateTestDeposit,functions:bizRefreshDeposit,functions:bizPawapayCallback,functions:bizAdminReview
   npm run build && firebase deploy --only hosting
   ```

## Operator's pawaPay callback URL

Shown in the app on the Sandbox and Go-live steps:
`https://us-central1-ludepoz.cloudfunctions.net/bizPawapayCallback/<operator uid>`

## Admin

`/biz/admin` (admin UID only): filter by status, open a business, view
documents, approve documents, request changes (with a note), set live
(requires approved documents + production token), pause, or connect a token
on the operator's behalf when onboarding them in person.

## Step 2 — room applications

- **Student side (Kampasika app):** `src/biz/BizApplyBar.jsx`, shown on a
  room's detail screen when the room's owner has a `bizPublic` record. It
  offers "Omba · Apply" (a bilingual form), then shows the application status
  and a Withdraw button. It gets `db`/`functions` from App.js as props and
  must never import `bizFirebase.js` (that would initialise Firestore before
  App.js does and break the app's offline cache).
- **Operator side (Biz):** `/biz/applications` and `/biz/applications/<id>`
  (`src/biz/BizApplications.jsx`): filters New / Shortlisted / Approved /
  Closed, call / WhatsApp the student, shortlist / approve / reject with a
  note, history, and an "Accepting applications" switch.
- **Functions:** `functions/biz/bizApplications.js`
  - `bizSyncOperatorPublic` (Firestore trigger on `operators/{id}`) keeps
    `bizPublic/{id}` = `{ businessName, area, nearUni, live, acceptingApplications }`.
    A business becomes visible to students once Kampasika approves its
    documents, and disappears when paused.
  - `bizSubmitApplication`, `bizWithdrawApplication`, `bizDecideApplication`.
    The room's operator is the **property owner** when the room is under a
    property (so rooms listed by a manager still reach the owner), otherwise
    the lister. Application id is `<roomId>_<studentUid>`, so a double tap
    can't create two.
  - Both sides get in-app notifications (and push, via the existing
    `sendInAppNotificationPush` trigger).
- **Data:** `bizPublic/{operatorId}` (public read), `bizApplications/{id}`
  (student + operator read; Functions-only write).

Note: only the property **owner** sees applications for now, not managers /
caretakers on the property team.

Deploy step 2 functions:
```
firebase deploy --only functions:bizSyncOperatorPublic,functions:bizSubmitApplication,functions:bizWithdrawApplication,functions:bizDecideApplication
```

## Step 3 — leases

- **Template:** `src/biz/bizLeaseTemplate.js` holds the standard lease
  (14 plain-language clauses, English + Kiswahili) with `{{placeholders}}`.
  Operators edit it at `/biz/lease-template` (per language, saved as
  `operators.leaseTemplates.en|sw`; default terms in `operators.leaseDefaults`).
  **It is a starting point, not legal advice — get a Tanzanian lawyer to
  review it before relying on it.**
- **Create:** on an approved application → "Create lease"
  (`/biz/applications/<id>/lease`): language, rent, period, deposit, due day,
  dates, notice, utilities, extra terms, live preview → `bizCreateLease`. The
  server fills in business / student / room itself, freezes the text, stores a
  SHA-256 `contentHash` and a reference like `KPL-2026-ABC123`. Issuing counts
  as the landlord's signature.
- **Sign:** the student gets a notification and a "Read & sign lease" button on
  the room in Kampasika → `/biz/lease/<id>` (the same page the operator sees).
  They tick "I agree", type their full name → `bizSignLease` records typed
  name, time, content hash, IP and device. They can also decline with a
  reason; the operator can withdraw an unsigned lease and issue a new one.
- **Print:** "Print / save as PDF" prints just the lease.
- **Data:** `bizLeases/{id}` (the two parties read; Functions-only write),
  mirrored on the application as `lease: { id, status }`.
- A drawn signature can be added later on top of this (same record, extra field).

Deploy step 3 functions:
```
firebase deploy --only functions:bizCreateLease,functions:bizSignLease,functions:bizDeclineLease,functions:bizCancelLease
```

## Step 4 — rent

- **Charges:** when a student signs, `createChargesForLease()`
  (`functions/biz/bizRent.js`) writes the schedule to `bizCharges`:
  an optional deposit (due on the start date) plus rent charges.
  - month: one per month counted from the start date; a short final month is
    pro-rated by days.
  - semester / year: the term split into equal parts of up to 6 / 12 months,
    full rent each.
  - Each rent charge is due on day *dueDay* of its period, matching the lease
    wording. The room is also marked unavailable on Kampasika.
- **Paying:** the student opens the lease (Kampasika shows "Lease & rent
  payments" on the room) → **Pay** → phone + network + amount (part payments
  allowed) → `bizPayCharge` sends a pawaPay deposit with the **operator's own
  token**. The completed deposit is added to the charge exactly once (a
  transaction marks the deposit `appliedToCharge`), whether it arrives by
  callback or by "check status". One payment prompt per charge at a time.
- **When online payment is on:** operator is live with a production token, or
  (pilot only) the operator ticked *Test mode* on the Rent tab
  (`settings.sandboxRent`) — then payments go through the pawaPay sandbox
  and are labelled TEST. `bizPublic.onlinePayments` tells the student app
  which (`"live"`, `"test"` or `""`).
- **Operator Rent tab (`/biz/rent`):** collected this month, overdue balance,
  tenants behind, due in 7 days; occupancy per property (rooms with an active
  signed lease vs all rooms); charges filtered Overdue / Due soon / All unpaid
  / Paid; tap a charge to see payments, **record a payment** (cash, bank,
  mobile money outside Kampasika) or **waive** it.
- **Reminders:** `bizRentReminders` runs daily 09:00 EAT — 3 days before, on
  the day, and 3 and 7 days after a charge is due (unpaid only).
- **Notifications:** both sides on every payment; the student on waivers.
- **Data:** `bizCharges/{leaseId}_dep|_rNN` (tenant + operator read;
  Functions-only write). Students can now read the `bizDeposits` they started.

Deploy step 4 functions (the lease functions again too, since signing now
creates charges):
```
firebase deploy --only functions:bizPayCharge,functions:bizRecordPayment,functions:bizWaiveCharge,functions:bizRentReminders,functions:bizSignLease,functions:bizRefreshDeposit,functions:bizPawapayCallback,functions:bizSyncOperatorPublic
```

## Possible next steps

- Drawn signature on the lease (adds to the same signature record).
- Let property managers / caretakers see applications, leases and rent.
- Receipts as PDF, and a monthly statement for the operator.
- A `kampasika_platform` payment mode once Kampasika can collect on behalf of operators.
