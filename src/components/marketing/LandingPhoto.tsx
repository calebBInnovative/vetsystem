'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { SectionPhoto } from '@/lib/marketing/landing';
import { cn } from '@/lib/utils';

/**
 * Section photo of the landing (edited at /admin/landing). The box keeps its size
 * (aspect class in className) and stays a neutral color until the saved content has
 * loaded, so a replaced photo never flashes the default one first.
 */
export function LandingPhoto({ photo, sizes, priority = false, className }: {
  /** undefined while the landing content loads */
  photo: SectionPhoto | undefined;
  sizes: string;
  /** Above the fold (hero) only; every other photo loads lazily. */
  priority?: boolean;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      {photo && (
        <Image key={photo.url} src={photo.url} alt={photo.alt} fill sizes={sizes} priority={priority}
          onLoad={() => setLoaded(true)}
          className={cn('object-cover transition-opacity duration-500', loaded ? 'opacity-100' : 'opacity-0')} />
      )}
    </div>
  );
}
