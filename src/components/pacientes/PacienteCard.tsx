'use client';

import Link from 'next/link';
import { type PacienteConDueno, ESPECIES } from '@/types/paciente';
import { Phone, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface PacienteCardProps {
  paciente: PacienteConDueno;
}

export function PacienteCard({ paciente }: PacienteCardProps) {
  const especie = ESPECIES[paciente.especie];
  const sincronizado = paciente.syncStatus === 'synced';
  const edad = paciente.fechaNacimiento ? calcularEdad(paciente.fechaNacimiento) : null;

  return (
    <Link href={`/pacientes/${paciente.id}`} className="block group">
      <div className="bg-card rounded-2xl border border-border p-4 hover:shadow-md hover:border-primary/30 transition-all duration-200">

        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl shrink-0 group-hover:scale-105 transition-transform">
            {especie.emoji}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
                  {paciente.nombre}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {especie.label}
                  {paciente.raza && ` · ${paciente.raza}`}
                  {` · ${paciente.sexo === 'macho' ? '♂' : '♀'}`}
                  {edad && ` · ${edad}`}
                </p>
              </div>

              {/* Indicador de sync */}
              <span
                className={cn(
                  'w-2 h-2 rounded-full mt-1.5 shrink-0',
                  sincronizado ? 'bg-green-500' : 'bg-amber-400'
                )}
                title={sincronizado ? 'Sincronizado' : 'Pendiente de sincronización'}
              />
            </div>

            {/* Dueño */}
            {paciente.dueno && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                <Phone size={11} className="shrink-0" />
                <span className="truncate font-medium">{paciente.dueno.nombre}</span>
                <span className="text-border shrink-0">·</span>
                <span className="shrink-0">{paciente.dueno.telefono}</span>
              </div>
            )}

            {paciente.peso && (
              <p className="text-xs text-muted-foreground mt-1">{paciente.peso} kg</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border/50">
          <Clock size={11} className="text-muted-foreground/50 shrink-0" />
          <span className="text-xs text-muted-foreground/50">
            {formatDistanceToNow(new Date(paciente.updatedAt), { addSuffix: true, locale: es })}
          </span>
        </div>

      </div>
    </Link>
  );
}

function calcularEdad(fechaNacimiento: string): string {
  const hoy = new Date();
  const nac = new Date(fechaNacimiento);
  const meses =
    (hoy.getFullYear() - nac.getFullYear()) * 12 + (hoy.getMonth() - nac.getMonth());

  if (meses < 2) return `${Math.max(1, Math.floor(meses * 4.3))} sem`;
  if (meses < 12) return `${meses} meses`;
  const años = Math.floor(meses / 12);
  const resto = meses % 12;
  return resto > 0 ? `${años}a ${resto}m` : `${años} año${años !== 1 ? 's' : ''}`;
}
