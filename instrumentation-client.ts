import * as Sentry from '@sentry/nextjs';
import { makeBrowserOfflineTransport, makeFetchTransport } from '@sentry/browser';
import { scrubEvent } from '@/lib/monitoring/scrub';

/**
 * Error monitoring. Client only — this app is a static export, so there is no
 * server or edge runtime to instrument.
 *
 * Without a DSN the SDK is never initialised, so the app runs untouched in
 * development and in any environment where monitoring was not configured.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,

    // The whole point of an offline-first app: a crash that happens with no
    // connection is exactly the one worth seeing. This transport stores events
    // in IndexedDB and replays them when the browser is back online, instead of
    // dropping them the way the default fetch transport does.
    transport: makeBrowserOfflineTransport(makeFetchTransport),

    // Clinic data must not leave the device — see src/lib/monitoring/scrub.ts.
    // The SDK does not attach PII by default; the scrubber is what guarantees
    // nothing slips through inside a message, a breadcrumb or extra context.
    beforeSend: scrubEvent,

    // Errors are the goal here; tracing every navigation would burn the free
    // tier's quota on data nobody is going to read.
    tracesSampleRate: 0,

    ignoreErrors: [
      // Browser extensions and network noise, not our bugs
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      /Failed to fetch/i,
      /NetworkError/i,
      /Load failed/i,
    ],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
