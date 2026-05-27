'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePacientes } from '@/hooks/usePacientes';
import { PacienteCard } from '@/components/pacientes/PacienteCard';
import { BuscadorPacientes } from '@/components/pacientes/BuscadorPacientes';
import { Button } from '@/components/ui/button';
import { Plus, Users, Loader2 } from 'lucide-react';

export default function PacientesPage() {
  const [busqueda, setBusqueda] = useState('');
  const { pacientes, cargando } = usePacientes(busqueda);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pacientes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {cargando
              ? 'Cargando...'
              : `${pacientes.length} paciente${pacientes.length !== 1 ? 's' : ''} registrado${pacientes.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link href="/pacientes/nuevo">
          <Button className="gap-2">
            <Plus size={17} />
            <span className="hidden sm:inline">Nuevo Paciente</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
        </Link>
      </div>

      {/* Buscador */}
      <BuscadorPacientes onBuscar={setBusqueda} />

      {/* Lista / estados */}
      {cargando ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : pacientes.length === 0 ? (
        <EstadoVacio busqueda={busqueda} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pacientes.map((p) => (
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
          No encontramos pacientes para &ldquo;{busqueda}&rdquo;
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-24 space-y-3">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
        <Users className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <p className="font-semibold text-lg">Aún no hay pacientes</p>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
        Registra tu primera mascota para comenzar a usar VetSystem
      </p>
      <div className="pt-2">
        <Link href="/pacientes/nuevo">
          <Button size="lg" className="gap-2">
            <Plus size={17} />
            Registrar primer paciente
          </Button>
        </Link>
      </div>
    </div>
  );
}
