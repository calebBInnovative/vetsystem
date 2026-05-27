'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CitaForm } from '@/components/agenda/CitaForm';
import { crearCita } from '@/hooks/useAgenda';
import { type CitaFormData } from '@/lib/validations/agenda.schema';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Suspense } from 'react';

function NuevaCitaContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const fechaParam   = searchParams.get('fecha') ?? undefined;
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (datos: CitaFormData) => {
    setCargando(true);
    try {
      await crearCita(datos);
      toast.success('Cita agendada', {
        description: `Cita registrada para el ${datos.fecha} a las ${datos.horaInicio}.`,
      });
      router.push(`/agenda`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('No se pudo agendar', { description: msg });
      setCargando(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/agenda">
          <Button variant="ghost" size="icon">
            <ArrowLeft size={18} />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Nueva Cita</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Completa los datos para agendar la cita
          </p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6">
        <CitaForm
          onSubmit={handleSubmit}
          cargando={cargando}
          defaultValues={fechaParam ? { fecha: fechaParam } : undefined}
        />
      </div>
    </div>
  );
}

export default function NuevaCitaPage() {
  return (
    <Suspense>
      <NuevaCitaContent />
    </Suspense>
  );
}
