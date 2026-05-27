'use client';

import Link from 'next/link';
import { usePaciente } from '@/hooks/usePacientes';
import { ESPECIES } from '@/types/paciente';
import { Phone, Mail, MapPin, Weight, Calendar, Palette, Edit, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface FichaPacienteProps {
  pacienteId: string;
}

export function FichaPaciente({ pacienteId }: FichaPacienteProps) {
  const { paciente, cargando } = usePaciente(pacienteId);

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!paciente) {
    return (
      <div className="text-center py-24 space-y-4">
        <p className="text-4xl">🐾</p>
        <p className="font-medium">Paciente no encontrado</p>
        <Link href="/pacientes">
          <Button variant="outline">Volver a pacientes</Button>
        </Link>
      </div>
    );
  }

  const especie = ESPECIES[paciente.especie];
  const sincronizado = paciente.syncStatus === 'synced';

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <Link href="/pacientes">
          <Button variant="ghost" size="icon" className="-ml-2 mt-0.5">
            <ArrowLeft size={18} />
          </Button>
        </Link>

        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center text-4xl shrink-0">
          {especie.emoji}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold leading-tight">{paciente.nombre}</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                {especie.label}{paciente.raza && ` · ${paciente.raza}`}
              </p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0">
              <Edit size={14} className="mr-1.5" />
              Editar
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="secondary">
              {paciente.sexo === 'macho' ? '♂ Macho' : '♀ Hembra'}
            </Badge>
            {paciente.peso && (
              <Badge variant="secondary">{paciente.peso} kg</Badge>
            )}
            {paciente.color && (
              <Badge variant="secondary">{paciente.color}</Badge>
            )}
            <Badge
              variant="outline"
              className={cn(
                sincronizado
                  ? 'text-green-700 border-green-200 bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-950/40'
                  : 'text-amber-700 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/40'
              )}
            >
              {sincronizado ? '✓ Sincronizado' : '⏳ Pendiente'}
            </Badge>
          </div>
        </div>
      </div>

      {/* ── Info Grid ──────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Información médica */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Información Médica
          </h2>
          <dl className="space-y-3">
            {paciente.fechaNacimiento && (
              <Dato
                icon={<Calendar size={14} />}
                label="Nacimiento"
                valor={format(new Date(paciente.fechaNacimiento), "dd 'de' MMMM 'de' yyyy", { locale: es })}
              />
            )}
            {paciente.peso && (
              <Dato icon={<Weight size={14} />} label="Peso" valor={`${paciente.peso} kg`} />
            )}
            {paciente.color && (
              <Dato icon={<Palette size={14} />} label="Color" valor={paciente.color} />
            )}
          </dl>
          {paciente.notas && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground mb-1">Notas</p>
              <p className="text-sm leading-relaxed">{paciente.notas}</p>
            </div>
          )}
        </div>

        {/* Dueño */}
        {paciente.dueno && (
          <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Dueño
            </h2>
            <dl className="space-y-3">
              <Dato icon={<span className="text-sm">👤</span>} label="Nombre" valor={paciente.dueno.nombre} />
              <Dato icon={<Phone size={14} />} label="Teléfono" valor={paciente.dueno.telefono} />
              {paciente.dueno.email && (
                <Dato icon={<Mail size={14} />} label="Correo" valor={paciente.dueno.email} />
              )}
              {paciente.dueno.direccion && (
                <Dato icon={<MapPin size={14} />} label="Dirección" valor={paciente.dueno.direccion} />
              )}
            </dl>
          </div>
        )}
      </div>

      {/* ── Acciones rápidas ───────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { emoji: '📋', label: 'Historial', href: `/pacientes/${pacienteId}/historial` },
          { emoji: '📅', label: 'Nueva Cita',  href: undefined },
          { emoji: '💬', label: 'WhatsApp',    href: undefined },
        ].map(({ emoji, label, href }) => (
          <Button
            key={label}
            variant="outline"
            className="h-auto py-4 flex-col gap-1.5"
            asChild={!!href}
          >
            {href ? (
              <Link href={href}>
                <span className="text-xl">{emoji}</span>
                <span className="text-xs font-medium">{label}</span>
              </Link>
            ) : (
              <>
                <span className="text-xl">{emoji}</span>
                <span className="text-xs font-medium">{label}</span>
              </>
            )}
          </Button>
        ))}
      </div>

    </div>
  );
}

function Dato({ icon, label, valor }: { icon: React.ReactNode; label: string; valor: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-muted-foreground shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm font-medium truncate">{valor}</dd>
      </div>
    </div>
  );
}
