'use client';

import { Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ANSWER_MAX_LENGTH, DEFAULT_FAQS, MAX_FAQS, newFaq, type Faq } from '@/lib/marketing/landing';
import { cn } from '@/lib/utils';
import { Counter, INPUT, ItemControls, moveItem, patchItem, type Update } from './shared';

export function FaqEditor({ faqs, onChange }: { faqs: Faq[]; onChange: Update<Faq[]> }) {
  const update = (id: string, patch: Partial<Faq>) => onChange((list) => patchItem(list, id, patch));
  const visibleCount = faqs.filter((f) => f.visible).length;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {visibleCount === 0
            ? 'Sin preguntas visibles, la sección no aparece en la página.'
            : `${visibleCount} visible${visibleCount === 1 ? '' : 's'} en la página, en este orden. También se publican para Google.`}
          {' '}Responde solo lo que el sistema hace hoy.
        </p>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" disabled={faqs.length >= MAX_FAQS}
          onClick={() => onChange((list) => [...list, newFaq()])}>
          <Plus size={14} /> Agregar
        </Button>
      </div>

      {faqs.length === 0 && (
        <div className="bg-card rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No hay preguntas.
        </div>
      )}

      {faqs.map((f, index) => (
        <section key={f.id} className={cn('bg-card rounded-2xl border border-border p-5 space-y-3', !f.visible && 'opacity-70')}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">#{index + 1}</span>
            <ItemControls visible={f.visible} onVisible={(visible) => update(f.id, { visible })}
              index={index} count={faqs.length}
              onMove={(delta) => onChange((list) => moveItem(list, index, delta))}
              onDelete={() => onChange((list) => list.filter((x) => x.id !== f.id))} />
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Pregunta</span>
            <input value={f.question} onChange={(e) => update(f.id, { question: e.target.value })} maxLength={160}
              placeholder="¿…?" className={INPUT} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Respuesta</span>
            <textarea value={f.answer} onChange={(e) => update(f.id, { answer: e.target.value })} maxLength={ANSWER_MAX_LENGTH}
              rows={3} className={cn(INPUT, 'resize-y')} />
            <Counter value={f.answer} max={ANSWER_MAX_LENGTH} />
          </label>
        </section>
      ))}

      <button type="button" onClick={() => onChange(() => DEFAULT_FAQS)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <RotateCcw size={12} /> Volver a las preguntas originales
      </button>
    </div>
  );
}
