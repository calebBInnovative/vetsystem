'use client';

import * as Sentry from '@sentry/nextjs';
import { setScrubTerms } from '@/lib/monitoring/scrub';
import type { SessionLocal } from '@/types/license';

/**
 * Attaches the minimum context that makes a report actionable: which clinic,
 * which role, which plan. Never who the person is — see scrub.ts.
 *
 * No-ops when monitoring is not configured, so nothing here depends on Sentry
 * being set up for the app to work.
 */
export function setMonitoringContext(session: SessionLocal | null): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  if (!session) {
    setScrubTerms([]);
    Sentry.setUser(null);
    return;
  }

  // Names the scrubber cannot guess but we happen to know
  setScrubTerms([session.userName, session.clinicName, session.email]);

  // id is the clinic, not the person: it groups reports by tenant without
  // identifying anyone, and the scrubber drops every other user field anyway.
  Sentry.setUser({ id: session.clinicId });
  Sentry.setTags({
    role:   session.role,
    plan:   session.plan,
    demo:   String(session.isDemo === true),
  });
}
