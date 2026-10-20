import type { PaymentRepository, PaymentTransaction } from '../src/payments/recurrente/payment.repository';
import { MockFulfillmentError } from '../src/payments/recurrente/payment.repository';
import { RecurrenteClient } from '../src/payments/recurrente/recurrente.client';
import type {
  CheckoutLock,
  LicenseData,
  PaymentMode,
  PaymentRecord,
  RecurrenteCheckout,
  RecurrenteCreateCheckoutRequest,
  UserProfile,
  WebhookEventRecord,
} from '../src/payments/recurrente/recurrente.types';

// Any accidental real HTTP call fails the test run instead of reaching Recurrente.
globalThis.fetch = (() => {
  throw new Error('Network access is forbidden in tests.');
}) as typeof fetch;

/**
 * In-memory repository with Firestore transaction semantics: reads after the
 * first write throw, writes apply only on commit, create() fails on existing docs.
 */
export class InMemoryPaymentRepository implements PaymentRepository {
  readonly users    = new Map<string, UserProfile>();
  readonly payments = new Map<string, PaymentRecord>();
  readonly locks    = new Map<string, CheckoutLock>();
  readonly events   = new Map<string, WebhookEventRecord>();
  readonly licenses = new Map<string, LicenseData>();

  /** Number of upcoming commits / direct updates that should fail. */
  failCommits = 0;
  failUpdates = 0;
  #seq = 0;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(readonly mode: PaymentMode) {}

  newPaymentId() {
    return `${this.mode === 'mock' ? 'mock' : 'pay'}_${++this.#seq}`;
  }

  async getUser(uid: string) {
    return this.users.get(uid) ?? null;
  }

  async getPayment(id: string) {
    const payment = this.payments.get(id);
    return payment ? structuredClone(payment) : null;
  }

  async updatePayment(id: string, patch: Partial<PaymentRecord>) {
    if (this.failUpdates > 0) {
      this.failUpdates--;
      throw new Error('Simulated Firestore update failure');
    }
    const current = this.payments.get(id);
    if (!current) throw new Error(`NOT_FOUND: ${id}`);
    this.payments.set(id, { ...current, ...patch });
  }

  /** Transactions run one at a time, which is what Firestore guarantees per document set. */
  runTransaction<T>(fn: (tx: PaymentTransaction) => Promise<T>): Promise<T> {
    const run = this.#queue.then(() => this.#execute(fn));
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #execute<T>(fn: (tx: PaymentTransaction) => Promise<T>): Promise<T> {
    const writes: (() => void)[] = [];
    const isMock = this.mode === 'mock';
    const assertReadable = () => {
      if (writes.length > 0) throw new Error('Firestore transactions require all reads before all writes.');
    };
    const tx: PaymentTransaction = {
      getPayment:      async (id) => { assertReadable(); return this.getPayment(id); },
      getLock:         async (key) => { assertReadable(); return this.locks.get(key) ?? null; },
      getWebhookEvent: async (id) => { assertReadable(); return this.events.get(id) ?? null; },
      getLicense:      async (clinicId) => {
        assertReadable();
        if (isMock) throw new MockFulfillmentError();
        return this.licenses.get(clinicId) ?? null;
      },
      createPayment: (record) => writes.push(() => {
        if (this.payments.has(record.id)) throw new Error('ALREADY_EXISTS');
        this.payments.set(record.id, structuredClone(record));
      }),
      updatePayment: (id, patch) => writes.push(() => {
        const current = this.payments.get(id);
        if (!current) throw new Error(`NOT_FOUND: ${id}`);
        this.payments.set(id, { ...current, ...patch });
      }),
      setLock: (key, lock) => writes.push(() => this.locks.set(key, lock)),
      createWebhookEvent: (record) => writes.push(() => {
        if (this.events.has(record.id)) throw new Error('ALREADY_EXISTS');
        this.events.set(record.id, record);
      }),
      setLicense: (clinicId, data) => {
        if (isMock) throw new MockFulfillmentError();
        writes.push(() => this.licenses.set(clinicId, { ...this.licenses.get(clinicId), ...data }));
      },
    };

    const result = await fn(tx);
    if (this.failCommits > 0) {
      this.failCommits--;
      throw new Error('Simulated Firestore commit failure');
    }
    writes.forEach((apply) => apply());
    return result;
  }
}

export interface FakeRecurrenteApi {
  fetchFn: typeof fetch;
  checkouts: Map<string, RecurrenteCheckout>;
  requests: { method: string; url: string; headers: Record<string, string>; body: unknown }[];
  /** Next response status to force (e.g. 500), consumed once. */
  failNext: { status: number; body: unknown } | null;
  /** When true, the next request hangs until aborted. */
  hangNext: boolean;
}

/**
 * Stand-in for app.recurrente.com, plugged into the real RecurrenteClient via
 * its fetchFn option, so live-mode code paths run without any network access.
 */
export function createFakeRecurrenteApi(): FakeRecurrenteApi {
  const api: FakeRecurrenteApi = {
    checkouts: new Map(),
    requests:  [],
    failNext:  null,
    hangNext:  false,
    fetchFn:   (async () => { throw new Error('replaced below'); }) as typeof fetch,
  };
  let seq = 0;

  api.fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const headers = { ...(init?.headers as Record<string, string>) };
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    api.requests.push({ method, url, headers, body });

    if (api.hangNext) {
      api.hangNext = false;
      await new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    }
    if (api.failNext) {
      const failure = api.failNext;
      api.failNext = null;
      return json(failure.status, failure.body);
    }
    if (headers['X-SECRET-KEY'] !== 'sk_live_fake_for_tests') {
      return json(401, { message: 'Autenticación Errónea 👀' });
    }

    const path = new URL(url).pathname.replace(/^\/api/, '');
    if (method === 'POST' && path === '/checkouts') {
      const request = body as RecurrenteCreateCheckoutRequest;
      const id = `ch_fake_${++seq}`;
      const checkout: RecurrenteCheckout = {
        id,
        status:         'unpaid',
        checkout_url:   `https://app.recurrente.com/checkout-session/${id}`,
        total_in_cents: request.items.reduce((sum, item) => sum + item.amount_in_cents * item.quantity, 0),
        currency:       request.items[0].currency,
        live_mode:      true,
        metadata:       request.metadata,
      };
      api.checkouts.set(id, checkout);
      return json(201, checkout);
    }
    const match = path.match(/^\/checkouts\/(.+)$/);
    if (method === 'GET' && match) {
      const checkout = api.checkouts.get(decodeURIComponent(match[1]));
      return checkout ? json(200, checkout) : json(404, { message: 'Checkout no encontrado' });
    }
    if (method === 'GET' && path === '/test') {
      return json(200, { message: 'Hello Test', account_id: 'ac_test', environment: 'live', sandbox_id: null });
    }
    return json(404, { message: 'Not found' });
  }) as typeof fetch;

  return api;
}

export function fakeLiveClient(api: FakeRecurrenteApi, timeoutMs = 50) {
  return new RecurrenteClient({ secretKey: 'sk_live_fake_for_tests', fetchFn: api.fetchFn, timeoutMs });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
