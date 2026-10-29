import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import {
  ManualPaymentError, reportManualPayment as report, reviewManualPayment as review, type ReportResult,
} from './manual-payments';
import { isPlatformOwnerEmail } from './platform';

/** Devices of the platform owner that accepted web push (written from /admin/payments). */
export const PUSH_TOKENS_COLLECTION = 'platformPushTokens';

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
    const db = getFirestore();
    const tokensSnap = await db.collection(PUSH_TOKENS_COLLECTION).get();
    const tokens = tokensSnap.docs.map((d) => d.id);
    if (tokens.length === 0) return;

    const response = await getMessaging().sendEachForMulticast({
      tokens,
      // Data-only: public/sw.js renders it, so the browser never shows it twice.
      data: {
        title: 'Nuevo pago por confirmar',
        body:  `${clinicName} · ${result.currency} ${result.amount} · ${result.number}`,
        url:   '/admin/payments/',
        tag:   `invoice-${result.invoiceId}`,
      },
      webpush: { headers: { Urgency: 'high' } },
    });

    // Forget devices that uninstalled or revoked permission.
    const stale = response.responses.flatMap((r, i) =>
      !r.success && ['messaging/registration-token-not-registered', 'messaging/invalid-argument']
        .includes(r.error?.code ?? '') ? [tokens[i]] : []);
    await Promise.all(stale.map((token) => db.collection(PUSH_TOKENS_COLLECTION).doc(token).delete()));
  } catch (err) {
    logger.warn('[billing] owner push failed', { message: (err as Error).message });
  }
}

// ─── reportManualPayment ──────────────────────────────────────────────────────
// Input:  { methodId, payerReference, paidOn: 'YYYY-MM-DD', note? }
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
    });
    const invoice = await db.collection('subscriptionInvoices').doc(result.invoiceId).get();
    logger.info('[billing] manual payment reported', { invoiceId: result.invoiceId, clinicId: invoice.get('clinicId') });
    await notifyOwner(result, (invoice.get('clinicName') as string | undefined) ?? 'Clínica');
    return result;
  } catch (err) {
    throw toHttpsError(err);
  }
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
