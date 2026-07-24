'use client';

import { useState, useEffect } from 'react';

/**
 * Returns the last path segment from window.location.pathname.
 *
 * Returns null during SSR / hydration (before the effect fires).
 * This avoids reading the build-time placeholder ('_') that Next.js
 * static export bakes into the pre-rendered HTML for dynamic [id] routes.
 *
 * Usage: treat null as "still loading" — don't show "not found" yet.
 */
export function useRouteId(): string | null {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    const segments = window.location.pathname.split('/').filter(Boolean);
    setId(segments[segments.length - 1] ?? '');
  }, []);

  return id;
}
