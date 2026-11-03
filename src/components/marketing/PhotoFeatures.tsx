'use client';

import { Check } from 'lucide-react';
import { BrowserFrame } from '@/components/marketing/DeviceFrames';
import { LandingPhoto } from '@/components/marketing/LandingPhoto';
import { useLandingContent } from '@/hooks/useLandingContent';
import type { LandingPhotoKey } from '@/lib/marketing/landing';
import { cn } from '@/lib/utils';

/** Alternating rows: a clinic photo on one side, the real screen and what it does on the other. */
const FEATURES: {
  photo: LandingPhotoKey;
  eyebrow: string;
  title: string;
  points: string[];
  screen: string;
  screenAlt: string;
}[] = [
  {
    photo: 'consultation',
    eyebrow: 'Consultas e historial',
    title: 'El expediente completo, a mano en cada consulta',
    points: [
      'Peso, diagnóstico, tratamiento y receta en un solo registro',
      'Consultas y vacunas anteriores de cada paciente, en orden',
      'Al cerrar la consulta, la factura sale lista',
    ],
    screen: 'consultations.webp',
    screenAlt: 'Pantalla de consultas en VetSystem',
  },
  {
    photo: 'vaccination',
    eyebrow: 'Agenda y recordatorios',
    title: 'Las citas del día, con aviso antes de cada una',
    points: [
      'Citas por día con su estado: confirmada, en curso, no asistió',
      'Recordatorio en tu equipo minutos antes de cada cita',
      'Vacunas y controles quedan en el historial del paciente',
    ],
    screen: 'schedule.webp',
    screenAlt: 'Pantalla de agenda en VetSystem',
  },
];

export function PhotoFeatures() {
  const photos = useLandingContent()?.photos;

  return (
    <section className="py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-20 lg:space-y-28">
        {FEATURES.map((f, index) => (
          <div key={f.photo} className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <LandingPhoto photo={photos?.[f.photo]} sizes="(min-width: 1024px) 560px, 100vw"
              className={cn('aspect-[4/3] rounded-3xl shadow-xl shadow-primary/5', index % 2 === 1 && 'lg:order-2')} />
            <div className="space-y-6">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-primary uppercase tracking-wider">{f.eyebrow}</p>
                <h2 className="text-2xl sm:text-3xl font-bold leading-snug">{f.title}</h2>
              </div>
              <ul className="space-y-3">
                {f.points.map((p) => (
                  <li key={p} className="flex gap-2.5 text-sm text-muted-foreground">
                    <Check size={16} className="text-primary shrink-0 mt-0.5" /> {p}
                  </li>
                ))}
              </ul>
              <BrowserFrame src={f.screen} alt={f.screenAlt} className="hidden sm:block" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
