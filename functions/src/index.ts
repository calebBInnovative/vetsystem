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
