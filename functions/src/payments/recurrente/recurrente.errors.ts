export type RecurrenteErrorCode =
  | 'missing_credentials'
  | 'timeout'
  | 'network'
  | 'unauthorized'
  | 'invalid_request'
  | 'not_found'
  | 'unprocessable'
  | 'server'
  | 'invalid_response';

/**
 * Error raised by a payment provider. Carries a stable code and the provider's
 * short message only — never a request header, a key, or a full response body.
 */
export class RecurrenteError extends Error {
  constructor(
    readonly code: RecurrenteErrorCode,
    message: string,
    readonly httpStatus: number | null = null,
    readonly providerCode: string | null = null,
  ) {
    super(message);
    this.name = 'RecurrenteError';
  }

  /** Timeouts, network failures and 5xx may succeed on a later attempt. */
  get retryable(): boolean {
    return this.code === 'timeout' || this.code === 'network' || this.code === 'server';
  }
}
