'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDemoMode, TOUR_STEPS } from '@/hooks/useDemoMode';
import { cn } from '@/lib/utils';

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;

export function TourGuide() {
  const { isDemo, tourActive, tourStep, nextStep, prevStep, stopTour } = useDemoMode();
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const step = TOUR_STEPS[tourStep];

  useLayoutEffect(() => {
    if (!tourActive || !step) { setTargetRect(null); return; }

    function measure() {
      const el = document.getElementById(step.targetId);
      if (!el) { setTargetRect(null); return; }
      const r = el.getBoundingClientRect();
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [tourActive, step]);

  if (!isDemo || !tourActive) return null;

  const isLast = tourStep === TOUR_STEPS.length - 1;

  // Popover position: prefer below, fall back to above if near bottom
  let popTop = 0;
  let popLeft = 0;
  const POP_W = 280;

  if (targetRect) {
    const below = targetRect.top + targetRect.height + PAD + 12;
    const above = targetRect.top - PAD - 148;
    popTop  = below + 148 < window.innerHeight ? below : Math.max(8, above);
    popLeft = Math.min(
      Math.max(8, targetRect.left),
      window.innerWidth - POP_W - 8,
    );
  } else {
    popTop  = window.innerHeight / 2 - 74;
    popLeft = window.innerWidth  / 2 - POP_W / 2;
  }

  return (
    <>
      {/* Dark overlay with spotlight cutout */}
      <div className="fixed inset-0 z-[9990] pointer-events-none">
        {targetRect ? (
          <svg width="100%" height="100%" className="absolute inset-0">
            <defs>
              <mask id="tour-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={targetRect.left - PAD}
                  y={targetRect.top - PAD}
                  width={targetRect.width + PAD * 2}
                  height={targetRect.height + PAD * 2}
                  rx="10"
                  fill="black"
                />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#tour-mask)" />
            {/* Highlight border */}
            <rect
              x={targetRect.left - PAD}
              y={targetRect.top - PAD}
              width={targetRect.width + PAD * 2}
              height={targetRect.height + PAD * 2}
              rx="10"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
            />
          </svg>
        ) : (
          <div className="absolute inset-0 bg-black/55" />
        )}
      </div>

      {/* Intercept clicks outside the popover to prevent accidental navigation */}
      <div className="fixed inset-0 z-[9991] pointer-events-auto" onClick={e => e.stopPropagation()} />

      {/* Popover */}
      <div
        ref={popRef}
        className={cn(
          'fixed z-[9992] pointer-events-auto',
          'bg-card border border-border rounded-xl shadow-2xl p-4',
          'w-[280px]',
        )}
        style={{ top: popTop, left: popLeft }}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-semibold leading-tight">{step.titulo}</p>
          <button
            onClick={stopTour}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 -mt-0.5"
          >
            <X size={14} />
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed mb-4">{step.desc}</p>

        {/* Progress dots */}
        <div className="flex items-center gap-1 mb-3">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === tourStep ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30',
              )}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={stopTour}
          >
            Saltar tour
          </Button>

          <div className="flex items-center gap-1.5">
            {tourStep > 0 && (
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={prevStep}>
                <ChevronLeft size={13} />
              </Button>
            )}
            <Button size="sm" className="h-7 px-3 text-xs" onClick={nextStep}>
              {isLast ? 'Finalizar' : (
                <span className="flex items-center gap-1">
                  Siguiente <ChevronRight size={13} />
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
