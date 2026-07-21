'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

const selectClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';
import type { FixedExpense, ExpenseCategory, ExpenseFrequency } from '@/types/expense';
import { EXPENSE_CATEGORIES, EXPENSE_FREQUENCIES } from '@/types/expense';
import { createFixedExpense, updateFixedExpense } from '@/hooks/useExpenses';

interface Props {
  open:     boolean;
  onClose:  () => void;
  gasto?:   FixedExpense;
}

const CATEGORIA_KEYS = Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[];
const FRECUENCIA_KEYS = Object.keys(EXPENSE_FREQUENCIES) as ExpenseFrequency[];

export function GastoFijoForm({ open, onClose, gasto }: Props) {
  const editando = !!gasto;

  const [nombre,    setNombre]    = useState('');
  const [categoria, setCategoria] = useState<ExpenseCategory>('other');
  const [monto,     setMonto]     = useState('');
  const [frecuencia, setFrecuencia] = useState<ExpenseFrequency>('monthly');
  const [diaPago,   setDiaPago]   = useState('1');
  const [guardando, setGuardando] = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => {
    if (open) {
      setNombre(gasto?.name      ?? '');
      setCategoria(gasto?.category ?? 'other');
      setMonto(gasto?.amount != null ? String(gasto.amount) : '');
      setFrecuencia(gasto?.frequency ?? 'monthly');
      setDiaPago(gasto?.paymentDay != null ? String(gasto.paymentDay) : '1');
      setError('');
    }
  }, [open, gasto]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const montoNum  = parseFloat(monto);
    const diaPagoNum = parseInt(diaPago, 10);

    if (!nombre.trim()) { setError('El nombre es requerido.'); return; }
    if (isNaN(montoNum) || montoNum <= 0) { setError('Ingresa un monto válido.'); return; }
    if (isNaN(diaPagoNum) || diaPagoNum < 1 || diaPagoNum > 28) {
      setError('El día de pago debe estar entre 1 y 28.');
      return;
    }

    setGuardando(true);
    try {
      if (editando && gasto) {
        await updateFixedExpense(gasto.id, {
          name:       nombre.trim(),
          amount:     montoNum,
          category:   categoria,
          frequency:  frecuencia,
          paymentDay: diaPagoNum,
        });
      } else {
        await createFixedExpense({
          name:       nombre.trim(),
          amount:     montoNum,
          category:   categoria,
          frequency:  frecuencia,
          paymentDay: diaPagoNum,
        });
      }
      onClose();
    } catch {
      setError('Error al guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Nombre */}
          <div className="space-y-1.5">
            <Label htmlFor="gf-nombre">Nombre</Label>
            <Input
              id="gf-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Renta del local"
              required
            />
          </div>

          {/* Categoría */}
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <select
              className={selectClass}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as ExpenseCategory)}
            >
              {CATEGORIA_KEYS.map((k) => (
                <option key={k} value={k}>{EXPENSE_CATEGORIES[k]}</option>
              ))}
            </select>
          </div>

          {/* Monto */}
          <div className="space-y-1.5">
            <Label htmlFor="gf-monto">Monto</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                C$
              </span>
              <Input
                id="gf-monto"
                type="number"
                min="0.01"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                className="pl-9"
                required
              />
            </div>
          </div>

          {/* Frecuencia */}
          <div className="space-y-1.5">
            <Label>Frecuencia</Label>
            <select
              className={selectClass}
              value={frecuencia}
              onChange={(e) => setFrecuencia(e.target.value as ExpenseFrequency)}
            >
              {FRECUENCIA_KEYS.map((k) => (
                <option key={k} value={k}>{EXPENSE_FREQUENCIES[k]}</option>
              ))}
            </select>
          </div>

          {/* Día de pago */}
          <div className="space-y-1.5">
            <Label htmlFor="gf-dia">Día del mes en que vence</Label>
            <Input
              id="gf-dia"
              type="number"
              min="1"
              max="28"
              value={diaPago}
              onChange={(e) => setDiaPago(e.target.value)}
              placeholder="1"
            />
            <p className="text-xs text-muted-foreground">Entre 1 y 28 para cubrir todos los meses.</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando} className="gap-2">
              {guardando && <Loader2 size={13} className="animate-spin" />}
              {editando ? 'Guardar cambios' : 'Agregar gasto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
