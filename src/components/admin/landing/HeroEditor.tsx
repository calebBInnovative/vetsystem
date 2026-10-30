'use client';

import { Check, Plus, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_HERO, HERO_LIMITS, HERO_MAX_TRUST_POINTS, splitHeroTitle, type HeroContent,
} from '@/lib/marketing/landing';
import { cn } from '@/lib/utils';
import { Counter, INPUT, type Update } from './shared';

type TextField = 'badge' | 'title' | 'highlight' | 'subtitle' | 'primaryCta' | 'secondaryCta';

export function HeroEditor({ hero, onChange }: { hero: HeroContent; onChange: Update<HeroContent> }) {
  const set = (field: TextField, value: string) => onChange((h) => ({ ...h, [field]: value }));
  const setPoint = (index: number, value: string) =>
    onChange((h) => ({ ...h, trustPoints: h.trustPoints.map((t, i) => (i === index ? value : t)) }));
  const [before, highlight, after] = splitHeroTitle(hero);
  const highlightMissing = !!hero.highlight.trim() && !hero.title.includes(hero.highlight);

  function field(key: TextField, label: string, hint?: string, multiline = false) {
    const Tag = multiline ? 'textarea' : 'input';
    return (
      <label className="block space-y-1">
        <span className="text-xs font-medium">{label}</span>
        <Tag value={hero[key]} onChange={(e) => set(key, e.target.value)} maxLength={HERO_LIMITS[key]}
          rows={multiline ? 3 : undefined} placeholder={DEFAULT_HERO[key]} className={cn(INPUT, multiline && 'resize-y')} />
        <div className="flex justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{hint}</span>
          <Counter value={hero[key]} max={HERO_LIMITS[key]} />
        </div>
      </label>
    );
  }

  return (
    <div className="space-y-5">
      {/* Live preview, same structure as the landing hero */}
      <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Vista previa</p>
        <span className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          {hero.badge || DEFAULT_HERO.badge}
        </span>
        <p className="text-2xl sm:text-3xl font-extrabold leading-tight tracking-tight">
          {before}<span className="text-primary">{highlight}</span>{after}
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">{hero.subtitle}</p>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2">{hero.primaryCta || '…'}</span>
          <span className="rounded-lg border border-border text-sm font-medium px-4 py-2">{hero.secondaryCta || '…'}</span>
        </div>
        {hero.trustPoints.some((t) => t.trim()) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {hero.trustPoints.filter((t) => t.trim()).map((t, i) => (
              <span key={i} className="flex items-center gap-1"><Check size={12} className="text-primary" />{t}</span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        {field('badge', 'Etiqueta superior')}
        {field('title', 'Título principal', 'Lo primero que se lee. Mejor una idea concreta que "todo en uno".')}
        <label className="block space-y-1">
          <span className="text-xs font-medium">Palabras resaltadas</span>
          <input value={hero.highlight} onChange={(e) => set('highlight', e.target.value)} maxLength={HERO_LIMITS.highlight}
            placeholder="Vacío: sin color" className={INPUT} />
          <span className={cn('block text-[11px]', highlightMissing ? 'text-amber-600' : 'text-muted-foreground')}>
            {highlightMissing
              ? 'Estas palabras no aparecen tal cual en el título, así que no se resaltará nada.'
              : 'Parte del título que va en color. Debe escribirse igual que en el título.'}
          </span>
        </label>
        {field('subtitle', 'Subtítulo', undefined, true)}
        <div className="grid sm:grid-cols-2 gap-3">
          {field('primaryCta', 'Botón principal', 'Lleva a crear cuenta.')}
          {field('secondaryCta', 'Botón secundario', 'Abre el demo en vivo.')}
        </div>

        <div className="space-y-2">
          <span className="text-xs font-medium">Frases de confianza (debajo de los botones)</span>
          {hero.trustPoints.map((t, i) => (
            <div key={i} className="flex gap-2">
              <input value={t} onChange={(e) => setPoint(i, e.target.value)} maxLength={HERO_LIMITS.trustPoint}
                placeholder="Ej.: Sin tarjeta" className={INPUT} />
              <button type="button" aria-label="Quitar frase"
                onClick={() => onChange((h) => ({ ...h, trustPoints: h.trustPoints.filter((_, j) => j !== i) }))}
                className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <X size={14} />
              </button>
            </div>
          ))}
          {hero.trustPoints.length < HERO_MAX_TRUST_POINTS && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5"
              onClick={() => onChange((h) => ({ ...h, trustPoints: [...h.trustPoints, ''] }))}>
              <Plus size={14} /> Agregar frase
            </Button>
          )}
        </div>

        <div className="pt-1 border-t border-border">
          <button type="button" onClick={() => onChange(() => DEFAULT_HERO)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground pt-3">
            <RotateCcw size={12} /> Volver al texto original
          </button>
        </div>
      </div>
    </div>
  );
}
