'use client';

import type { CSSProperties } from 'react';
import { CloudUpload, WifiOff } from 'lucide-react';
import { useLandingContent } from '@/hooks/useLandingContent';
import { cn } from '@/lib/utils';

/**
 * "A day without internet": the one thing cloud-only competitors cannot show.
 * Every step but the last happens offline (dashed line, muted dot); the last is
 * the connection coming back (solid brand line). Edited at /admin/landing.
 */
export function OfflineDay() {
  const content = useLandingContent();
  const day = content?.offlineDay;
  if (!day?.visible || day.steps.length === 0) return null;

  const last = day.steps.length - 1;

  return (
    <section id="sin-internet" className="py-24 bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl space-y-4 mb-14">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300">
            <WifiOff size={13} /> Sin conexión
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-white">{day.title}</h2>
          {day.subtitle && <p className="text-slate-400 text-lg leading-relaxed">{day.subtitle}</p>}
        </div>

        <ol className="grid gap-0 lg:gap-6 lg:grid-cols-[repeat(var(--steps),minmax(0,1fr))]"
          style={{ '--steps': day.steps.length } as CSSProperties}>
          {day.steps.map((s, i) => {
            const online = i === last && last > 0;
            return (
              <li key={s.id} className={cn(
                'relative pl-8 pb-10 border-l-2 lg:pl-0 lg:pb-0 lg:pt-8 lg:border-l-0 lg:border-t-2',
                online ? 'border-solid border-teal-400' : 'border-dashed border-slate-700',
                i === last && 'pb-0',
              )}>
                <span className={cn(
                  'absolute -left-[9px] top-0 lg:left-0 lg:-top-[9px] w-4 h-4 rounded-full ring-4 ring-slate-950',
                  online ? 'bg-teal-400' : 'bg-slate-600',
                )} />
                <p className={cn('text-xs font-mono mb-1.5', online ? 'text-teal-300' : 'text-slate-500')}>{s.time}</p>
                <h3 className="font-semibold text-white flex items-center gap-2">
                  {online && <CloudUpload size={16} className="text-teal-300 shrink-0" />}
                  {s.title}
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed mt-1">{s.text}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
