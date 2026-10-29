import {
  collection, doc, onSnapshot, orderBy, query, setDoc, where, limit, serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseApp, getFirebaseFunctions, getFirestoreDb } from '@/lib/firebase/firebase.config';

/**
 * Client side of manual payments (bank transfer / Kash). The server owns every
 * write that matters — see functions/src/billing/manual-payments.ts.
 */

export type PaymentMethodType = 'kash' | 'bank';
export type PaymentCurrency = 'USD' | 'NIO';
export type InvoiceStatus = 'pending' | 'confirmed' | 'rejected';

export interface PaymentMethodConfig {
  id: string;
  type: PaymentMethodType;
  label: string;
  holder: string;
  account: string;
  currency: PaymentCurrency;
  enabled: boolean;
}

export interface BillingConfig {
  methods: PaymentMethodConfig[];
  prices: Partial<Record<PaymentCurrency, number>>;
  graceDays: number;
  /** Owner's WhatsApp in international format without "+" (e.g. 50588880000) */
  ownerWhatsapp: string;
  /** Show the card checkout (Recurrente). Off while payouts to Nicaragua are unresolved. */
  cardEnabled: boolean;
}

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
  payerReference: string;
  paidOn: string;
  note: string | null;
  reportedBy: { uid: string; email: string | null; name: string | null };
  status: InvoiceStatus;
  periodDays: number;
  graceUntil: number | null;
  createdAt: number;
  reviewedAt: number | null;
  reviewedBy: string | null;
  rejectReason: string | null;
  newExpirationDate: string | null;
}

/** The three channels the owner offers today. Their details are edited in /admin/payments. */
export const DEFAULT_METHODS: PaymentMethodConfig[] = [
  { id: 'kash',   type: 'kash', label: 'Kash',   holder: '', account: '', currency: 'USD', enabled: false },
  { id: 'bac',    type: 'bank', label: 'BAC',    holder: '', account: '', currency: 'USD', enabled: false },
  { id: 'lafise', type: 'bank', label: 'LAFISE', holder: '', account: '', currency: 'USD', enabled: false },
];

export const EMPTY_BILLING_CONFIG: BillingConfig = {
  methods: DEFAULT_METHODS, prices: { USD: 20 }, graceDays: 3, ownerWhatsapp: '', cardEnabled: false,
};

const CURRENCY_SYMBOL: Record<PaymentCurrency, string> = { USD: 'US$', NIO: 'C$' };

export function formatMoney(amount: number, currency: PaymentCurrency): string {
  return `${CURRENCY_SYMBOL[currency]}${amount.toLocaleString('es-NI', { maximumFractionDigits: 2 })}`;
}

/**
 * Stable per-clinic code written in the transfer description. Mirrors
 * clinicPaymentReference() in functions/src/billing/manual-payments.ts — keep identical.
 */
export function clinicPaymentReference(clinicId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < clinicId.length; i++) {
    hash ^= clinicId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `VS-${hash.toString(36).toUpperCase().padStart(6, '0').slice(-6)}`;
}

function parseConfig(data: Record<string, unknown> | undefined): BillingConfig {
  if (!data) return EMPTY_BILLING_CONFIG;
  const stored = Array.isArray(data.methods) ? (data.methods as PaymentMethodConfig[]) : [];
  // Keep the default channels even if the stored document predates one of them.
  const methods = DEFAULT_METHODS.map((m) => ({ ...m, ...stored.find((s) => s.id === m.id) }));
  const prices = (data.prices && typeof data.prices === 'object' ? data.prices : {}) as BillingConfig['prices'];
  return {
    methods,
    prices,
    graceDays:     typeof data.graceDays === 'number' ? data.graceDays : EMPTY_BILLING_CONFIG.graceDays,
    ownerWhatsapp: typeof data.ownerWhatsapp === 'string' ? data.ownerWhatsapp : '',
    cardEnabled:   data.cardEnabled === true,
  };
}

/** Live payment instructions. Calls back with EMPTY_BILLING_CONFIG until configured. */
export function subscribeBillingConfig(onChange: (config: BillingConfig) => void): Unsubscribe {
  return onSnapshot(
    doc(getFirestoreDb(), 'platform', 'billing'),
    (snap) => onChange(parseConfig(snap.data())),
    (err) => console.warn('[billing] config listener failed:', err),
  );
}

/** Platform owner only (enforced by firestore.rules). */
export async function saveBillingConfig(config: BillingConfig): Promise<void> {
  await setDoc(doc(getFirestoreDb(), 'platform', 'billing'), { ...config, updatedAt: serverTimestamp() });
}

function toInvoice(id: string, data: Record<string, unknown>): SubscriptionInvoice {
  return { ...(data as unknown as SubscriptionInvoice), id };
}

/** Platform owner: invoices with a given status, newest first, live. */
export function subscribeInvoicesByStatus(
  status: InvoiceStatus,
  onChange: (invoices: SubscriptionInvoice[]) => void,
  max = 100,
): Unsubscribe {
  const q = query(
    collection(getFirestoreDb(), 'subscriptionInvoices'),
    where('status', '==', status),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => toInvoice(d.id, d.data()))),
    (err) => console.warn('[billing] invoices listener failed:', err));
}

/** Clinic: its own recent payment reports, live. */
export function subscribeClinicInvoices(
  clinicId: string,
  onChange: (invoices: SubscriptionInvoice[]) => void,
): Unsubscribe {
  const q = query(
    collection(getFirestoreDb(), 'subscriptionInvoices'),
    where('clinicId', '==', clinicId),
    orderBy('createdAt', 'desc'),
    limit(10),
  );
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => toInvoice(d.id, d.data()))),
    (err) => console.warn('[billing] clinic invoices listener failed:', err));
}

export interface ReportPaymentInput {
  methodId: string;
  payerReference: string;
  paidOn: string;
  note?: string;
}

export interface ReportPaymentResult {
  invoiceId: string;
  number: string;
  reference: string;
  amount: number;
  currency: PaymentCurrency;
  graceUntil: number | null;
}

export async function reportManualPayment(input: ReportPaymentInput): Promise<ReportPaymentResult> {
  const fn = httpsCallable<ReportPaymentInput, ReportPaymentResult>(getFirebaseFunctions(), 'reportManualPayment');
  return (await fn(input)).data;
}

export async function reviewManualPayment(
  invoiceId: string,
  decision: 'confirm' | 'reject',
  reason?: string,
): Promise<{ status: InvoiceStatus; newExpirationDate: string | null }> {
  const fn = httpsCallable<
    { invoiceId: string; decision: 'confirm' | 'reject'; reason?: string },
    { status: InvoiceStatus; newExpirationDate: string | null }
  >(getFirebaseFunctions(), 'reviewManualPayment');
  return (await fn({ invoiceId, decision, reason })).data;
}

/** Maps a callable error to a message for the clinic. */
export function reportErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const message = (err as { message?: string })?.message ?? '';
  if (code.endsWith('already-exists')) {
    return message.includes('receipt')
      ? 'Ese número de comprobante ya fue reportado.'
      : 'Ya tienes un pago en revisión. Te avisaremos cuando se confirme.';
  }
  if (code.endsWith('permission-denied')) return 'Solo el administrador de la clínica puede reportar pagos.';
  if (code.endsWith('invalid-argument')) return 'Revisa los datos: método, número de comprobante y fecha.';
  if (code.endsWith('failed-precondition')) return 'Los pagos por transferencia no están disponibles todavía.';
  return 'No se pudo reportar el pago. Revisa tu conexión e intenta de nuevo.';
}

/** wa.me link with the payment details already written, for the clinic to notify the owner. */
export function whatsappReportLink(
  ownerWhatsapp: string,
  details: { clinicName: string; number: string; methodLabel: string; amount: number; currency: PaymentCurrency; payerReference: string },
): string | null {
  const phone = ownerWhatsapp.replace(/\D/g, '');
  if (!phone) return null;
  const text = `Hola, reporté el pago de VetSystem de ${details.clinicName}.\n`
    + `Factura: ${details.number}\nMétodo: ${details.methodLabel}\n`
    + `Monto: ${formatMoney(details.amount, details.currency)}\nComprobante: ${details.payerReference}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

// ─── Web push for the platform owner ─────────────────────────────────────────

export const PUSH_SUPPORTED_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? '';

/**
 * Asks permission, registers this device with Firebase Cloud Messaging through
 * public/sw.js and stores the token so reportManualPayment can push to it.
 */
export async function enableOwnerPush(): Promise<'enabled' | 'denied' | 'unsupported' | 'not-configured'> {
  if (!PUSH_SUPPORTED_KEY) return 'not-configured';
  const { isSupported, getMessaging, getToken } = await import('firebase/messaging');
  if (!(await isSupported()) || !('serviceWorker' in navigator)) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const registration = await navigator.serviceWorker.register('/sw.js');
  const token = await getToken(getMessaging(getFirebaseApp()), {
    vapidKey: PUSH_SUPPORTED_KEY,
    serviceWorkerRegistration: registration,
  });
  await setDoc(doc(getFirestoreDb(), 'platformPushTokens', token), {
    createdAt: serverTimestamp(),
    userAgent: navigator.userAgent.slice(0, 200),
  });
  return 'enabled';
}
