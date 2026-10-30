'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, Loader2, Plus, Save, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { isPlatformOwner } from '@/lib/usage/usage.service';
import {
  MAX_TESTIMONIALS, QUOTE_MAX_LENGTH, newTestimonial, saveLandingContent, subscribeLandingContent,
  type Testimonial,
} from '@/lib/marketing/landing';
import { cn } from '@/lib/utils';

const INPUT = 'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export default function LandingAdminPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  // The screen is a convenience; firestore.rules is what restricts the write.
  const platformOwner = isPlatformOwner(session?.email);

  const [testimonials, setTestimonials] = useState<Testimonial[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !platformOwner) router.replace('/admin');
  }, [loading, platformOwner, router]);

  // Live until the first edit, so unsaved changes are never overwritten.
  useEffect(() => {
    if (!platformOwner || dirty) return;
    return subscribeLandingContent((c) => setTestimonials(c.testimonials));
  }, [platformOwner, dirty]);

  function edit(next: Testimonial[]) {
    setDirty(true);
    setTestimonials(next);
  }

  function update(id: string, patch: Partial<Testimonial>) {
    if (testimonials) edit(testimonials.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function move(index: number, delta: -1 | 1) {
    if (!testimonials) return;
    const next = [...testimonials];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    edit(next);
  }

  async function save() {
    if (!testimonials) return;
    const incomplete = testimonials.filter((t) => !t.name.trim() || !t.quote.trim()).length;
    if (incomplete > 0) {
      toast.error('Cada testimonio necesita nombre y texto (o bórralo)');
      return;
    }
    setSaving(true);
    try {
      await saveLandingContent({ testimonials });
      setDirty(false);
      toast.success('Testimonios guardados. Ya se ven en la página principal.');
    } catch (err) {
      console.error('[landing] save failed:', err);
      toast.error('No se pudieron guardar los testimonios');
    } finally {
      setSaving(false);
    }
  }

  if (!platformOwner) return null;

  const visibleCount = testimonials?.filter((t) => t.visible).length ?? 0;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => router.push('/admin')}
          className="mt-1 text-muted-foreground hover:text-foreground" aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Página web</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Contenido de la página principal.{' '}
            <a href="/landing" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              Ver página <ExternalLink size={12} />
            </a>
          </p>
        </div>
        <Button onClick={save} disabled={!dirty || saving || !testimonials} className="gap-1.5">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
        </Button>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Testimonios</h2>
          <p className="text-xs text-muted-foreground">
            {visibleCount === 0
              ? 'Sin testimonios visibles, la sección no aparece en la página.'
              : `${visibleCount} visible${visibleCount === 1 ? '' : 's'} en la página, en este orden.`}
            {' '}Usa solo testimonios reales, con permiso de la clínica.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0"
          disabled={!testimonials || testimonials.length >= MAX_TESTIMONIALS}
          onClick={() => testimonials && edit([...testimonials, newTestimonial()])}>
          <Plus size={14} /> Agregar
        </Button>
      </div>

      {!testimonials ? (
        <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
      ) : testimonials.length === 0 ? (
        <div className="bg-card rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Aún no hay testimonios. Agrega el primero con el botón de arriba.
        </div>
      ) : (
        <div className="space-y-4">
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
                <label className="ml-auto flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={t.visible} onChange={(e) => update(t.id, { visible: e.target.checked })} />
                  Visible
                </label>
                <button type="button" disabled={index === 0} onClick={() => move(index, -1)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Subir">
                  <ArrowUp size={14} />
                </button>
                <button type="button" disabled={index === testimonials.length - 1} onClick={() => move(index, 1)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Bajar">
                  <ArrowDown size={14} />
                </button>
                <button type="button" onClick={() => edit(testimonials.filter((x) => x.id !== t.id))}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Borrar">
                  <Trash2 size={14} />
                </button>
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
                <span className="block text-right text-[11px] text-muted-foreground">{t.quote.length}/{QUOTE_MAX_LENGTH}</span>
              </label>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
