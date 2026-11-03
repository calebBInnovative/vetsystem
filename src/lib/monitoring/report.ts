'use client';

import * as Sentry from '@sentry/nextjs';

/**
 * Sends an error the app already handled (caught, logged, toasted) to Sentry.
 * The SDK only reports uncaught errors on its own, so without this every
 * failure inside a try/catch stays invisible.
 *
 * Skips what is expected in an offline-first app — no connection, Firestore
 * unavailable — and reports each (area, key, code) at most once per page load,
 * because sync retries the same failing call every few seconds and each retry
 * would otherwise spend quota on a duplicate event.
 *
 * `includeTransient` keeps the "no network" codes as warnings: for a failure
 * the user is told about (a sync toast) while the browser says it is online,
 * "it was the network" is the claim to check, not to assume.
 */

// Firestore codes that mean "no network", not "bug"
const TRANSIENT_CODES = new Set(['unavailable', 'deadline-exceeded', 'cancelled']);

const reported = new Set<string>();

export function reportHandledError(
  err: unknown,
  area: string,
  tags: Record<string, string> = {},
  options: { includeTransient?: boolean; extra?: Record<string, unknown> } = {},
): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const code = (err as { code?: unknown })?.code;
  const codeTag = typeof code === 'string' ? code : 'unknown';
  const transient = TRANSIENT_CODES.has(codeTag);
  if (transient && !options.includeTransient) return;

  const dedupeKey = `${area}|${Object.values(tags).join('|')}|${codeTag}`;
  if (reported.has(dedupeKey)) return;
  reported.add(dedupeKey);

  Sentry.captureException(err, {
    level: transient ? 'warning' : 'error',
    tags: { area, code: codeTag, ...tags },
    contexts: { network: networkContext() },
    extra: options.extra,
  });
}

/** What the device says about its link when the error happened. */
function networkContext(): Record<string, unknown> {
  if (typeof navigator === 'undefined') return {};
  // Network Information API: Chrome/Android only, absent on iOS Safari
  const connection = (navigator as { connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean } }).connection;
  return {
    online:          navigator.onLine,
    visibility:      typeof document !== 'undefined' ? document.visibilityState : undefined,
    effectiveType:   connection?.effectiveType,
    downlinkMbps:    connection?.downlink,
    rttMs:           connection?.rtt,
    saveData:        connection?.saveData,
  };
}
