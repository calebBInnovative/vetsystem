'use client';

import { useState } from 'react';
import Link from 'next/link';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ConsultaForm } from '@/components/history/ConsultationForm';
import { createHistoryEntry } from '@/hooks/useHistory';
import { usePatient } from '@/hooks/usePatients';
import { type ConsultaFormData } from '@/lib/validations/history.schema';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export function NewConsultationView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();
  const { paciente } = usePatient(id);
  const [loading, setCargando] = useState(false);

  const handleSubmit = async (datos: ConsultaFormData) => {
    setCargando(true);
    try {
      await createHistoryEntry(id, datos);
      toast.success('Consultation registrada', {
        description: paciente
          ? `Consultation de ${paciente.name} guardada correctamente.`
          : 'Consultation guardada correctamente.',
      });
      router.push(`/patients/${id}/history`);
    } catch {
      toast.error('Error al guardar', {
        description: 'No se pudo registrar la consulta. Intenta de nuevo.',
      });
      setCargando(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      <div className="flex items-center gap-3">
        <Link href={`/patients/${id}/history`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft size={18} />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Nueva Consultation</h1>
          {paciente && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {paciente.name} · {paciente.species}
            </p>
          )}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6">
        <ConsultaForm onSubmit={handleSubmit} loading={loading} />
      </div>

    </div>
  );
}
