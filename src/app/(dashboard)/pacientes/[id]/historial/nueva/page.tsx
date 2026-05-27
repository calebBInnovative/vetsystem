'use client';

import { useState } from 'react';
import Link from 'next/link';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ConsultaForm } from '@/components/historial/ConsultaForm';
import { crearConsulta } from '@/hooks/useHistorial';
import { usePaciente } from '@/hooks/usePacientes';
import { type ConsultaFormData } from '@/lib/validations/historial.schema';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  params: Promise<{ id: string }>;
}

export default function NuevaConsultaPage({ params }: Props) {
  const { id } = use(params);
  const router  = useRouter();
  const { paciente } = usePaciente(id);
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (datos: ConsultaFormData) => {
    setCargando(true);
    try {
      await crearConsulta(id, datos);
      toast.success('Consulta registrada', {
        description: paciente
          ? `Consulta de ${paciente.nombre} guardada correctamente.`
          : 'Consulta guardada correctamente.',
      });
      router.push(`/pacientes/${id}/historial`);
    } catch {
      toast.error('Error al guardar', {
        description: 'No se pudo registrar la consulta. Intenta de nuevo.',
      });
      setCargando(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/pacientes/${id}/historial`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft size={18} />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Nueva Consulta</h1>
          {paciente && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {paciente.nombre} · {paciente.especie}
            </p>
          )}
        </div>
      </div>

      {/* Formulario */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <ConsultaForm onSubmit={handleSubmit} cargando={cargando} />
      </div>

    </div>
  );
}
