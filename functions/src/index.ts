import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();

setGlobalOptions({ region: 'us-central1' });

// Payments — Recurrente. Mock mode by default; see docs/payments/recurrente.md.
export {
  createRecurrenteCheckout,
  getRecurrentePaymentStatus,
  recurrenteWebhook,
  simulateRecurrenteMockEvent,
  createCheckout,
} from './payments/recurrente/recurrente.functions';

// Clinic registration — the only client-reachable path that creates a license.
export { registerClinic } from './clinics/clinic.functions';

// Manual payments (bank transfer / Kash): report, owner review, owner push alerts.
export { reportManualPayment, reviewManualPayment, sendOwnerTestPush } from './billing/manual-payments.functions';

// Expiry reminders: daily push to clinics about to expire, and an on-demand send.
export { notifyExpiringLicenses, sendExpiryReminderNow } from './billing/reminders.functions';
