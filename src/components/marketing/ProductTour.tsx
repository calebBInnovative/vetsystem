'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Check, ClipboardList, Receipt, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrowserFrame, PhoneFrame } from '@/components/marketing/DeviceFrames';
import { cn } from '@/lib/utils';

/** Each tab is a real screen of the demo clinic, with what it lets the clinic do. */
const STOPS = [
  {
    id: 'schedule',
    icon: CalendarDays,
    label: 'Agenda',
    title: 'El día de la clínica, de un vistazo',
    points: ['Citas por día con su estado: confirmada, en curso, no asistió', 'Tipo de cita, mascota y teléfono del dueño en cada tarjeta', 'Recordatorio antes de cada cita'],
    desktop: 'schedule.webp',
    mobile: 'mobile-schedule.webp',
  },
  {
    id: 'sales',
    icon: ShoppingCart,
    label: 'Vender',
    title: 'Cobra en segundos, con o sin paciente',
    points: ['Catálogo con stock al lado de cada producto', 'Descuentos por línea o al total', 'El inventario se descuenta solo al cobrar'],
    desktop: 'sales.webp',
    mobile: 'mobile-sales.webp',
  },
  {
    id: 'consultations',
    icon: ClipboardList,
    label: 'Consultas',
    title: 'Cada atención, registrada y a mano',
    points: ['Consultas en proceso arriba, para no perder ninguna', 'Diagnóstico, tratamiento y productos usados', 'Al cerrar la consulta, la factura sale lista'],
    desktop: 'consultations.webp',
    mobile: 'mobile-consultations.webp',
  },
  {
    id: 'invoices',
    icon: Receipt,
    label: 'Facturas',
    title: 'Sabes qué está cobrado y qué no',
    points: ['Cobrado y por cobrar, siempre a la vista', 'Pagos parciales y método de pago', 'Recibos para imprimir en córdobas'],
    desktop: 'invoices.webp',
    mobile: 'mobile-invoices.webp',
  },
] as const;

export function ProductTour() {
  const [active, setActive] = useState<(typeof STOPS)[number]['id']>('schedule');
  const stop = STOPS.find((s) => s.id === active) ?? STOPS[0];

  return (
    <section id="demo" className="py-24 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center space-y-3 mb-10">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider">El sistema, tal cual</p>
          <h2 className="text-3xl sm:text-4xl font-bold">Pantallas reales, no maquetas</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Esto es lo que ve tu equipo cada día. Puedes recorrerlo completo en el demo, sin crear cuenta.
          </p>
        </div>

        <div className="flex justify-center mb-10">
          <div className="inline-flex max-w-full overflow-x-auto bg-muted rounded-xl p-1 gap-1" role="tablist">
            {STOPS.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" role="tab" aria-selected={active === id} onClick={() => setActive(id)}
                className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                  active === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_2fr] gap-10 items-center">
          <div className="space-y-5 order-2 lg:order-1">
            <h3 className="text-2xl font-bold leading-snug">{stop.title}</h3>
            <ul className="space-y-3">
              {stop.points.map((p) => (
                <li key={p} className="flex gap-2.5 text-sm text-muted-foreground">
                  <Check size={16} className="text-primary shrink-0 mt-0.5" /> {p}
                </li>
              ))}
            </ul>
            <Button variant="outline" className="gap-2" asChild>
              <Link href="/demo">Abrir esta pantalla en el demo</Link>
            </Button>
          </div>

          <div className="order-1 lg:order-2">
            <BrowserFrame key={stop.desktop} src={stop.desktop} alt={`Pantalla de ${stop.label} en VetSystem`}
              className="hidden sm:block animate-in fade-in duration-300" />
            <PhoneFrame key={stop.mobile} src={stop.mobile} alt={`Pantalla de ${stop.label} en VetSystem, en el celular`}
              className="sm:hidden w-60 mx-auto" />
          </div>
        </div>
      </div>
    </section>
  );
}
