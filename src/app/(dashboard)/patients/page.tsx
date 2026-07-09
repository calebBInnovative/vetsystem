'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePatients } from '@/hooks/usePatients';
import { PacienteCard } from '@/components/patients/PatientCard';
import { BuscadorPacientes } from '@/components/patients/PatientSearch';
import { Button } from '@/components/ui/button';
import { Plus, Users, Loader2 } from 'lucide-react';

export default function PatientsPage() {
  const [busqueda, setBusqueda] = useState('');
  const { patients, loading } = usePatients(busqueda);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pacientes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading
              ? 'Cargando...'
              : `${patients.length} paciente${patients.length !== 1 ? 's' : ''} registrado${patients.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link href="/patients/new">
          <Button className="gap-2">
            <Plus size={17} />
            <span className="hidden sm:inline">Nuevo Patient</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
        </Link>
      </div>

      {/* Buscador */}
      <BuscadorPacientes onBuscar={setBusqueda} />

      {/* Lista / estados */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : patients.length === 0 ? (
        <EstadoVacio busqueda={busqueda} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {patients.map((p) => (
            <PacienteCard key={p.id} paciente={p} />
          ))}
        </div>
      )}

    </div>
  );
}

function EstadoVacio({ busqueda }: { busqueda: string }) {
  if (busqueda) {
    return (
      <div className="text-center py-24 space-y-2">
        <p className="text-4xl">🔍</p>
        <p className="font-semibold">Sin resultados</p>
        <p className="text-sm text-muted-foreground">
          No encontramos patients para &ldquo;{busqueda}&rdquo;
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-24 space-y-3">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
        <Users className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <p className="font-semibold text-lg">Aún no hay patients</p>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
        Registra tu primera mascota para comenzar a usar VetSystem
      </p>
      <div className="pt-2">
        <Link href="/patients/new">
          <Button size="lg" className="gap-2">
            <Plus size={17} />
            Registrar primer paciente
          </Button>
        </Link>
      </div>
    </div>
  );
}
