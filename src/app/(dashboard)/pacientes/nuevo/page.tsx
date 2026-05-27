'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PacienteForm } from '@/components/pacientes/PacienteForm';
import { crearPaciente } from '@/hooks/usePacientes';
import { type PacienteFormData } from '@/lib/validations/paciente.schema';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function NuevoPacientePage() {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (datos: PacienteFormData) => {
    setCargando(true);
    try {
      const id = await crearPaciente(datos);
      toast.success('Paciente registrado', {
        description: `${datos.nombre} fue registrado correctamente.`,
      });
      router.push(`/pacientes/${id}`);
    } catch {
      toast.error('Error al guardar', {
        description: 'No se pudo registrar el paciente. Intenta de nuevo.',
      });
      setCargando(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/pacientes">
          <Button variant="ghost" size="icon">
            <ArrowLeft size={18} />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Nuevo Paciente</h1>
          <p className="text-sm text-muted-foreground">
            Completa los datos básicos — menos de 60 segundos
          </p>
        </div>
      </div>

      {/* Formulario */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <PacienteForm onSubmit={handleSubmit} cargando={cargando} />
      </div>

    </div>
  );
}
