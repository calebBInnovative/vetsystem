'use client';

import { useEffect, useRef, useState } from 'react';

const TRIGGER = 64;   // px of (damped) pull that starts a refresh
const MAX     = 96;

/**
 * Pull-to-refresh on a scroll container: drag down while it is scrolled to the
 * top. `pull` is the current damped distance (for the indicator); `refreshing`
 * is true while onRefresh runs. Only active when `enabled`.
 */
export function usePullToRefresh(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  onRefresh: () => Promise<unknown>,
) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const state = useRef<{ y: number; x: number; active: boolean } | null>(null);
  const pullRef = useRef(0);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const onStart = (e: TouchEvent) => {
      if (el.scrollTop > 0 || refreshing) return;
      state.current = { y: e.touches[0].clientY, x: e.touches[0].clientX, active: false };
    };
    const onMove = (e: TouchEvent) => {
      const s = state.current;
      if (!s) return;
      const dy = e.touches[0].clientY - s.y;
      const dx = e.touches[0].clientX - s.x;
      if (!s.active) {
        // Only a clearly downward drag from the top; sideways drags belong to swipe rows.
        if (dy < 8 || Math.abs(dx) > dy) { if (Math.abs(dx) > 8 || dy < -8) state.current = null; return; }
        s.active = true;
      }
      e.preventDefault(); // keep the browser from scrolling or bouncing while pulling
      pullRef.current = Math.min(MAX, (dy - 8) * 0.5);
      setPull(pullRef.current);
    };
    const onEnd = async () => {
      const s = state.current;
      state.current = null;
      if (!s?.active) return;
      const fire = pullRef.current >= TRIGGER;
      pullRef.current = 0;
      setPull(0);
      if (!fire) return;
      setRefreshing(true);
      try {
        // A minimum spin so a fast sync still reads as "it refreshed".
        await Promise.all([refreshRef.current(), new Promise((r) => setTimeout(r, 600))]);
      } finally {
        setRefreshing(false);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [ref, enabled, refreshing]);

  return { pull, refreshing, armed: pull >= TRIGGER };
}
