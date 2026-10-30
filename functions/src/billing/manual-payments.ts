import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { extendExpiration } from '../payments/recurrente/recurrente.service';

/**
 * Manual payments: a clinic pays by bank transfer or Kash and reports it; the
 * platform owner checks the bank and confirms or rejects. Nothing here talks to
 * a payment provider — the money is verified by a person (or, later, by matching
 * bank notification e-mails), so every license change waits for that review,
 * except a short provisional grace that keeps the clinic working meanwhile.
 *
 * Firestore layout (server-written only, see firestore.rules):
 *   platform/billing                      owner-editable config (methods, prices, grace)
 *   platform/counters                     invoice number sequence
 *   subscriptionInvoices/{id}             one record per reported payment
 *   clinics/{clinicId}/license/data       graceUntil, plan, expirationDate…
 */

export const BILLING_CONFIG_PATH = 'platform/billing';
export const COUNTERS_PATH = 'platform/counters';
export const INVOICES_COLLECTION = 'subscriptionInvoices';

/** Days of access a confirmed manual payment adds — same as the card plan. */
export const MANUAL_PERIOD_DAYS = 30;
export const DEFAULT_GRACE_DAYS = 3;
const MAX_GRACE_DAYS = 7;

const MANAGER_ROLES = new Set(['admin', 'master']);

export type ManualPaymentErrorCode =
  | 'invalid-argument' | 'permission-denied' | 'not-found' | 'already-exists' | 'failed-precondition';

export class ManualPaymentError extends Error {
  constructor(readonly code: ManualPaymentErrorCode, message: string) {
    super(message);
    this.name = 'ManualPaymentError';
  }
}

export type PaymentMethodType = 'kash' | 'bank';
export type PaymentCurrency = 'USD' | 'NIO';

export interface PaymentMethodConfig {
  id: string;
  type: PaymentMethodType;
  /** Shown to clinics, e.g. "Kash", "BAC", "LAFISE" */
  label: string;
  holder: string;
  /** Kash phone number or bank account number */
  account: string;
  currency: PaymentCurrency;
  enabled: boolean;
}

export interface BillingConfig {
  methods: PaymentMethodConfig[];
  /** Price per period in each currency; a method can only be used if its currency has a price. */
  prices: Partial<Record<PaymentCurrency, number>>;
  graceDays: number;
}

export type InvoiceStatus = 'pending' | 'confirmed' | 'rejected';

export interface SubscriptionInvoice {
  id: string;
  number: string;
  clinicId: string;
  clinicName: string;
  reference: string;
  methodId: string;
  methodLabel: string;
  amount: number;
  currency: PaymentCurrency;
  /** Transfer receipt / confirmation number typed by the clinic */
  payerReference: string;
  /** YYYY-MM-DD the clinic says it paid */
  paidOn: string;
  note: string | null;
  reportedBy: { uid: string; email: string | null; name: string | null };
  status: InvoiceStatus;
  periodDays: number;
  /** ms timestamp until which the report keeps the clinic working, or null */
  graceUntil: number | null;
  createdAt: number;
  reviewedAt: number | null;
  reviewedBy: string | null;
  rejectReason: string | null;
  /** License expiration after confirmation */
  newExpirationDate: string | null;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Stable per-clinic code the clinic writes in the transfer description, so the
 * owner (and later the e-mail matcher) can tell whose money arrived. Mirrored in
 * src/lib/billing/manual-payments.ts — keep both identical.
 */
export function clinicPaymentReference(clinicId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < clinicId.length; i++) {
    hash ^= clinicId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `VS-${hash.toString(36).toUpperCase().padStart(6, '0').slice(-6)}`;
}

export function invoiceNumber(year: number, sequence: number): string {
  return `PAG-${year}-${String(sequence).padStart(4, '0')}`;
}

/** Normalises a receipt number so "AB-12 34" and "ab1234" count as the same transfer. */
export function normalizePayerReference(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function parseBillingConfig(data: Record<string, unknown> | undefined): BillingConfig {
  const rawMethods = Array.isArray(data?.methods) ? data.methods : [];
  const methods: PaymentMethodConfig[] = rawMethods.flatMap((m: unknown) => {
    const r = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.label !== 'string') return [];
    return [{
      id:       r.id,
      type:     r.type === 'kash' ? 'kash' : 'bank',
      label:    r.label,
      holder:   typeof r.holder === 'string' ? r.holder : '',
      account:  typeof r.account === 'string' ? r.account : '',
      currency: r.currency === 'NIO' ? 'NIO' : 'USD',
      enabled:  r.enabled === true,
    }];
  });
  const rawPrices = (data?.prices && typeof data.prices === 'object' ? data.prices : {}) as Record<string, unknown>;
  const prices: BillingConfig['prices'] = {};
  for (const currency of ['USD', 'NIO'] as const) {
    const value = rawPrices[currency];
    if (typeof value === 'number' && value > 0) prices[currency] = value;
  }
  const grace = typeof data?.graceDays === 'number' ? Math.floor(data.graceDays) : DEFAULT_GRACE_DAYS;
  return { methods, prices, graceDays: Math.min(Math.max(grace, 0), MAX_GRACE_DAYS) };
}

function requiredText(value: unknown, field: string, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new ManualPaymentError('invalid-argument', `${field} is required.`);
  if (text.length > max) throw new ManualPaymentError('invalid-argument', `${field} is too long.`);
  return text;
}

function isoDate(value: unknown, now: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new ManualPaymentError('invalid-argument', 'paidOn must be YYYY-MM-DD.');
  }
  const tomorrow = new Date(now + 86_400_000).toISOString().slice(0, 10);
  if (text > tomorrow) throw new ManualPaymentError('invalid-argument', 'paidOn cannot be in the future.');
  return text;
}

// ─── Report (clinic) ──────────────────────────────────────────────────────────

export interface ReportInput {
  uid: string;
  email: string | null;
  methodId: unknown;
  payerReference: unknown;
  paidOn: unknown;
  note?: unknown;
}

export interface ReportResult {
  invoiceId: string;
  number: string;
  reference: string;
  amount: number;
  currency: PaymentCurrency;
  graceUntil: number | null;
}

export async function reportManualPayment(db: Firestore, input: ReportInput, now = Date.now()): Promise<ReportResult> {
  const methodId       = requiredText(input.methodId, 'methodId', 40);
  const payerReference = requiredText(input.payerReference, 'payerReference', 64);
  const normalizedRef  = normalizePayerReference(payerReference);
  if (normalizedRef.length < 3) throw new ManualPaymentError('invalid-argument', 'payerReference is too short.');
  const paidOn = isoDate(input.paidOn, now);
  const note   = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 500) : null;

  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(db.collection('users').doc(input.uid));
    const clinicId = userSnap.get('clinicId');
    const role     = userSnap.get('role');
    if (!userSnap.exists || typeof clinicId !== 'string' || !clinicId) {
      throw new ManualPaymentError('permission-denied', 'User profile not found.');
    }
    if (clinicId === 'demo') throw new ManualPaymentError('failed-precondition', 'Demo clinics cannot pay.');
    if (!MANAGER_ROLES.has(role)) throw new ManualPaymentError('permission-denied', 'Only clinic managers can report payments.');

    const config = parseBillingConfig((await tx.get(db.doc(BILLING_CONFIG_PATH))).data());
    const method = config.methods.find((m) => m.id === methodId && m.enabled);
    if (!method) throw new ManualPaymentError('invalid-argument', 'Payment method is not available.');
    const amount = config.prices[method.currency];
    if (!amount) throw new ManualPaymentError('failed-precondition', 'No price is configured for this currency.');

    const invoices = db.collection(INVOICES_COLLECTION);
    const pending = await tx.get(invoices.where('clinicId', '==', clinicId).where('status', '==', 'pending').limit(1));
    if (!pending.empty) {
      throw new ManualPaymentError('already-exists', 'This clinic already has a payment waiting for confirmation.');
    }
    // The same receipt cannot be reported twice, by this or any other clinic.
    const duplicate = await tx.get(invoices
      .where('methodId', '==', method.id)
      .where('payerReferenceKey', '==', normalizedRef)
      .where('status', 'in', ['pending', 'confirmed'])
      .limit(1));
    if (!duplicate.empty) {
      throw new ManualPaymentError('already-exists', 'This receipt number was already reported.');
    }

    const licenseRef  = db.doc(`clinics/${clinicId}/license/data`);
    const licenseSnap = await tx.get(licenseRef);
    const clinicSnap  = await tx.get(db.doc(`clinics/${clinicId}`));
    const counterRef  = db.doc(COUNTERS_PATH);
    const counterSnap = await tx.get(counterRef);

    const year     = new Date(now).getUTCFullYear();
    const counters = (counterSnap.data()?.invoices ?? {}) as Record<string, number>;
    const sequence = (counters[String(year)] ?? 0) + 1;
    const number   = invoiceNumber(year, sequence);
    const reference = clinicPaymentReference(clinicId);
    const graceUntil = config.graceDays > 0 ? now + config.graceDays * 86_400_000 : null;

    const ref = invoices.doc();
    const invoice: SubscriptionInvoice & { payerReferenceKey: string } = {
      id:                ref.id,
      number,
      clinicId,
      clinicName:        (clinicSnap.get('name') as string | undefined) ?? (licenseSnap.get('clinicName') as string | undefined) ?? clinicId,
      reference,
      methodId:          method.id,
      methodLabel:       method.label,
      amount,
      currency:          method.currency,
      payerReference,
      payerReferenceKey: normalizedRef,
      paidOn,
      note,
      reportedBy:        { uid: input.uid, email: input.email, name: (userSnap.get('name') as string | undefined) ?? null },
      status:            'pending',
      periodDays:        MANUAL_PERIOD_DAYS,
      graceUntil,
      createdAt:         now,
      reviewedAt:        null,
      reviewedBy:        null,
      rejectReason:      null,
      newExpirationDate: null,
    };

    tx.create(ref, invoice);
    tx.set(counterRef, { invoices: { [String(year)]: sequence } }, { merge: true });
    if (graceUntil) {
      tx.set(licenseRef, { graceUntil, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }

    return { invoiceId: ref.id, number, reference, amount, currency: method.currency, graceUntil };
  });
}

// ─── Review (platform owner) ──────────────────────────────────────────────────

export interface ReviewInput {
  invoiceId: unknown;
  decision: unknown;
  reason?: unknown;
  /** Who decided: the owner's e-mail, or e.g. "email-match" for automatic matching */
  reviewer: string;
}

export interface ReviewResult {
  status: InvoiceStatus;
  newExpirationDate: string | null;
}

export async function reviewManualPayment(db: Firestore, input: ReviewInput, now = Date.now()): Promise<ReviewResult> {
  const invoiceId = requiredText(input.invoiceId, 'invoiceId', 64);
  if (input.decision !== 'confirm' && input.decision !== 'reject') {
    throw new ManualPaymentError('invalid-argument', 'decision must be confirm or reject.');
  }
  const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim().slice(0, 300) : null;

  return db.runTransaction(async (tx) => {
    const invoiceRef  = db.collection(INVOICES_COLLECTION).doc(invoiceId);
    const invoiceSnap = await tx.get(invoiceRef);
    if (!invoiceSnap.exists) throw new ManualPaymentError('not-found', 'Invoice not found.');
    const invoice = invoiceSnap.data() as SubscriptionInvoice;
    if (invoice.status !== 'pending') {
      throw new ManualPaymentError('failed-precondition', `Invoice is already ${invoice.status}.`);
    }

    const licenseRef  = db.doc(`clinics/${invoice.clinicId}/license/data`);
    const license     = (await tx.get(licenseRef)).data() ?? {};

    if (input.decision === 'reject') {
      tx.update(invoiceRef, { status: 'rejected', reviewedAt: now, reviewedBy: input.reviewer, rejectReason: reason });
      // Withdraw the provisional access this report granted (and only that).
      if (invoice.graceUntil && license.graceUntil === invoice.graceUntil) {
        tx.set(licenseRef, { graceUntil: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      return { status: 'rejected', newExpirationDate: null };
    }

    // Same rule as card payments: a clinic under a billing notice starts its paid
    // period today instead of carrying over days of the free license it replaces.
    const carried = license.billingNotice ? undefined : (license.expirationDate as string | undefined);
    const newExpirationDate = extendExpiration(carried, invoice.periodDays, now);
    tx.set(licenseRef, {
      subscription:   true,
      plan:           'monthly',
      expirationDate: newExpirationDate,
      billingNotice:  null,
      graceUntil:     null,
      lastPaymentAt:  now,
      updatedAt:      FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.update(invoiceRef, { status: 'confirmed', reviewedAt: now, reviewedBy: input.reviewer, newExpirationDate });
    return { status: 'confirmed', newExpirationDate };
  });
}
