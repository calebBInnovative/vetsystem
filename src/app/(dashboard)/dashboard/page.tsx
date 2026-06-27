'use client';

import Link from 'next/link';
import { useDashboard } from '@/hooks/useDashboard';
import { ProximasCitasDia } from '@/components/dashboard/ProximasCitasDia';
import { UltimasConsultas } from '@/components/dashboard/UltimasConsultas';
import { AlertasStock } from '@/components/inventario/AlertasStock';
import { Users, Calendar, Package, ClipboardList, Plus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function DashboardPage() {
  const { kpis, cargando } = useDashboard();
  const hoy = format(new Date(), "EEEE d 'de' MMMM", { locale: es });

  const tarjetas = [
    {
      label:     'Pacientes activos',
      valor:     kpis?.totalPacientes ?? 0,
      icon:      Users,
      color:     'text-primary',
      bg:        'bg-primary/10',
      href:      '/pacientes',
      subtitulo: 'registrados',
    },
    {
      label:     'Citas hoy',
      valor:     kpis?.citasHoy ?? 0,
      icon:      Calendar,
      color:     'text-blue-500',
      bg:        'bg-blue-500/10',
      href:      '/agenda',
      subtitulo: kpis?.citasPendientesHoy
        ? `${kpis.citasPendientesHoy} pendiente${kpis.citasPendientesHoy !== 1 ? 's' : ''}`
        : 'sin pendientes',
    },
    {
      label:     'Stock bajo',
      valor:     kpis?.productosStockBajo ?? 0,
      icon:      Package,
      color:     kpis?.productosStockBajo ? 'text-amber-500' : 'text-green-500',
      bg:        kpis?.productosStockBajo ? 'bg-amber-500/10' : 'bg-green-500/10',
      href:      '/inventario',
      subtitulo: kpis?.productosStockBajo ? 'productos' : 'todo en orden',
    },
    {
      label:     'Consultas este mes',
      valor:     kpis?.consultasEsteMes ?? 0,
      icon:      ClipboardList,
      color:     'text-purple-500',
      bg:        'bg-purple-500/10',
      href:      '/pacientes',
      subtitulo: 'registradas',
    },
  ];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold capitalize">{hoy}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Pet&apos;s House · Panel de control</p>
        </div>
        <div className="flex gap-2">
          <Link href="/pacientes/nuevo">
            <Button variant="outline" size="sm" className="gap-1.5 hidden sm:flex">
              <Plus size={14} /> Paciente
            </Button>
          </Link>
          <Link href="/agenda/nueva">
            <Button size="sm" className="gap-1.5">
              <Plus size={14} />
              <span className="hidden sm:inline">Nueva cita</span>
              <span className="sm:hidden">Cita</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tarjetas.map(({ label, valor, icon: Icon, color, bg, href, subtitulo }) => (
          <Link key={label} href={href} className="group">
            <div className="bg-card rounded-2xl border border-border p-4 hover:shadow-md hover:border-primary/30 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', bg)}>
                  <Icon className={cn('h-4 w-4', color)} />
                </div>
                <ArrowRight size={14} className="text-muted-foreground/0 group-hover:text-muted-foreground transition-colors mt-1" />
              </div>
              <div>
                {cargando ? (
                  <div className="h-8 w-12 bg-muted/60 rounded-lg animate-pulse mb-1" />
                ) : (
                  <p className={cn('text-3xl font-bold', color)}>{valor}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">{subtitulo}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Alertas de stock */}
      <AlertasStock />

      {/* Citas del día + Últimas consultas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProximasCitasDia />
        <UltimasConsultas />
      </div>

    </div>
  );
}
