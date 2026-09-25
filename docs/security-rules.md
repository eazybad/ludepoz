# Firestore & Storage security rules

## What was wrong

Firestore (and Storage) grant access if **any** matching rule allows it. The
catch-all at the bottom of `firestore.rules` (`match /{document=**}` →
read: anyone, write: any signed-in user) therefore overrode every careful rule
above it. In practice:

- Anyone could read `verificationRequests` (NIDA numbers, names, ID photo links).
- Any signed-in user could give themselves a Verified badge, edit anyone's
  profile or rooms, or send official-looking notifications.
- Any signed-in user could change `system/features` (feature flags).
- Any signed-in user could read/overwrite server-only data, including login
  OTP records (resetting `attempts` would allow brute-forcing someone's
  6-digit login code) and payment transaction logs.
- Storage: verification ID photos were publicly readable.

## What changed

- The catch-all now **skips** every collection that has its own rules
  (`hasOwnRules()` and `bizOnlyCollection()` in `firestore.rules`), so those
  rules finally apply.
- Fixes so the app keeps working under the real rules:
  - `users` create no longer uses `diff()` (which fails on a new doc — sign-up
    would have broken).
  - `rooms`: a room can keep its existing Verified badge when edited; property
    owners/managers can toggle `available` and delete rooms, as the app does.
  - `roommatePosts`: authors can read their own posts (the profile editor
    queries them).
  - `notifications`: group features may notify other members (`group_*` types,
    only to members of that group); only admin/Functions write anything else.
- New: `system` admin-only writes; server-only collections locked
  (`phoneOtps`, `phoneAuthOtps`, `azamPayTransactions`, `pawaPayTransactions`,
  `pawaPayWebhookEvents`, `pawaPayTestDeposits`, `snippeWebhookEvents`,
  `collectionPaymentAttempts`).
- Storage: `verification/{uid}/…` readable only by the owner and the admin.

## Test before deploying

Needs the Firebase CLI and Java 11+ (the emulators run on Java).

```
cd rules-tests
npm install
npm test
```

It starts the Firestore + Storage emulators with these rules and runs all
the checks (what must be allowed so the app works, and what must be denied).
Everything should say PASS. Then:

```
firebase deploy --only firestore:rules,storage
```

After deploying, click through the main flows once on the live app: sign
up, edit profile, list a room, verification submit + admin approve, group
chat mention, group payment, roommate finder.

## Round 2 — chats, groups, marketplace (no more catch-all)

The open catch-all rule is gone. Every collection has its own rules and
anything else is denied by default — **a new collection needs a rule before
the app can use it.**

- **Private chats (`conversations` + messages):** only the buyer and seller
  (and, for room inquiries, that property's team via the Property Inbox) can
  read or write. Nobody can swap who is in a chat or send as someone else.
- **Groups:**
  - joining respects "approval required" (you join as *pending*);
  - you can't approve, un-block or promote yourself;
  - you can leave and re-join;
  - members can unsend their own messages and edit their own resources;
  - your own payment starts unverified — only owners/admins/treasurers
    (or the payment functions) mark it paid. "Payment sent" and
    re-submitting with an option now work (they were blocked by the old
    group rules, which had never actually been enforced);
  - new rules for work groups and announcements;
  - the Kampasika admin can manage any group.
- **Collection-group queries** now only return your own `members` / `team`
  entries (they contain emails and phone numbers) and public events.
- **Listings / services:** owners edit and delete; others can only move the
  views / saves counter by one.
- **Collections (class orders):** owner and co-admins (by email) manage;
  buyers place orders, add their own payment reference, and bump totals.
  Order lists stay readable to anyone viewing the collection (as before) —
  they include buyer phone numbers, worth revisiting.
- **searchAlerts** (phone / email): creator + admin only. **reports:** anyone
  signed in can file one, only the admin reads. **paymentReminders:**
  create your own only.

`npm test` in `rules-tests/` now runs 109 checks.

## Also worth doing

- ID photo links created before this fix contain download tokens that still
  work for anyone who has the link. In the Firebase console → Storage →
  `verification/`, you can revoke a file's access token (the admin review
  screen will then need a fresh link).
- `users` documents are still publicly readable and include `phone` and
  `email`. Moving private fields to a separate owner-only doc would fix that.
