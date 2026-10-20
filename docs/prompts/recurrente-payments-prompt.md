# PROMPT — Resume the Recurrente payments integration (VetSystem)

Paste this into a new session to pick up where we left off. Read `CLAUDE.md` (§18c) and
`docs/payments/recurrente.md` before changing anything.

## Where we are (2026-10-09)

The Recurrente payment integration is **built and tested in MOCK mode only**. Nothing has been
deployed, no real payment has been made, and the Recurrente API has never been called.

**Blocker:** the Firebase project (`vetsystem-b7675`) needs the **Blaze (pay-as-you-go) plan** before
functions can be deployed. The Spark plan can't deploy Cloud Functions, use Secret Manager, or make
outbound calls to `app.recurrente.com`. **The emulator needs no billing plan**, so everything in mock
mode can be tested locally now.

Before you start:

1. Run `git status`. If the files listed below are still uncommitted, commit them first.
2. Run `cd functions && npm test`. All 54 tests should pass.

## What was built

All code is in `functions/src/payments/recurrente/`:

| File | Role |
|---|---|
| `recurrente.types.ts` | API shapes (only fields documented at docs.recurrente.com) + internal `PaymentRecord` |
| `recurrente.client.ts` | Live HTTP client: `X-SECRET-KEY` header, 10 s timeout, stable error codes, never logs the key |
| `recurrente.mock.ts` | Mock provider (state in `mockGateway` collection), mock signing secret, Svix signer |
| `recurrente.service.ts` | `createCheckout`, `getPaymentStatus` (+ `refresh`), `processWebhookEvent`, license renewal |
| `recurrente.webhook.ts` | Svix signature + replay check, maps results to 200 / 401 / 405 / 500 |
| `payment.repository.ts` | Firestore access. A mock repository throws if anything touches a license |
| `recurrente.plans.ts` | Server-side price list: `monthly` = 2000 cents **USD** (US$20), 30 days |
| `recurrente.config.ts` | Mode resolution and live safeguards |
| `recurrente.functions.ts` | Function definitions, params and secrets |

Other files:

- `functions/test/`: unit tests, plus `test/emulator/firestore-repository.itest.ts` for the Firestore emulator.
- `functions/scripts/simulate-mock-webhook.mjs`: emulator-only webhook simulator.
- `functions/scripts/check-recurrente-credentials.mjs`: read-only `GET /api/test`. **Never run without the user's approval.**
- `src/hooks/useSubscription.ts`: now calls `createRecurrenteCheckout({ planId, returnOrigin })`.
- `docs/payments/recurrente.md`: full operator guide covering mock testing, secrets, going live, deploy and troubleshooting.

### Cloud Functions

- `createRecurrenteCheckout`
- `getRecurrentePaymentStatus`
- `recurrenteWebhook` (same URL as before)
- `simulateRecurrenteMockEvent` (mock mode only)
- `createCheckout`: deprecated alias for the old frontend. Remove it once the new frontend is deployed.

### Key decisions (do not undo without a reason)

- **Mock is the default mode.** Live needs `PAYMENT_PROVIDER_MODE=live` and `RECURRENTE_LIVE_ENABLED=true`
  on a deployed runtime; the emulator refuses live. A half-configured live mode throws instead of
  falling back to mock.
- **Mock and live are kept apart.** They use separate collections (`mockPayments`/`payments`,
  `mock…WebhookEvents`, `mock…CheckoutLocks`). The service refuses to pair a mock repository with the
  live client, or the reverse. A mock payment never renews a license.
- **A payment is paid only when Recurrente confirms it.** The webhook re-checks with
  `GET /checkouts/{id}`, and the amount and currency must match; on a mismatch the payment is flagged
  `reviewRequired`. Webhooks are deduplicated by `svix-id` in the same transaction that updates the
  payment and the license. `paid` is final, so a late event is recorded as `stale`.
- **The license that gets renewed is `clinics/{clinicId}/license/data`.** That's the doc the app
  reads. The old code wrote to `clinics/{id}`, so payments never renewed anything.
- **Webhook events.** Only `intent.succeeded`, `intent.pending`, `intent.failed` and `intent.canceled`
  are handled. Legacy `payment_intent.*` events are acknowledged and ignored.
- **Currency is USD.** Recurrente only accepts GTQ and USD; córdobas (NIO) are not supported.

## Test in the emulator now (no Blaze needed)

```bash
cd functions && npm run build && npm test && npm run test:emulator
firebase emulators:start --only functions,firestore,auth --project demo-vetsystem
# in another terminal, once you have a mock paymentId:
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/simulate-mock-webhook.mjs \
  --payment <id> --outcome paid|declined|pending|cancelled [--duplicate] [--delay 5]
```

To test from the UI, run the web app with `NEXT_PUBLIC_USE_EMULATOR=true`, register a clinic in the
emulator, and press the subscribe button in the license banner.

`functions/.env.local` and `functions/.secret.local` hold emulator-only placeholder values (both are
git-ignored).

Caveat: the emulator also loads `functions/.env`, which **currently contains the real `sk_live_` key**.
Mock mode never reads it, and live mode is refused in the emulator, but the key still needs to move
(step 2 below).

## Remaining steps after enabling Blaze

1. **Set a budget alert** in Google Cloud Billing (for example $5–10/month) before deploying anything.
2. **Move the secrets** out of `functions/.env` into Secret Manager. The values in that file are
   deployed as plain environment variables, and their names clash with the secrets:
   ```bash
   firebase functions:secrets:set RECURRENTE_SECRET_KEY       # sk_live_…
   firebase functions:secrets:set RECURRENTE_WEBHOOK_SECRET   # whsec_… (Recurrente → Webhooks)
   ```
   Then delete those lines (and the old `RECURRENTE_PLAN_*` lines) from `functions/.env`.
3. **Deploy in MOCK mode first:** `firebase deploy --only functions`. Test with
   `simulateRecurrenteMockEvent`. Deploy functions before Hosting.
4. *Optional, with the user's approval:* validate the key (read-only):
   `RECURRENTE_SECRET_KEY="$(firebase functions:secrets:access RECURRENTE_SECRET_KEY)" npm run recurrente:check-credentials`.
   Also check whether the personal account can create a TEST key (Settings → API Keys); the docs say
   it can.
5. **Register the webhook** in Recurrente for `intent.*` only:
   `https://us-central1-vetsystem-b7675.cloudfunctions.net/recurrenteWebhook`
6. **Go live** only when the user says so. Create `functions/.env.vetsystem-b7675` with
   `PAYMENT_PROVIDER_MODE=live` and `RECURRENTE_LIVE_ENABLED=true`, redeploy, then make one small real
   payment with the user's own card and refund it from Recurrente. To roll back, set the mode to `mock`
   and redeploy.
7. **Verify the Recurrente account.** Unverified accounts are capped at $50 USD in total
   (`422 amount_exceeds_unverified_limit`).

## Open issues not fixed yet

- **`firestore.rules` lets a clinic `master` write `clinics/{id}/license/data` from the browser**,
  which means renewing without paying. Fixing it requires moving the license write done at
  registration (`src/lib/auth/auth.service.ts`) into a Cloud Function first, then making the license
  doc read-only for clients.
- **Remove the deprecated `createCheckout`** export once the new frontend is live.
- **Optional UX:** on `/dashboard?pago=<id>`, poll `getRecurrentePaymentStatus({ paymentId, refresh: true })`
  and show the result.

## Guardrails

- Never print, log, commit or hardcode the `sk_live_` key. Read it only from Secret Manager.
- Never run a real payment, the credentials check, or a production deploy without explicit approval.
- Tests must never reach the network: `fetch` is replaced with one that throws in `test/helpers.ts`.
- Don't invent Recurrente endpoints or fields. Check https://docs.recurrente.com/llms.txt (append
  `.md` to any page for markdown).
- All code in English; only user-facing UI text in Spanish.
