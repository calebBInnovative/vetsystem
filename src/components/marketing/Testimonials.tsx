'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { fetchLandingContent, type Testimonial } from '@/lib/marketing/landing';
import { cn } from '@/lib/utils';

const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-700',
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
];

/**
 * Landing testimonials, read from platform/landing (edited at /admin/landing).
 * Renders nothing until there is at least one visible testimonial, so the page
 * never shows placeholder quotes.
 */
export function Testimonials() {
  const [items, setItems] = useState<Testimonial[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchLandingContent()
      .then((c) => { if (!cancelled) setItems(c.testimonials.filter((t) => t.visible)); })
      .catch(() => { /* offline: the section stays hidden */ });
    return () => { cancelled = true; };
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="py-24 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center space-y-3 mb-14">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider">Testimonios</p>
          <h2 className="text-3xl sm:text-4xl font-bold">Lo que dicen nuestros clientes</h2>
        </div>

        <div className={cn('grid gap-6 mx-auto',
          items.length >= 3 ? 'md:grid-cols-3' : items.length === 2 ? 'md:grid-cols-2 max-w-4xl' : 'max-w-xl')}>
          {items.map((t, i) => (
            <div key={t.id} className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex gap-0.5" aria-label={`${t.rating} de 5 estrellas`}>
                {Array.from({ length: t.rating }, (_, s) => (
                  <Star key={s} size={14} className="fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex items-center gap-3 pt-1 border-t border-border">
                <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                  AVATAR_COLORS[i % AVATAR_COLORS.length])}>
                  {t.name.replace(/^(Dra?\.|Lic\.)\s*/i, '').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{[t.clinic, t.city].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
