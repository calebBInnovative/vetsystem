'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePatient } from '@/hooks/usePatients';
import { PET_SPECIES } from '@/types/patient';
import { Phone, Mail, MapPin, Weight, Calendar, Palette, Edit, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IniciarConsultaModal } from '@/components/patients/StartConsultationModal';
import { AgendarCitaModal } from '@/components/patients/ScheduleAppointmentModal';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface FichaPacienteProps {
  pacienteId: string;
}

export function FichaPaciente({ pacienteId }: FichaPacienteProps) {
  const { paciente, loading } = usePatient(pacienteId);

  // Todos los hooks antes de cualquier return condicional
  const [modalConsulta, setModalConsulta] = useState(false);
  const [modalCita,     setModalCita]     = useState(false);

  if (loading) {
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
        <p className="font-medium">Patient no encontrado</p>
        <Link href="/patients">
          <Button variant="outline">Volver a patients</Button>
        </Link>
      </div>
    );
  }

  const especie = PET_SPECIES[paciente.especie];

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <Link href="/patients">
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
        <Button
          variant="outline"
          className="h-auto py-4 flex-col gap-1.5"
          onClick={() => setModalConsulta(true)}
        >
          <span className="text-xl">🩺</span>
          <span className="text-xs font-medium">Iniciar consulta</span>
        </Button>

        <Button
          variant="outline"
          className="h-auto py-4 flex-col gap-1.5"
          onClick={() => setModalCita(true)}
        >
          <span className="text-xl">📅</span>
          <span className="text-xs font-medium">Agendar cita</span>
        </Button>

        <Button
          variant="outline"
          className="h-auto py-4 flex-col gap-1.5"
          asChild
        >
          <Link href={`/patients/${pacienteId}/historial`}>
            <span className="text-xl">📋</span>
            <span className="text-xs font-medium">Historial</span>
          </Link>
        </Button>
      </div>

      {/* Modales */}
      <IniciarConsultaModal
        open={modalConsulta}
        onClose={() => setModalConsulta(false)}
        paciente={paciente}
      />
      <AgendarCitaModal
        open={modalCita}
        onClose={() => setModalCita(false)}
        paciente={paciente}
      />

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
