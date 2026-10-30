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
 */

// Firestore codes that mean "no network", not "bug"
const TRANSIENT_CODES = new Set(['unavailable', 'deadline-exceeded', 'cancelled']);

const reported = new Set<string>();

export function reportHandledError(
  err: unknown,
  area: string,
  tags: Record<string, string> = {},
): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const code = (err as { code?: unknown })?.code;
  const codeTag = typeof code === 'string' ? code : 'unknown';
  if (TRANSIENT_CODES.has(codeTag)) return;

  const dedupeKey = `${area}|${Object.values(tags).join('|')}|${codeTag}`;
  if (reported.has(dedupeKey)) return;
  reported.add(dedupeKey);

  Sentry.captureException(err, {
    level: 'error',
    tags: { area, code: codeTag, ...tags },
  });
}
