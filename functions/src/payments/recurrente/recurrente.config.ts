import type { PaymentMode } from './recurrente.types';

export interface ModeSettings {
  /** PAYMENT_PROVIDER_MODE — 'mock' (default) or 'live'. */
  requestedMode: string;
  /** RECURRENTE_LIVE_ENABLED — second, independent switch required for live. */
  liveEnabled: boolean;
  /** True when running under the Firebase emulator suite. */
  isEmulator: boolean;
}

export class PaymentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentConfigError';
  }
}

/**
 * Decides whether real money can move. Fails closed: live mode needs both
 * switches and a deployed (non-emulator) runtime. A half-configured live mode
 * throws instead of silently falling back to mock, so nobody believes a mock
 * checkout charged them — or that a live one did not.
 */
export function resolvePaymentMode(settings: ModeSettings): PaymentMode {
  const requested = settings.requestedMode.trim().toLowerCase();

  if (requested === '' || requested === 'mock') return 'mock';

  if (requested === 'live') {
    if (!settings.liveEnabled) {
      throw new PaymentConfigError('PAYMENT_PROVIDER_MODE=live requires RECURRENTE_LIVE_ENABLED=true.');
    }
    if (settings.isEmulator) {
      throw new PaymentConfigError('Live payments are disabled in the Firebase emulator.');
    }
    return 'live';
  }

  throw new PaymentConfigError(`Unknown PAYMENT_PROVIDER_MODE "${settings.requestedMode}".`);
}

/** Parses a comma-separated origin allow-list into normalised origins. */
export function parseOrigins(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => new URL(entry).origin);
}
