import { RecurrenteError, type RecurrenteErrorCode } from './recurrente.errors';
import type {
  PaymentMode,
  RecurrenteCheckout,
  RecurrenteCreateCheckoutRequest,
  RecurrenteCredentialsCheck,
} from './recurrente.types';

export const RECURRENTE_API_BASE_URL = 'https://app.recurrente.com/api';

/** What the payment service needs from a provider — implemented by the live client and the mock. */
export interface PaymentProvider {
  readonly mode: PaymentMode;
  createCheckout(request: RecurrenteCreateCheckoutRequest): Promise<RecurrenteCheckout>;
  retrieveCheckout(checkoutId: string): Promise<RecurrenteCheckout>;
}

export interface RecurrenteClientOptions {
  secretKey: string | undefined;
  baseUrl?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Thin HTTP client for the Recurrente REST API. The secret key lives only in a
 * private field and in the X-SECRET-KEY request header; it is never part of an
 * error, a log line or a return value.
 */
export class RecurrenteClient implements PaymentProvider {
  readonly mode = 'live' as const;

  readonly #secretKey: string;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: RecurrenteClientOptions) {
    const key = options.secretKey?.trim();
    if (!key) {
      throw new RecurrenteError('missing_credentials', 'Recurrente secret key is not configured.');
    }
    this.#secretKey = key;
    this.#baseUrl   = options.baseUrl ?? RECURRENTE_API_BASE_URL;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#fetch     = options.fetchFn ?? fetch;
  }

  createCheckout(request: RecurrenteCreateCheckoutRequest): Promise<RecurrenteCheckout> {
    return this.#request<RecurrenteCheckout>('POST', '/checkouts', request);
  }

  retrieveCheckout(checkoutId: string): Promise<RecurrenteCheckout> {
    return this.#request<RecurrenteCheckout>('GET', `/checkouts/${encodeURIComponent(checkoutId)}`);
  }

  /** GET /test — validates the key only. Creates nothing and charges nothing. */
  testCredentials(): Promise<RecurrenteCredentialsCheck> {
    return this.#request<RecurrenteCredentialsCheck>('GET', '/test');
  }

  async #request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        method,
        headers: {
          'Accept':       'application/json',
          'Content-Type': 'application/json',
          'X-SECRET-KEY': this.#secretKey,
        },
        body:   body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new RecurrenteError('timeout', `Recurrente did not answer within ${this.#timeoutMs} ms.`);
      }
      throw new RecurrenteError('network', `Could not reach Recurrente: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }

    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;

    if (!response.ok) {
      const message = typeof payload?.message === 'string' ? payload.message : `HTTP ${response.status}`;
      const providerCode = typeof payload?.code === 'string' ? payload.code : null;
      throw new RecurrenteError(statusToCode(response.status), message, response.status, providerCode);
    }
    if (!payload) {
      throw new RecurrenteError('invalid_response', 'Recurrente returned a non-JSON body.', response.status);
    }
    return payload as T;
  }
}

function statusToCode(status: number): RecurrenteErrorCode {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 422) return 'unprocessable';
  if (status >= 500)  return 'server';
  return 'invalid_request';
}
