'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CitaForm } from '@/components/appointments/AppointmentForm';
import { createAppointment } from '@/hooks/useAppointments';
import { type CitaFormData } from '@/lib/validations/appointment.schema';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Suspense } from 'react';

function NuevaCitaContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const fechaParam   = searchParams.get('fecha') ?? undefined;
  const [loading, setCargando] = useState(false);

  const handleSubmit = async (datos: CitaFormData) => {
    setCargando(true);
    try {
      await createAppointment(datos);
      toast.success('Appointment agendada', {
        description: `Appointment registrada para el ${datos.fecha} a las ${datos.horaInicio}.`,
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
          <h1 className="text-2xl font-bold">Nueva Appointment</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Completa los datos para agendar la cita
          </p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6">
        <CitaForm
          onSubmit={handleSubmit}
          loading={loading}
          defaultValues={fechaParam ? { fecha: fechaParam } : undefined}
        />
      </div>
    </div>
  );
}

export default function NewAppointmentPage() {
  return (
    <Suspense>
      <NuevaCitaContent />
    </Suspense>
  );
}
