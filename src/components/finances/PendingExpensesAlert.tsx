'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useExpenseAlerts } from '@/hooks/useExpenses';

function formatMonto(n: number) {
  return new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 }).format(n);
}

export function PendingExpensesAlert() {
  const { totalUnpaidAmount, unpaidCount } = useExpenseAlerts();

  if (!totalUnpaidAmount || totalUnpaidAmount <= 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
          {formatMonto(totalUnpaidAmount)} en egresos sin registrar
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {unpaidCount} {unpaidCount === 1 ? 'gasto pendiente de pago' : 'gastos pendientes de pago'} —
          no están incluidos en el balance actual.{' '}
          <Link href="/expenses" className="underline underline-offset-2 hover:text-foreground transition-colors">
            Ir a Egresos para registrar pagos
          </Link>
        </p>
      </div>
    </div>
  );
}
