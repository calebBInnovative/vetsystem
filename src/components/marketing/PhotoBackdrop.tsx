'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { SectionPhoto } from '@/lib/marketing/landing';
import { cn } from '@/lib/utils';

/**
 * Photo (edited at /admin/landing) behind one side of a landing section, fading into
 * the section's own color: the right half on desktop, the bottom half on phones. The
 * parent must be `relative overflow-hidden`, with its content above (`relative`).
 * Nothing is drawn until the saved content has loaded, so a replaced photo never
 * flashes the default one first.
 */
export function PhotoBackdrop({ photo, fade, priority = false }: {
  /** undefined while the landing content loads */
  photo: SectionPhoto | undefined;
  /** Gradient toward the section color, e.g. 'from-background via-background/70' */
  fade: string;
  /** Above the fold (hero) only; the others load lazily. */
  priority?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  if (!photo) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 lg:inset-y-0 lg:left-auto lg:h-auto lg:w-[60%]">
      <Image key={photo.url} src={photo.url} alt={photo.alt} fill priority={priority}
        sizes="(min-width: 1024px) 60vw, 100vw" onLoad={() => setLoaded(true)}
        className={cn('object-cover transition-opacity duration-700', loaded ? 'opacity-100' : 'opacity-0')} />
      <div className={cn('absolute inset-0 bg-linear-to-b lg:bg-linear-to-r', fade)} />
    </div>
  );
}
