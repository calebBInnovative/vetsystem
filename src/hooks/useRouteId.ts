'use client';

import { useState, useEffect } from 'react';

/**
 * Returns a path segment from window.location.pathname, counting from the end.
 *
 * @param indexFromEnd - 1 (default) = last segment, 2 = second-to-last, etc.
 *
 * Returns null during SSR / hydration (before the effect fires).
 * This avoids reading the build-time placeholder ('_') that Next.js
 * static export bakes into the pre-rendered HTML for dynamic [id] routes.
 *
 * Usage: treat null as "still loading" — don't show "not found" yet.
 *
 * Examples:
 *   /patients/abc123           → useRouteId(1) = 'abc123'
 *   /patients/abc123/history   → useRouteId(2) = 'abc123'
 *   /patients/abc123/history/new → useRouteId(3) = 'abc123'
 */
export function useRouteId(indexFromEnd = 1): string | null {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    const segments = window.location.pathname.split('/').filter(Boolean);
    setId(segments[segments.length - indexFromEnd] ?? '');
  }, [indexFromEnd]);

  return id;
}
