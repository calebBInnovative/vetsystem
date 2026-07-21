'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { deletePromotion, getPromotions, togglePromotion } from '@/hooks/usePromotions';
import type { PromotionLocal, PromotionItem } from '@/types/promotion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CalendarDays,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Tag,
  Trash2,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return `C$${n.toFixed(2)}`;
}

function discountBadgeClass(type: string): string {
  switch (type) {
    case 'percentage': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
    case 'fixed':      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300';
    case 'free':       return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
    default:           return '';
  }
}

function discountBadgeLabel(item: PromotionItem): string {
  switch (item.discountType) {
    case 'percentage': return `-${item.discountValue}%`;
    case 'fixed':      return `-C$${item.discountValue.toFixed(2)}`;
    case 'free':       return 'Gratis';
    default:           return '';
  }
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function PromotionSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4 animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="h-5 w-44 rounded-lg bg-muted" />
        <div className="h-5 w-16 rounded-full bg-muted" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-3/4 rounded bg-muted" />
      </div>
      <div className="h-4 w-1/2 rounded bg-muted" />
      <div className="flex items-center gap-2 pt-1 border-t border-border">
        <div className="h-7 w-7 rounded-lg bg-muted" />
        <div className="h-7 w-7 rounded-lg bg-muted" />
        <div className="h-7 w-7 rounded-lg bg-muted ml-auto" />
      </div>
    </div>
  );
}

// ─── Promotion card ───────────────────────────────────────────────────────────

interface PromotionCardProps {
  promotion: PromotionLocal;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
}

function PromotionCard({ promotion, onToggle, onDelete, deletingId }: PromotionCardProps) {
  const savings = promotion.originalTotal - promotion.total;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">

      {/* Header: name + active badge */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-base leading-tight">{promotion.name}</h3>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
            promotion.active
              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {promotion.active ? 'Activa' : 'Inactiva'}
        </span>
      </div>

      {/* Date range */}
      {(promotion.validFrom || promotion.validUntil) && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays size={13} className="shrink-0" />
          <span>
            {promotion.validFrom ?? '—'} → {promotion.validUntil ?? '—'}
          </span>
        </div>
      )}

      {/* Items list */}
      <ul className="space-y-1.5 flex-1">
        {promotion.items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate text-foreground">
              {item.name}
              <span className="text-muted-foreground"> ×{item.quantity}</span>
            </span>
            {item.discountType !== 'none' && (
              <span
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-xs font-medium',
                  discountBadgeClass(item.discountType),
                )}
              >
                {discountBadgeLabel(item)}
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* Totals */}
      <div className="text-sm space-y-0.5">
        <p className="text-muted-foreground">
          Original{' '}
          <span className="line-through tabular-nums">
            {fmtCurrency(promotion.originalTotal)}
          </span>
          {' → '}
          <span className="font-semibold text-foreground tabular-nums">
            {fmtCurrency(promotion.total)}
          </span>
        </p>
        {savings > 0.001 && (
          <p className="text-xs font-medium text-green-600 dark:text-green-400 tabular-nums">
            Ahorro: {fmtCurrency(savings)}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 pt-2 border-t border-border">
        {/* Toggle active */}
        <button
          onClick={() => onToggle(promotion.id, !promotion.active)}
          title={promotion.active ? 'Desactivar' : 'Activar'}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          {promotion.active ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>

        {/* Edit */}
        <Link
          href={`/promotions/${promotion.id}`}
          title="Editar"
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <Pencil size={16} />
        </Link>

        {/* Delete */}
        <button
          onClick={() => onDelete(promotion.id)}
          disabled={deletingId === promotion.id}
          title="Eliminar"
          className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-muted-foreground hover:text-destructive ml-auto disabled:opacity-50"
        >
          {deletingId === promotion.id ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Trash2 size={16} />
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PromotionsPage() {
  const { session } = useAuth();

  const [promotions, setPromotions] = useState<PromotionLocal[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.clinicId) return;
    setLoading(true);
    try {
      const data = await getPromotions(session.clinicId);
      setPromotions(data);
    } finally {
      setLoading(false);
    }
  }, [session?.clinicId]);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(id: string, active: boolean) {
    await togglePromotion(id, active);
    setPromotions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, active } : p)),
    );
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta promoción? No se podrá recuperar.')) return;
    setDeletingId(id);
    try {
      await deletePromotion(id);
      setPromotions((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Promociones</h1>
          {!loading && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {promotions.length}{' '}
              {promotions.length === 1 ? 'promoción' : 'promociones'}
            </p>
          )}
        </div>
        <Link href="/promotions/new">
          <Button className="gap-2">
            <Plus size={17} />
            <span className="hidden sm:inline">Nueva Promoción</span>
            <span className="sm:hidden">Nueva</span>
          </Button>
        </Link>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PromotionSkeleton />
          <PromotionSkeleton />
          <PromotionSkeleton />
        </div>
      )}

      {/* Empty state */}
      {!loading && promotions.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="rounded-2xl bg-muted p-5">
            <Tag size={36} className="text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-lg">No hay promociones</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Crea tu primera promoción para ofrecer descuentos a tus clientes.
            </p>
          </div>
          <Link href="/promotions/new">
            <Button className="gap-2">
              <Plus size={16} />
              Crear primera promoción
            </Button>
          </Link>
        </div>
      )}

      {/* Promotions grid */}
      {!loading && promotions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {promotions.map((promo) => (
            <PromotionCard
              key={promo.id}
              promotion={promo}
              onToggle={handleToggle}
              onDelete={handleDelete}
              deletingId={deletingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
