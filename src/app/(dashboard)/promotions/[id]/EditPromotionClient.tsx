'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/db/database';
import { deletePromotion, updatePromotion } from '@/hooks/usePromotions';
import type { PromotionLocal } from '@/types/promotion';
import { PromotionForm, type PromotionFormValues } from '../_components/PromotionForm';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Loader2, Trash2 } from 'lucide-react';

export default function EditPromotionClient() {
  const router            = useRouter();
  const { id }            = useParams<{ id: string }>();

  const [promotion, setPromotion] = useState<PromotionLocal | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [notFound,  setNotFound]  = useState(false);
  const [deleting,  setDeleting]  = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const p = await db.promotions.get(id);
        if (!p || p.deletedAt) {
          setNotFound(true);
        } else {
          setPromotion(p);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function handleSubmit(values: PromotionFormValues) {
    await updatePromotion(id, values);
    router.push('/promotions');
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar esta promoción? Esta acción no se puede deshacer.')) return;
    setDeleting(true);
    try {
      await deletePromotion(id);
      router.push('/promotions');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={26} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !promotion) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
        <p className="text-lg font-semibold">Promoción no encontrada</p>
        <p className="text-sm text-muted-foreground">
          Es posible que haya sido eliminada o que el enlace sea incorrecto.
        </p>
        <Link href="/promotions">
          <Button variant="outline">Volver a Promociones</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">

      <div className="flex items-center gap-3">
        <Link
          href="/promotions"
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Volver a Promociones"
        >
          <ChevronLeft size={20} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Editar Promoción</h1>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {promotion.name}
          </p>
        </div>
      </div>

      <PromotionForm
        initial={{
          name:        promotion.name,
          description: promotion.description,
          active:      promotion.active,
          validFrom:   promotion.validFrom,
          validUntil:  promotion.validUntil,
          items:       promotion.items,
        }}
        clinicId={promotion.clinicId}
        onSubmit={handleSubmit}
        submitLabel="Guardar cambios"
        extraActions={
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-destructive/60 text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Trash2 size={15} />
            )}
            Eliminar
          </button>
        }
      />
    </div>
  );
}
