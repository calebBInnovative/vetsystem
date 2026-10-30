'use client';

import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_OFFLINE_DAY, MAX_OFFLINE_STEPS, OFFLINE_LIMITS, newOfflineStep, type OfflineDayContent, type OfflineStep,
} from '@/lib/marketing/landing';
import { cn } from '@/lib/utils';
import { Counter, INPUT, moveItem, patchItem, type Update } from './shared';

export function OfflineDayEditor({ day, onChange }: { day: OfflineDayContent; onChange: Update<OfflineDayContent> }) {
  const setSteps = (fn: (steps: OfflineStep[]) => OfflineStep[]) => onChange((d) => ({ ...d, steps: fn(d.steps) }));
  const update = (id: string, patch: Partial<OfflineStep>) => setSteps((steps) => patchItem(steps, id, patch));
  const last = day.steps.length - 1;

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 bg-card rounded-2xl border border-border p-5 cursor-pointer">
        <input type="checkbox" className="mt-1" checked={day.visible}
          onChange={(e) => onChange((d) => ({ ...d, visible: e.target.checked }))} />
        <span className="space-y-0.5">
          <span className="block text-sm font-semibold">Mostrar la sección en la página</span>
          <span className="block text-xs text-muted-foreground">
            Una franja oscura justo después de la portada, con una línea de tiempo que termina cuando vuelve la conexión.
          </span>
        </span>
      </label>

      <div className={cn('bg-card rounded-2xl border border-border p-5 space-y-3', !day.visible && 'opacity-70')}>
        <label className="block space-y-1">
          <span className="text-xs font-medium">Título</span>
          <input value={day.title} onChange={(e) => onChange((d) => ({ ...d, title: e.target.value }))}
            maxLength={OFFLINE_LIMITS.title} placeholder={DEFAULT_OFFLINE_DAY.title} className={INPUT} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">Subtítulo</span>
          <textarea value={day.subtitle} onChange={(e) => onChange((d) => ({ ...d, subtitle: e.target.value }))}
            maxLength={OFFLINE_LIMITS.subtitle} rows={2} className={cn(INPUT, 'resize-y')} />
          <Counter value={day.subtitle} max={OFFLINE_LIMITS.subtitle} />
        </label>
      </div>

      <div className="flex items-end justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Momentos del día, en orden. El último se dibuja como el momento en que vuelve el internet.
        </p>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" disabled={day.steps.length >= MAX_OFFLINE_STEPS}
          onClick={() => setSteps((steps) => [...steps, newOfflineStep()])}>
          <Plus size={14} /> Agregar momento
        </Button>
      </div>

      {day.steps.map((s, index) => (
        <section key={s.id} className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-semibold', index === last ? 'text-primary' : 'text-muted-foreground')}>
              {index === last ? 'Vuelve la conexión' : `Sin conexión · #${index + 1}`}
            </span>
            <button type="button" disabled={index === 0} onClick={() => setSteps((st) => moveItem(st, index, -1))}
              className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Subir">
              <ArrowUp size={14} />
            </button>
            <button type="button" disabled={index === last} onClick={() => setSteps((st) => moveItem(st, index, 1))}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Bajar">
              <ArrowDown size={14} />
            </button>
            <button type="button" onClick={() => setSteps((st) => st.filter((x) => x.id !== s.id))}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Borrar">
              <Trash2 size={14} />
            </button>
          </div>
          <div className="grid sm:grid-cols-[8rem_1fr] gap-2">
            <label className="space-y-1">
              <span className="text-xs font-medium">Hora</span>
              <input value={s.time} onChange={(e) => update(s.id, { time: e.target.value })}
                maxLength={OFFLINE_LIMITS.time} placeholder="9:00 a. m." className={INPUT} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium">Qué pasa</span>
              <input value={s.title} onChange={(e) => update(s.id, { title: e.target.value })}
                maxLength={OFFLINE_LIMITS.stepTitle} placeholder="Consulta de Luna" className={INPUT} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Detalle</span>
            <textarea value={s.text} onChange={(e) => update(s.id, { text: e.target.value })}
              maxLength={OFFLINE_LIMITS.stepText} rows={2} className={cn(INPUT, 'resize-y')} />
            <Counter value={s.text} max={OFFLINE_LIMITS.stepText} />
          </label>
        </section>
      ))}

      <button type="button" onClick={() => onChange(() => DEFAULT_OFFLINE_DAY)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <RotateCcw size={12} /> Volver al texto original
      </button>
    </div>
  );
}
