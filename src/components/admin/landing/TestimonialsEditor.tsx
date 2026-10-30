'use client';

import Image from 'next/image';
import { toast } from 'sonner';
import { Camera, Loader2, Plus, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  MAX_TESTIMONIALS, PHOTO_ACCEPT, QUOTE_MAX_LENGTH, newTestimonial, photoProblem, uploadTestimonialPhoto,
  type Testimonial,
} from '@/lib/marketing/landing';
import { cn } from '@/lib/utils';
import { Counter, INPUT, ItemControls, moveItem, patchItem, type Update } from './shared';

export function TestimonialsEditor({ testimonials, onChange, uploadingId, onUploading }: {
  testimonials: Testimonial[];
  onChange: Update<Testimonial[]>;
  uploadingId: string | null;
  onUploading: (id: string | null) => void;
}) {
  const update = (id: string, patch: Partial<Testimonial>) => onChange((list) => patchItem(list, id, patch));
  const visibleCount = testimonials.filter((t) => t.visible).length;

  async function choosePhoto(id: string, file: File | undefined) {
    if (!file) return;
    const problem = photoProblem(file);
    if (problem) { toast.error(problem); return; }
    onUploading(id);
    try {
      const photo = await uploadTestimonialPhoto(file);
      update(id, photo);
    } catch (err) {
      console.error('[landing] photo upload failed:', err);
      toast.error('No se pudo subir la foto');
    } finally {
      onUploading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {visibleCount === 0
            ? 'Sin testimonios visibles, la sección no aparece en la página.'
            : `${visibleCount} visible${visibleCount === 1 ? '' : 's'} en la página, en este orden.`}
          {' '}Usa solo testimonios reales, con permiso de la clínica.
        </p>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" disabled={testimonials.length >= MAX_TESTIMONIALS}
          onClick={() => onChange((list) => [...list, newTestimonial()])}>
          <Plus size={14} /> Agregar
        </Button>
      </div>

      {testimonials.length === 0 && (
        <div className="bg-card rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Aún no hay testimonios. Agrega el primero con el botón de arriba.
        </div>
      )}

      {testimonials.map((t, index) => (
        <section key={t.id} className={cn('bg-card rounded-2xl border border-border p-5 space-y-3', !t.visible && 'opacity-70')}>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5" role="radiogroup" aria-label="Estrellas">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={t.rating === n} aria-label={`${n} estrellas`}
                  onClick={() => update(t.id, { rating: n })}>
                  <Star size={16} className={n <= t.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'} />
                </button>
              ))}
            </div>
            <ItemControls visible={t.visible} onVisible={(visible) => update(t.id, { visible })}
              index={index} count={testimonials.length}
              onMove={(delta) => onChange((list) => moveItem(list, index, delta))}
              onDelete={() => onChange((list) => list.filter((x) => x.id !== t.id))} />
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-14 h-14 shrink-0 rounded-full bg-muted overflow-hidden flex items-center justify-center text-muted-foreground">
              {uploadingId === t.id ? <Loader2 size={18} className="animate-spin" />
                : t.photoUrl ? <Image src={t.photoUrl} alt={t.name} fill sizes="56px" className="object-cover" />
                : <Camera size={18} />}
            </div>
            <label className={cn('cursor-pointer text-sm font-medium text-primary hover:underline', uploadingId && 'pointer-events-none opacity-50')}>
              {t.photoUrl ? 'Cambiar foto' : 'Subir foto'}
              <input type="file" accept={PHOTO_ACCEPT} className="sr-only"
                onChange={(e) => { void choosePhoto(t.id, e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {t.photoUrl && (
              <button type="button" onClick={() => update(t.id, { photoUrl: '', photoPath: '' })}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive">
                <X size={14} /> Quitar
              </button>
            )}
            <span className="text-xs text-muted-foreground ml-auto hidden sm:block">Opcional. Se recorta en cuadrado.</span>
          </div>

          <div className="grid sm:grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className="text-xs font-medium">Nombre</span>
              <input value={t.name} onChange={(e) => update(t.id, { name: e.target.value })} maxLength={80}
                placeholder="Dra. Sofía Martínez" className={INPUT} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium">Clínica</span>
              <input value={t.clinic} onChange={(e) => update(t.id, { clinic: e.target.value })} maxLength={80}
                placeholder="Veterinaria San Francisco" className={INPUT} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium">Ciudad</span>
              <input value={t.city} onChange={(e) => update(t.id, { city: e.target.value })} maxLength={40}
                placeholder="León" className={INPUT} />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium">Testimonio</span>
            <textarea value={t.quote} onChange={(e) => update(t.id, { quote: e.target.value })} maxLength={QUOTE_MAX_LENGTH}
              rows={3} placeholder="Lo que la clínica dice de VetSystem…" className={cn(INPUT, 'resize-y')} />
            <Counter value={t.quote} max={QUOTE_MAX_LENGTH} />
          </label>
        </section>
      ))}
    </div>
  );
}
