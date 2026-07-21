'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { createPromotion } from '@/hooks/usePromotions';
import { PromotionForm, type PromotionFormValues } from '../_components/PromotionForm';
import { ChevronLeft } from 'lucide-react';

export default function NewPromotionPage() {
  const router   = useRouter();
  const { session } = useAuth();
  const clinicId = session?.clinicId ?? '';

  async function handleSubmit(values: PromotionFormValues) {
    await createPromotion({ clinicId, ...values });
    router.push('/promotions');
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">

      {/* Back + title */}
      <div className="flex items-center gap-3">
        <Link
          href="/promotions"
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Volver a Promociones"
        >
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Nueva Promoción</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Crea un paquete de productos o servicios con descuentos especiales.
          </p>
        </div>
      </div>

      <PromotionForm
        clinicId={clinicId}
        onSubmit={handleSubmit}
        submitLabel="Crear Promoción"
      />
    </div>
  );
}
