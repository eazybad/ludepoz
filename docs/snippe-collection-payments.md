# Snippe Collection Payments

This is the backend payment-provider layer for Ludepoz/Kampasika collections.
It starts a Snippe mobile-money payment and records webhook results without
replacing the existing manual proof flow.

## Firebase Functions

- `createSnippeCollectionPayment` callable
- `snippePaymentWebhook` HTTPS webhook

## Required Secrets

Set these in Firebase Functions:

```sh
firebase functions:secrets:set SNIPPE_API_KEY
firebase functions:secrets:set SNIPPE_WEBHOOK_SECRET
```

`SNIPPE_WEBHOOK_SECRET` must match the webhook signing key from the Snippe
dashboard. The webhook URL must be HTTPS in production.

Optional environment variable:

```sh
SNIPPE_WEBHOOK_URL=https://<region>-<project>.cloudfunctions.net/snippePaymentWebhook
```

If `SNIPPE_WEBHOOK_URL` is not set, the callable can receive `webhookUrl` in
its request data during testing.

## Callable Request

```js
{
  scope: "public" | "group",
  collectionId: "collection-id",
  groupId: "group-id-if-scope-is-group",
  memberId: "member-or-contributor-id",
  amountDue: 20000,
  amount: 5000,
  phone: "0712345678",
  registeredPhone: "0765432100",
  firstName: "Asha",
  lastName: "Member",
  email: "asha@example.com",
  selectedOption: "XL"
}
```

Rules:

- `amount` must be an integer and at least `500`.
- Currency is always `TZS`.
- Tanzania phone numbers are normalized to Snippe format: `255XXXXXXXXX`.
- Group payments require the signed-in user to be a member of that group.
- `memberId`/`contributorId` defaults to the signed-in user id.
- If `amountDue` is omitted, the provider falls back to the collection's
  `amountDue`, `amount`, `price`, then the requested `amount`.
- Partial payments are rejected unless the collection has
  `allowPartialPayments: true`.
- A payment can be made from a different phone number. The provider stores both
  `payerPhone` and `registeredPhone`, plus `paidByDifferentNumber`.

## Callable Response

```js
{
  success: true,
  attemptId: "firestore-attempt-id",
  status: "pending",
  provider: "snippe",
  providerReference: "snippe-reference",
  expiresAt: "2026-01-25T05:04:54Z"
}
```

The user should then wait for the USSD/mobile-money prompt. The app should
listen to `collectionPaymentAttempts/{attemptId}` for final status.

## Firestore Writes

Payment attempts are stored at:

```text
collectionPaymentAttempts/{attemptId}
```

Contributor summaries are stored under the collection:

```text
collections/{collectionId}/contributors/{memberId}
groups/{groupId}/collections/{collectionId}/contributors/{memberId}
```

Webhook events are stored at:

```text
snippeWebhookEvents/{eventId}
```

On `payment.completed`, the provider increments the target collection:

```text
totalCollected += grossAmount
totalCollectedGross += grossAmount
totalCollectedNet += netAmount
totalFees += feeAmount
paidCount / partialCount / overpaidCount adjusted from contributor status
lastPaidAt = serverTimestamp()
currency = "TZS"
```

Supported target collection paths:

```text
collections/{collectionId}
groups/{groupId}/collections/{collectionId}
```

## Snippe Metadata

Every Snippe payment is created with metadata:

```js
{
  provider: "snippe",
  attempt_id: "...",
  collection_scope: "public" | "group",
  collection_id: "...",
  collection_path: "...",
  group_id: "...",
  user_id: "..."
}
```

This metadata is how the webhook knows what to update. Do not remove it when
extending the flow.

## Money Rules

- Member completion is based on gross amount paid, not settlement net after
  Snippe fees.
- Admin accounting stores gross, fee, and net separately.
- Different-number payments are allowed and flagged for admin visibility.
- Partial payments are allowed only when `allowPartialPayments: true` is set on
  the collection.
- Contributor status is derived from gross paid:
  - `unpaid`: paid `0`
  - `partial`: paid more than `0` but less than `amountDue`
  - `paid`: paid exactly enough
  - `overpaid`: paid more than `amountDue`
- Failed, voided, and expired payments update the attempt only. They do not
  change collection totals.
- Duplicate webhook events are ignored using `snippeWebhookEvents/{eventId}`.

## Frontend Wiring

The collection Pay button should:

1. Call `createSnippeCollectionPayment`.
2. Show a pending state telling the member to approve the phone prompt.
3. Subscribe to `collectionPaymentAttempts/{attemptId}`.
4. Treat `paymentStatus: "paid"` as success.
5. Treat `failed`, `voided`, or `expired` as retryable failure states.
6. Show admin records from the contributor summary for `amountPaidGross`,
   `amountPaidNet`, `totalFees`, `paymentStatus`, and `paidByDifferentNumber`.

The existing proof upload flow can stay as a fallback while Snippe payments are
being tested in production.
