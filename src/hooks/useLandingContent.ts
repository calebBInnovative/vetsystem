'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_LANDING, fetchLandingContent, type LandingContent } from '@/lib/marketing/landing';

/**
 * Landing content from platform/landing (edited at /admin/landing). null while
 * loading; the defaults when Firestore cannot be reached, so the page always renders.
 */
export function useLandingContent(): LandingContent | null {
  const [content, setContent] = useState<LandingContent | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLandingContent()
      .then((c) => { if (!cancelled) setContent(c); })
      .catch(() => { if (!cancelled) setContent(DEFAULT_LANDING); });
    return () => { cancelled = true; };
  }, []);

  return content;
}
