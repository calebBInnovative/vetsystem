'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBranches } from '@/hooks/useBranches';
import { branchOf } from '@/lib/db/database';
import { transferStock } from '@/lib/inventory/transfer';
import type { ProductLocal } from '@/types/inventory';

const INPUT = 'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

/**
 * Sends stock of this product to another branch. Shown only when the user can
 * reach another branch (managers: any; staff: the ones assigned to them).
 */
export function TransferStockCard({ product, unitLabel }: { product: ProductLocal; unitLabel: string }) {
  const state = useBranches();
  const [toBranchId, setToBranchId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const fromBranchId = branchOf(product);
  const targets = state?.allowed.filter((b) => b.id !== fromBranchId) ?? [];
  if (targets.length === 0) return null;
  const target = targets.find((b) => b.id === toBranchId) ?? targets[0];
  const qty = Number(quantity);
  const valid = qty > 0 && qty <= product.currentStock;

  async function send() {
    if (!valid) { toast.error(`La cantidad debe estar entre 1 y ${product.currentStock}`); return; }
    setSending(true);
    try {
      const result = await transferStock({ productId: product.id, toBranchId: target.id, quantity: qty, note });
      toast.success(`${qty} ${unitLabel} enviado${qty === 1 ? '' : 's'} a ${target.name}`
        + (result.createdInTarget ? ' (se creó el producto allá)' : ''));
      setQuantity(''); setNote('');
    } catch (err) {
      console.error('[transfer] failed:', err);
      toast.error('No se pudo hacer el traslado');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <ArrowRightLeft size={13} /> Trasladar a otra sucursal
      </h2>
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <label className="space-y-1">
          <span className="text-xs font-medium">Destino</span>
          <select value={target.id} onChange={(e) => setToBranchId(e.target.value)} className={INPUT}>
            {targets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium">Cantidad</span>
          <input type="number" inputMode="decimal" min="0" max={product.currentStock} step="any" value={quantity}
            onChange={(e) => setQuantity(e.target.value)} placeholder={`máx. ${product.currentStock}`} className={INPUT} />
        </label>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Nota (opcional)" className={INPUT} />
      <p className="text-[11px] text-muted-foreground">
        Se descuenta aquí y se suma en {target.name}. Si allá no existe este producto, se crea con los mismos datos y precios.
      </p>
      <Button onClick={send} disabled={sending || !valid} className="w-full gap-2">
        {sending ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
        Trasladar {valid ? `${qty} ${unitLabel}` : ''}
      </Button>
    </div>
  );
}
