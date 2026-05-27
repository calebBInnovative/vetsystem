'use client';

import { useRouter } from 'next/navigation';
import { PagoForm } from '@/components/finanzas/PagoForm';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NuevoPagoPage() {
  const router = useRouter();

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Registrar pago</h1>
          <p className="text-sm text-muted-foreground">Nuevo ingreso</p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <PagoForm
          onExito={() => router.push('/finanzas')}
          onCancelar={() => router.back()}
        />
      </div>
    </div>
  );
}
