import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type {
  CheckoutLock,
  LicenseData,
  PaymentMode,
  PaymentRecord,
  RecurrenteCheckout,
  UserProfile,
  WebhookEventRecord,
} from './recurrente.types';
import type { MockGatewayStore } from './recurrente.mock';

/**
 * Reads and writes inside one atomic unit. Mirrors Firestore's rule that every
 * read happens before the first write — implementations may throw otherwise.
 */
export interface PaymentTransaction {
  getPayment(paymentId: string): Promise<PaymentRecord | null>;
  getLock(key: string): Promise<CheckoutLock | null>;
  getWebhookEvent(eventId: string): Promise<WebhookEventRecord | null>;
  getLicense(clinicId: string): Promise<LicenseData | null>;

  createPayment(record: PaymentRecord): void;
  updatePayment(paymentId: string, patch: Partial<PaymentRecord>): void;
  setLock(key: string, lock: CheckoutLock): void;
  createWebhookEvent(record: WebhookEventRecord): void;
  setLicense(clinicId: string, data: LicenseData): void;
}

export interface PaymentRepository {
  readonly mode: PaymentMode;
  newPaymentId(): string;
  getUser(uid: string): Promise<UserProfile | null>;
  getPayment(paymentId: string): Promise<PaymentRecord | null>;
  updatePayment(paymentId: string, patch: Partial<PaymentRecord>): Promise<void>;
  runTransaction<T>(fn: (tx: PaymentTransaction) => Promise<T>): Promise<T>;
}

/**
 * Mock and live records never share a collection: a query, an export or a
 * report over `payments` cannot pick up a simulated payment by accident.
 * None of these collections are matched in firestore.rules, so clients can
 * neither read nor forge them — only the Admin SDK (these functions) can.
 */
export const PAYMENT_COLLECTIONS: Record<PaymentMode, { payments: string; events: string; locks: string }> = {
  live: { payments: 'payments',     events: 'paymentWebhookEvents',     locks: 'paymentCheckoutLocks' },
  mock: { payments: 'mockPayments', events: 'mockPaymentWebhookEvents', locks: 'mockPaymentCheckoutLocks' },
};

export const MOCK_GATEWAY_COLLECTION = 'mockGateway';

export class MockFulfillmentError extends Error {
  constructor() {
    super('A mock payment attempted to touch a clinic license. Mock payments never fulfill.');
    this.name = 'MockFulfillmentError';
  }
}

export class FirestorePaymentRepository implements PaymentRepository {
  readonly #collections: { payments: string; events: string; locks: string };

  constructor(private readonly db: Firestore, readonly mode: PaymentMode) {
    this.#collections = PAYMENT_COLLECTIONS[mode];
  }

  newPaymentId(): string {
    const autoId = this.db.collection(this.#collections.payments).doc().id;
    return `${this.mode === 'mock' ? 'mock' : 'pay'}_${autoId}`;
  }

  async getUser(uid: string): Promise<UserProfile | null> {
    const snapshot = await this.db.collection('users').doc(uid).get();
    const data = snapshot.data();
    if (!data || typeof data.clinicId !== 'string') return null;
    return { clinicId: data.clinicId, role: typeof data.role === 'string' ? data.role : 'reception' };
  }

  async getPayment(paymentId: string): Promise<PaymentRecord | null> {
    const snapshot = await this.#paymentRef(paymentId).get();
    return snapshot.exists ? (snapshot.data() as PaymentRecord) : null;
  }

  async updatePayment(paymentId: string, patch: Partial<PaymentRecord>): Promise<void> {
    await this.#paymentRef(paymentId).update(patch);
  }

  runTransaction<T>(fn: (tx: PaymentTransaction) => Promise<T>): Promise<T> {
    return this.db.runTransaction((transaction) => fn(this.#wrap(transaction)));
  }

  #paymentRef(paymentId: string) {
    return this.db.collection(this.#collections.payments).doc(paymentId);
  }

  #licenseRef(clinicId: string) {
    return this.db.collection('clinics').doc(clinicId).collection('license').doc('data');
  }

  #wrap(transaction: Transaction): PaymentTransaction {
    const db = this.db;
    const collections = this.#collections;
    const isMock = this.mode === 'mock';
    const paymentRef = (id: string) => this.#paymentRef(id);
    const licenseRef = (id: string) => this.#licenseRef(id);

    return {
      async getPayment(paymentId) {
        const snapshot = await transaction.get(paymentRef(paymentId));
        return snapshot.exists ? (snapshot.data() as PaymentRecord) : null;
      },
      async getLock(key) {
        const snapshot = await transaction.get(db.collection(collections.locks).doc(key));
        return snapshot.exists ? (snapshot.data() as CheckoutLock) : null;
      },
      async getWebhookEvent(eventId) {
        const snapshot = await transaction.get(db.collection(collections.events).doc(eventId));
        return snapshot.exists ? (snapshot.data() as WebhookEventRecord) : null;
      },
      async getLicense(clinicId) {
        if (isMock) throw new MockFulfillmentError();
        const snapshot = await transaction.get(licenseRef(clinicId));
        return snapshot.exists ? (snapshot.data() as LicenseData) : null;
      },
      createPayment(record) {
        transaction.create(paymentRef(record.id), record);
      },
      updatePayment(paymentId, patch) {
        transaction.update(paymentRef(paymentId), patch);
      },
      setLock(key, lock) {
        transaction.set(db.collection(collections.locks).doc(key), lock);
      },
      createWebhookEvent(record) {
        // create() fails if the document exists — a second line of defence
        // against two concurrent deliveries of the same event.
        transaction.create(db.collection(collections.events).doc(record.id), record);
      },
      setLicense(clinicId, data) {
        if (isMock) throw new MockFulfillmentError();
        transaction.set(licenseRef(clinicId), { ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      },
    };
  }
}

/** Mock gateway state kept in Firestore so emulator and deployed mock mode survive between calls. */
export class FirestoreMockGatewayStore implements MockGatewayStore {
  constructor(private readonly db: Firestore) {}

  async get(checkoutId: string): Promise<RecurrenteCheckout | null> {
    const snapshot = await this.db.collection(MOCK_GATEWAY_COLLECTION).doc(checkoutId).get();
    return snapshot.exists ? (snapshot.data() as RecurrenteCheckout) : null;
  }

  async put(checkout: RecurrenteCheckout): Promise<void> {
    await this.db.collection(MOCK_GATEWAY_COLLECTION).doc(checkout.id).set(checkout);
  }
}
