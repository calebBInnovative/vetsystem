import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import {
  ManualPaymentError, reportManualPayment as report, reviewManualPayment as review, type ReportResult,
} from './manual-payments';
import { isPlatformOwnerEmail } from './platform';
import { pushToOwner } from './push';

function payload(request: CallableRequest<unknown>): Record<string, unknown> {
  return request.data && typeof request.data === 'object' ? (request.data as Record<string, unknown>) : {};
}

function toHttpsError(err: unknown): HttpsError {
  if (err instanceof HttpsError) return err;
  if (err instanceof ManualPaymentError) return new HttpsError(err.code, err.message);
  logger.error('[billing] unexpected error', { error: (err as Error).name, message: (err as Error).message });
  return new HttpsError('internal', 'Unexpected billing error.');
}

/** Best effort: a failed push must never fail the payment report itself. */
async function notifyOwner(result: ReportResult, clinicName: string): Promise<void> {
  try {
    await pushToOwner(getFirestore(), {
      title: 'Nuevo pago por confirmar',
      body:  `${clinicName} · ${result.currency} ${result.amount} · ${result.number}`,
      url:   '/admin/payments/',
      tag:   `invoice-${result.invoiceId}`,
    });
  } catch (err) {
    logger.warn('[billing] owner push failed', { message: (err as Error).message });
  }
}

// ─── reportManualPayment ──────────────────────────────────────────────────────
// Input:  { methodId, payerReference, paidOn: 'YYYY-MM-DD', note?, originBank?, transferType?, receiptPath?,
//          planId?: 'basic' | 'professional' | 'clinic', period?: 'monthly' | 'annual' }
// Output: { invoiceId, number, reference, amount, currency, graceUntil }

export const reportManualPayment = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
  const data = payload(request);
  try {
    const db = getFirestore();
    const result = await report(db, {
      uid:            request.auth.uid,
      email:          typeof request.auth.token.email === 'string' ? request.auth.token.email : null,
      methodId:       data.methodId,
      payerReference: data.payerReference,
      paidOn:         data.paidOn,
      note:           data.note,
      originBank:     data.originBank,
      transferType:   data.transferType,
      receiptPath:    data.receiptPath,
      planId:         data.planId,
      period:         data.period,
    });
    const invoice = await db.collection('subscriptionInvoices').doc(result.invoiceId).get();
    logger.info('[billing] manual payment reported', { invoiceId: result.invoiceId, clinicId: invoice.get('clinicId') });
    await notifyOwner(result, (invoice.get('clinicName') as string | undefined) ?? 'Clínica');
    return result;
  } catch (err) {
    throw toHttpsError(err);
  }
});

// ─── sendOwnerTestPush ────────────────────────────────────────────────────────
// Input: { delaySeconds? (0–15) } — platform owner only. Lets the owner close the
// app and check that a push reaches the phone/PWA without a real payment.

export const sendOwnerTestPush = onCall({ cors: true, timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
  if (!isPlatformOwnerEmail(request.auth.token.email)) {
    throw new HttpsError('permission-denied', 'Only the platform owner can send test pushes.');
  }
  const requested = Number(payload(request).delaySeconds ?? 0);
  const delay = Number.isFinite(requested) ? Math.min(Math.max(requested, 0), 15) : 0;
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay * 1000));
  const result = await pushToOwner(getFirestore(), {
    title: 'Prueba de VetSystem',
    body:  'Las notificaciones de pagos llegan a este dispositivo.',
    url:   '/admin/payments/',
    tag:   `test-${Date.now()}`,
  });
  logger.info('[billing] test push sent', result);
  return result;
});

// ─── reviewManualPayment ──────────────────────────────────────────────────────
// Input:  { invoiceId, decision: 'confirm' | 'reject', reason? } — platform owner only.

export const reviewManualPayment = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
  const email = request.auth.token.email;
  // Same check as isPlatformOwner() in firestore.rules (Auth keeps e-mails unique per project).
  if (!isPlatformOwnerEmail(email)) {
    throw new HttpsError('permission-denied', 'Only the platform owner can review payments.');
  }
  const data = payload(request);
  try {
    const result = await review(getFirestore(), {
      invoiceId: data.invoiceId,
      decision:  data.decision,
      reason:    data.reason,
      reviewer:  String(email),
    });
    logger.info('[billing] manual payment reviewed', { invoiceId: data.invoiceId, status: result.status });
    return result;
  } catch (err) {
    throw toHttpsError(err);
  }
});
