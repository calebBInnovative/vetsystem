'use client';

import { usePathname } from 'next/navigation';

/**
 * Reads the last path segment from the current browser URL.
 * Used in dynamic [id] pages rendered via static export, where useParams()
 * may return the build-time placeholder ('_') instead of the real ID.
 */
export function useRouteId(): string {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? '';
}
