'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface SwipeAction {
  label: string;
  icon: React.ElementType;
  /** Background revealed under the row, e.g. 'bg-emerald-500' */
  className: string;
  onTrigger: () => void;
}

const THRESHOLD = 90;   // px to release past for the action to fire
const MAX_PULL  = 140;

/**
 * Native-style swipe on a row, only in the installed phone app (<html data-app-mode>):
 * drag right for `right`, left for `left`, release past the threshold to fire it.
 * A mostly vertical drag is left to the page scroll. Elsewhere it renders the row as is.
 */
export function SwipeRow({ left, right, children, className }: {
  /** Revealed when dragging to the left (e.g. cancel) */
  left?: SwipeAction;
  /** Revealed when dragging to the right (e.g. confirm) */
  right?: SwipeAction;
  children: React.ReactNode;
  className?: string;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null);

  const enabled = () => typeof document !== 'undefined' && document.documentElement.hasAttribute('data-app-mode');

  function onTouchStart(e: React.TouchEvent) {
    if (!enabled() || (!left && !right)) return;
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, axis: null };
  }

  function onTouchMove(e: React.TouchEvent) {
    const s = start.current;
    if (!s) return;
    const t = e.touches[0];
    const mx = t.clientX - s.x, my = t.clientY - s.y;
    if (!s.axis && Math.abs(mx) + Math.abs(my) > 8) s.axis = Math.abs(mx) > Math.abs(my) * 1.3 ? 'x' : 'y';
    if (s.axis !== 'x') return;
    let next = mx;
    if (next > 0 && !right) next = 0;
    if (next < 0 && !left) next = 0;
    setDx(Math.max(-MAX_PULL, Math.min(MAX_PULL, next)));
  }

  function onTouchEnd() {
    const fired = dx >= THRESHOLD ? right : dx <= -THRESHOLD ? left : undefined;
    start.current = null;
    setDx(0);
    if (fired) {
      if ('vibrate' in navigator) navigator.vibrate?.(15);
      fired.onTrigger();
    }
  }

  const action = dx > 0 ? right : dx < 0 ? left : undefined;
  const armed = Math.abs(dx) >= THRESHOLD;

  return (
    <div className={cn('relative overflow-hidden rounded-2xl', className)}>
      {action && (
        <div className={cn('absolute inset-0 flex items-center px-5 text-white font-semibold text-sm transition-opacity',
          action.className, dx > 0 ? 'justify-start' : 'justify-end', armed ? 'opacity-100' : 'opacity-70')}>
          <span className={cn('flex items-center gap-2 transition-transform', armed && 'scale-110')}>
            <action.icon size={18} /> {action.label}
          </span>
        </div>
      )}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        className={cn('relative', dx === 0 && 'transition-transform duration-200')}
      >
        {children}
      </div>
    </div>
  );
}
