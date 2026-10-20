# Recurrente payments — operator guide

VetSystem charges clinic subscriptions through [Recurrente](https://docs.recurrente.com/).
The integration runs in Firebase Cloud Functions (`functions/src/payments/recurrente/`) and has
two modes:

| Mode | Talks to Recurrente | Records in | Extends the clinic license |
|---|---|---|---|
| `mock` (default) | **Never** | `mockPayments` | **Never** |
| `live` | Yes, with `sk_live_…` | `payments` | Yes, once per confirmed payment |

> The Recurrente account is personal and has no Sandbox, so `mock` is how payment flows are
> tested. (Recurrente's docs state personal accounts can create a TEST key under
> **Settings → API Keys** — worth checking; if one exists it works in `live` mode without moving money.)

---

## Architecture

```
Browser (useSubscription)
  └─ createRecurrenteCheckout({ planId, returnOrigin })      callable, auth required
       └─ PaymentService ── PaymentRepository (Firestore, collections per mode)
                         └─ PaymentProvider
                              ├─ MockRecurrenteProvider  (mock: state in `mockGateway`)
                              └─ RecurrenteClient        (live: app.recurrente.com/api)

Recurrente ──POST──> recurrenteWebhook                       Svix signature verified
                       └─ PaymentService.processWebhookEvent
                            ├─ GET /checkouts/{id}  ← authoritative confirmation
                            └─ one transaction: payment status + event id + license (live only)
```

| File | Role |
|---|---|
| `recurrente.types.ts` | API shapes (documented fields only) and the internal payment model |
| `recurrente.client.ts` | Live HTTP client — `X-SECRET-KEY`, timeouts, error mapping |
| `recurrente.mock.ts` | Mock provider, mock signing secret, webhook signer |
| `recurrente.service.ts` | Checkout creation, status, idempotent event processing, fulfillment |
| `recurrente.webhook.ts` | Signature verification and HTTP status mapping |
| `payment.repository.ts` | Firestore access; mock repositories refuse any license read/write |
| `recurrente.plans.ts` | Server-side price list |
| `recurrente.config.ts` | Mode resolution and live safeguards |
| `recurrente.functions.ts` | Cloud Function definitions, params and secrets |

### Cloud Functions

| Function | Type | Purpose |
|---|---|---|
| `createRecurrenteCheckout` | callable | `{ planId, returnOrigin, mockScenario? }` → `{ paymentId, checkoutUrl, mode, status, reused }` |
| `getRecurrentePaymentStatus` | callable | `{ paymentId, refresh? }` → status view. Owner, or master/admin of the same clinic |
| `recurrenteWebhook` | HTTPS | Receives Recurrente events |
| `simulateRecurrenteMockEvent` | callable | Mock mode only — settles a mock checkout and delivers a signed webhook |
| `createCheckout` | callable | **Deprecated** alias kept for the currently deployed frontend |

### Payment record

```jsonc
// mockPayments/{mock_…}  or  payments/{pay_…}
{
  "id": "mock_ixT9KCFU3Rr6v0zOJEBi",
  "provider": "recurrente",
  "mode": "mock",
  "userId": "<uid>",
  "clinicId": "clinic-a",
  "planId": "monthly",
  "description": "VetSystem Pro - Plan Mensual",
  "durationDays": 30,              // frozen at checkout time
  "licensePlan": "monthly",
  "amountInCents": 3000,           // integer cents, from the server price list
  "currency": "USD",               // Recurrente accepts only GTQ and USD — NIO is not supported
  "status": "paid",                // created | pending | paid | failed | cancelled
  "providerCheckoutId": "mock_ch_…",
  "providerIntentId": "mock_in_…",
  "checkoutUrl": "…",
  "lastError": null,               // stable code, never a raw response
  "reviewRequired": false,         // provider total/currency did not match
  "fulfilledAt": null,             // always null for mock
  "createdAt": 1791582948736,      // ms timestamps, like the rest of the app
  "updatedAt": 1791582954538,
  "paidAt": 1791582954538
}
```

Related collections: `paymentWebhookEvents` / `mockPaymentWebhookEvents` (processed `svix-id`s),
`paymentCheckoutLocks` / `mockPaymentCheckoutLocks` (duplicate-request guard), `mockGateway`
(the mock's stand-in for Recurrente's own records). None are matched in `firestore.rules`, so
browsers cannot read or write them — only the functions (Admin SDK) can.

Status rules: `paid` is final — a late `pending`/`failed`/`canceled` event is recorded as `stale`
and changes nothing. `failed` or `cancelled` can still become `paid` (a buyer can retry a declined card
on the same checkout).

---

## 1. Configure MOCK mode

Mock is the default; nothing is required. To be explicit, set the params in a
`functions/.env.<projectId>` file (or `functions/.env.local` for the emulator):

```dotenv
PAYMENT_PROVIDER_MODE=mock
RECURRENTE_LIVE_ENABLED=false
PAYMENT_RETURN_ORIGINS=https://vetsystem-b7675.web.app,https://vetsystem-b7675.firebaseapp.com,http://localhost:3000
```

For the emulator, `functions/.secret.local` holds placeholder secrets (mock never reads them).
Both files are git-ignored.

## 2. Test a successful payment

```bash
cd functions && npm run build
firebase emulators:start --only functions,firestore,auth --project demo-vetsystem
```

Run the web app with `NEXT_PUBLIC_USE_EMULATOR=true`, sign in, and press the subscribe button
(or call `createRecurrenteCheckout`). In mock mode you are sent straight back to
`/dashboard/?suscripcion=ok&pago=<paymentId>&mockCheckout=…` and the payment is `pending`.
Then settle it:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  node scripts/simulate-mock-webhook.mjs --payment <paymentId> --outcome paid
```

Expected: `HTTP 200`, `status=paid mode=mock fulfilledAt=null`, license unchanged.

## 3. Test declined, pending and cancelled payments

```bash
… simulate-mock-webhook.mjs --payment <id> --outcome declined    # → failed (lastError: declined)
… simulate-mock-webhook.mjs --payment <id> --outcome pending     # → pending
… simulate-mock-webhook.mjs --payment <id> --outcome cancelled   # → cancelled
```

Checkout-creation failures are chosen with `mockScenario` on `createRecurrenteCheckout`:
`api_error` (gateway 500), `timeout` (network timeout), `unauthorized` (bad key). A scenario
only applies when a new checkout is created — if the same user already has a pending checkout
for the plan (within 30 minutes), that one is returned instead.

## 4. Simulate webhook notifications

Two paths, both through the real signature check:

- **HTTP (emulator only):** `scripts/simulate-mock-webhook.mjs` signs the event with the mock
  secret and POSTs it to `recurrenteWebhook`. Flags: `--duplicate` (same `svix-id` twice →
  second is `duplicate`), `--delay <s>` (late delivery). Deliver `paid`, then `pending` to see an
  out-of-order event recorded as `stale`. The script refuses non-local URLs.
- **Callable (emulator or deployed mock mode):** `simulateRecurrenteMockEvent({ paymentId,
  outcome, duplicate?, delaySeconds? })` — same ownership rules as reading a status; refused in live mode.

A mock signature never validates at a live endpoint: live uses the secret from Secret Manager.

## 5. Inspect payment records

- Emulator UI: <http://127.0.0.1:4000/firestore> → `mockPayments`, `mockPaymentWebhookEvents`.
- Production: Firebase console → Firestore → `payments`, `paymentWebhookEvents`.
- From the app: `getRecurrentePaymentStatus({ paymentId, refresh: true })` — `refresh` asks the
  provider and settles a payment whose webhook is late or lost.
- Logs: `firebase functions:log --only recurrenteWebhook` — every event logs its outcome
  (`paid`, `duplicate`, `stale`, `not_confirmed`, `review_required`, …).

## 6. Configure Firebase Secret Manager

Secrets require the Blaze plan. Each command prompts for the value — it is not echoed or stored
in shell history:

```bash
firebase functions:secrets:set RECURRENTE_SECRET_KEY        # sk_live_…
firebase functions:secrets:set RECURRENTE_WEBHOOK_SECRET    # whsec_… from Recurrente → Webhooks
firebase functions:secrets:get RECURRENTE_SECRET_KEY        # shows versions, not the value
```

Only functions that declare a secret receive it. Do **not** keep these keys in `functions/.env`:
values there are deployed as plain environment variables, visible in the Cloud console, and the same name can't be both a plain variable and a secret
(expect the deploy or the function start to fail).

## 7. Enable LIVE mode safely

Live requires all of:

1. `PAYMENT_PROVIDER_MODE=live` **and** `RECURRENTE_LIVE_ENABLED=true` in `functions/.env.vetsystem-b7675`.
   Either alone throws — there is no silent fallback in either direction.
2. A deployed runtime — live is refused inside the emulator.
3. Both secrets set (step 6). A missing key fails the checkout with `failed-precondition`.
4. `https://` return origins only.
5. A webhook endpoint in Recurrente (**Settings → Developers and API → Webhooks**) pointing to
   `https://us-central1-vetsystem-b7675.cloudfunctions.net/recurrenteWebhook`, subscribed **only to
   `intent.succeeded`, `intent.pending`, `intent.failed`, `intent.canceled`**. Recurrente also sends
   the legacy `payment_intent.*` events; they are acknowledged and ignored.

Before the first real customer, do one small real payment end to end with your own card and
refund it from the Recurrente dashboard.

Rollback: set `PAYMENT_PROVIDER_MODE=mock` and redeploy functions.

## 8. Validate the Recurrente credentials (optional, read-only)

`GET https://app.recurrente.com/api/test` only identifies the account behind a key — it creates
no checkout and charges nothing. The key is passed through an environment variable and never printed:

```bash
cd functions && npm run build
RECURRENTE_SECRET_KEY="$(firebase functions:secrets:access RECURRENTE_SECRET_KEY)" \
  npm run recurrente:check-credentials
```

Expected: `✔ Credentials accepted … environment: live`. A `401` means the key is wrong, revoked,
or has whitespace/newlines in it.

## 9. Deploy

```bash
cd functions
npm test                    # unit tests — no network, no Firestore
npm run test:emulator       # Firestore repository against the emulator (demo- project)
cd ..
firebase deploy --only functions
```

The GitHub workflow deploys Hosting only, never functions. Deploy functions **before** the
frontend: the new frontend calls `createRecurrenteCheckout`; the old one keeps working through the
deprecated `createCheckout` alias. Remove the alias once the new frontend is live.

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Deploy or start-up fails mentioning a secret | Secret not set (step 6), or the same name still exists in `functions/.env` |
| Callable → `failed-precondition: Payments are not available.` | Half-configured live mode — check both params; logs show the reason |
| Callable → `failed-precondition: Payments are not configured.` | Missing or rejected `RECURRENTE_SECRET_KEY` |
| Callable → `invalid-argument: returnOrigin is not allowed.` | Add the app origin to `PAYMENT_RETURN_ORIGINS` |
| Callable → `unavailable` | Recurrente timed out / 5xx — retry; the record is `failed` with `lastError` |
| Callable → `already-exists` | A checkout for the same user and plan is being created — retry in a moment |
| Webhook → `401` | Wrong `RECURRENTE_WEBHOOK_SECRET`, or the request body was altered, or the delivery is older than 5 minutes |
| Webhook → `500` | Transient (gateway or Firestore). Recurrente retries up to 6 times over ~8 h; retries are safe |
| Webhook `200` but payment not paid | Logged outcome tells why: `not_confirmed` (Recurrente says unpaid), `review_required` (amount/currency mismatch — check manually), `unmatched` (no `paymentId` in checkout metadata), `ignored` (legacy or unrelated event) |
| Paid but license not extended | Mock mode never extends licenses. In live, check `fulfilledAt` on the payment |
| `422 amount_exceeds_unverified_limit` | The Recurrente account is unverified (limit $50 USD cumulative) — verify the account |
