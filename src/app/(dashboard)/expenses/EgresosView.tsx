'use client';

import { useState } from 'react';
import {
  Plus, Wallet, Pencil, Trash2, ToggleLeft, ToggleRight, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GastoFijoForm } from '@/components/expenses/ExpenseForm';
import { useFixedExpenses } from '@/hooks/useExpenses';
import { markAsPaid, deleteFixedExpense, toggleExpenseActive } from '@/hooks/useExpenses';
import type { FixedExpense } from '@/types/expense';
import {
  daysUntilDue,
  alertLevel,
  EXPENSE_CATEGORIES,
  EXPENSE_FREQUENCIES,
} from '@/types/expense';
import { ColaboradorForm } from '@/components/collaborators/CollaboratorForm';
import {
  useCollaborators,
  deleteCollaborator,
  toggleCollaboratorActive,
  registerCollaboratorPayment,
} from '@/hooks/useCollaborators';
import type { Collaborator } from '@/types/collaborator';
import {
  daysUntilCollaboratorPayment,
  COLLABORATOR_TYPES,
  COLLABORATOR_PAYMENT_FREQUENCIES,
} from '@/types/collaborator';

// ── Formatters ────────────────────────────────────────────────────────────────

function formatMonto(monto: number): string {
  return `C$ ${monto.toLocaleString('es-NI', { minimumFractionDigits: 2 })}`;
}

function formatFecha(iso: string): string {
  const [anio, mes, dia] = iso.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${dia} ${meses[parseInt(mes, 10) - 1]} ${anio}`;
}

// ── Badge de nivel — gastos ───────────────────────────────────────────────────

function AlertaBadge({ nextDueDate }: { nextDueDate: string }) {
  const dias  = daysUntilDue(nextDueDate);
  const nivel = alertLevel(nextDueDate);

  const clases: Record<typeof nivel, string> = {
    vencido: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
    urgente: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
    proximo: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
    normal:  'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  };

  const texto =
    nivel === 'vencido'
      ? 'Vencido'
      : `${dias} día${dias === 1 ? '' : 's'}`;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${clases[nivel]}`}>
      {texto}
    </span>
  );
}

// ── Badge de nivel — colaboradores ────────────────────────────────────────────

function ColabBadge({ nextPaymentDate }: { nextPaymentDate: string }) {
  const dias = daysUntilCollaboratorPayment(nextPaymentDate);

  let clase: string;
  let texto: string;

  if (dias < 0) {
    clase = 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400';
    texto = 'Vencido';
  } else if (dias <= 3) {
    clase = 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400';
    texto = `${dias} día${dias === 1 ? '' : 's'}`;
  } else if (dias <= 7) {
    clase = 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400';
    texto = `${dias} días`;
  } else {
    clase = 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400';
    texto = `${dias} días`;
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${clase}`}>
      {texto}
    </span>
  );
}

// ── Dialog de pago — Gasto Fijo ───────────────────────────────────────────────

function PagarGastoDialog({
  gasto,
  onClose,
}: {
  gasto: FixedExpense | null;
  onClose: () => void;
}) {
  const [monto,     setMonto]     = useState('');
  const [notas,     setNotas]     = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error,     setError]     = useState('');

  useState(() => {
    if (gasto) {
      setMonto(String(gasto.monto));
      setNotas('');
      setError('');
    }
  });

  if (!gasto) return null;

  async function handlePagar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      setError('Ingresa un monto válido.');
      return;
    }
    setGuardando(true);
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      await markAsPaid(gasto!.id, montoNum, hoy, notas.trim() || undefined);
      onClose();
    } catch {
      setError('Error al registrar el pago.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={!!gasto} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
        </DialogHeader>
        <form onSubmit={handlePagar} className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground">{gasto.nombre}</p>

          <div className="space-y-1.5">
            <Label htmlFor="pagar-monto">Monto pagado</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                C$
              </span>
              <Input
                id="pagar-monto"
                type="number"
                min="0.01"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="pl-9"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pagar-notas">Notas <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input
              id="pagar-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej: Payment con transferencia"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando} className="gap-2">
              {guardando && <span className="animate-spin">↻</span>}
              Confirmar pago
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog de pago — Collaborator ──────────────────────────────────────────────

function PagarColabDialog({
  colaborador,
  onClose,
}: {
  colaborador: Collaborator | null;
  onClose:     () => void;
}) {
  const [monto,     setMonto]     = useState('');
  const [periodo,   setPeriodo]   = useState('');
  const [notas,     setNotas]     = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error,     setError]     = useState('');

  // Build auto periodo string when colaborador changes
  useState(() => {
    if (colaborador) {
      setMonto(String(colaborador.salario));
      const hoy  = new Date();
      const mes  = hoy.toLocaleString('es-NI', { month: 'short' });
      const anio = hoy.getFullYear();
      const freq = COLLABORATOR_PAYMENT_FREQUENCIES[colaborador.frecuenciaPago];
      setPeriodo(`${freq} ${mes} ${anio}`);
      setNotas('');
      setError('');
    }
  });

  // Keep monto in sync if colaborador changes
  if (!colaborador) return null;

  async function handlePagar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      setError('Ingresa un monto válido.');
      return;
    }
    setGuardando(true);
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      await registerCollaboratorPayment(
        colaborador!.id,
        montoNum,
        periodo.trim(),
        hoy,
        notas.trim() || undefined,
      );
      onClose();
    } catch {
      setError('Error al registrar el pago.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={!!colaborador} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar pago — {colaborador.nombre}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handlePagar} className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground">{colaborador.rol}</p>

          <div className="space-y-1.5">
            <Label htmlFor="pcolab-monto">Monto</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                C$
              </span>
              <Input
                id="pcolab-monto"
                type="number"
                min="0.01"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="pl-9"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pcolab-periodo">Período</Label>
            <Input
              id="pcolab-periodo"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              placeholder="Quincenal Jul 2026"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pcolab-notas">Notas <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input
              id="pcolab-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej: Payment en efectivo"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando} className="gap-2">
              {guardando && <span className="animate-spin">↻</span>}
              Confirmar pago
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Tab: Gastos Fijos ─────────────────────────────────────────────────────────

function TabGastos() {
  const { gastos, loading } = useFixedExpenses();

  const [formOpen,   setFormOpen]   = useState(false);
  const [editGasto,  setEditGasto]  = useState<FixedExpense | undefined>(undefined);
  const [pagarGasto, setPagarGasto] = useState<FixedExpense | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);

  const en30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const gastosProximos = gastos.filter(
    (g) => g.activo && g.nextDueDate <= en30,
  );

  function abrirEditar(g: FixedExpense) {
    setEditGasto(g);
    setFormOpen(true);
  }

  function cerrarForm() {
    setFormOpen(false);
    setEditGasto(undefined);
  }

  async function handleEliminar(id: string) {
    if (!confirm('¿Eliminar este gasto fijo?')) return;
    setEliminando(id);
    try {
      await deleteFixedExpense(id);
    } finally {
      setEliminando(null);
    }
  }

  async function handleToggle(id: string) {
    await toggleExpenseActive(id);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  if (gastos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <Wallet size={32} className="text-muted-foreground" />
        </div>
        <div>
          <p className="text-lg font-semibold">Sin gastos fijos</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Agrega tus gastos fijos para recibir recordatorios de pago
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="gap-2 mt-2">
          <Plus size={14} /> Agregar gasto
        </Button>

        <GastoFijoForm open={formOpen} onClose={cerrarForm} gasto={editGasto} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Seguimiento de gastos recurrentes</p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)} className="gap-1.5">
          <Plus size={14} /> Agregar gasto
        </Button>
      </div>

      {/* Próximos payments */}
      {gastosProximos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Próximos payments (30 días)
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {gastosProximos.map((g) => (
              <div
                key={g.id}
                className="shrink-0 w-56 bg-card border border-border rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-tight line-clamp-2">{g.nombre}</p>
                  <AlertaBadge nextDueDate={g.nextDueDate} />
                </div>
                <p className="text-xl font-bold">{formatMonto(g.monto)}</p>
                <p className="text-xs text-muted-foreground">{formatFecha(g.nextDueDate)}</p>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => setPagarGasto(g)}
                >
                  Pagar
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tabla todos los gastos */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Todos los gastos
        </h2>
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Categoría</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Monto</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Frecuencia</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Día</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Próx. vencimiento</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Activo</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {gastos.map((g) => (
                  <tr key={g.id} className={`hover:bg-muted/30 transition-colors ${!g.activo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium">{g.nombre}</td>
                    <td className="px-4 py-3 text-muted-foreground">{EXPENSE_CATEGORIES[g.categoria]}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatMonto(g.monto)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{EXPENSE_FREQUENCIES[g.frecuencia]}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{g.diaPago}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{formatFecha(g.nextDueDate)}</span>
                        {g.activo && g.nextDueDate <= en30 && (
                          <AlertaBadge nextDueDate={g.nextDueDate} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggle(g.id)}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title={g.activo ? 'Desactivar' : 'Activar'}
                      >
                        {g.activo
                          ? <ToggleRight size={20} className="text-primary" />
                          : <ToggleLeft  size={20} />
                        }
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => abrirEditar(g)}
                          title="Editar"
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleEliminar(g.id)}
                          disabled={eliminando === g.id}
                          title="Eliminar"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Dialogs */}
      <GastoFijoForm open={formOpen} onClose={cerrarForm} gasto={editGasto} />
      <PagarGastoDialog gasto={pagarGasto} onClose={() => setPagarGasto(null)} />
    </div>
  );
}

// ── Tab: Colaboradores ────────────────────────────────────────────────────────

function TabColaboradores() {
  const { colaboradores, loading } = useCollaborators();

  const [formOpen,       setFormOpen]       = useState(false);
  const [editColab,      setEditColab]      = useState<Collaborator | undefined>(undefined);
  const [pagarColab,     setPagarColab]     = useState<Collaborator | null>(null);
  const [eliminando,     setEliminando]     = useState<string | null>(null);

  const en14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const colabsProximos = colaboradores.filter(
    (c) => c.activo && c.nextPaymentDate <= en14,
  );

  function abrirEditar(c: Collaborator) {
    setEditColab(c);
    setFormOpen(true);
  }

  function cerrarForm() {
    setFormOpen(false);
    setEditColab(undefined);
  }

  async function handleEliminar(id: string) {
    if (!confirm('¿Eliminar este colaborador?')) return;
    setEliminando(id);
    try {
      await deleteCollaborator(id);
    } finally {
      setEliminando(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  if (colaboradores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <Users size={32} className="text-muted-foreground" />
        </div>
        <div>
          <p className="text-lg font-semibold">Sin colaboradores</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Agrega tus colaboradores para recibir recordatorios de pago
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="gap-2 mt-2">
          <Plus size={14} /> Agregar colaborador
        </Button>

        <ColaboradorForm open={formOpen} onClose={cerrarForm} colaborador={editColab} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Nómina y recordatorios de pago</p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)} className="gap-1.5">
          <Plus size={14} /> Agregar colaborador
        </Button>
      </div>

      {/* Próximos payments de colaboradores */}
      {colabsProximos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Próximos payments de colaboradores (14 días)
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {colabsProximos.map((c) => (
              <div
                key={c.id}
                className="shrink-0 w-60 bg-card border border-border rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate">{c.nombre}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.rol}</p>
                  </div>
                  <ColabBadge nextPaymentDate={c.nextPaymentDate} />
                </div>
                <p className="text-xl font-bold">{formatMonto(c.salario)}</p>
                <p className="text-xs text-muted-foreground">{formatFecha(c.nextPaymentDate)}</p>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => setPagarColab(c)}
                >
                  Registrar pago
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tabla todos los colaboradores */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Todos los colaboradores
        </h2>
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Rol</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Salario</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Frecuencia</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Próximo pago</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Activo</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {colaboradores.map((c) => (
                  <tr key={c.id} className={`hover:bg-muted/30 transition-colors ${!c.activo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium">{c.nombre}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.rol || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{COLLABORATOR_TYPES[c.tipo]}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatMonto(c.salario)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{COLLABORATOR_PAYMENT_FREQUENCIES[c.frecuenciaPago]}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{formatFecha(c.nextPaymentDate)}</span>
                        {c.activo && c.nextPaymentDate <= en14 && (
                          <ColabBadge nextPaymentDate={c.nextPaymentDate} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleCollaboratorActive(c.id)}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title={c.activo ? 'Desactivar' : 'Activar'}
                      >
                        {c.activo
                          ? <ToggleRight size={20} className="text-primary" />
                          : <ToggleLeft  size={20} />
                        }
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => abrirEditar(c)}
                          title="Editar"
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleEliminar(c.id)}
                          disabled={eliminando === c.id}
                          title="Eliminar"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Dialogs */}
      <ColaboradorForm open={formOpen} onClose={cerrarForm} colaborador={editColab} />
      <PagarColabDialog colaborador={pagarColab} onClose={() => setPagarColab(null)} />
    </div>
  );
}

// ── Vista principal ────────────────────────────────────────────────────────────

export function EgresosView() {
  const [tab, setTab] = useState<'gastos' | 'collaborators'>('gastos');

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">Egresos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gastos fijos y nómina de colaboradores
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab('gastos')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'gastos'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Gastos Fijos
        </button>
        <button
          onClick={() => setTab('collaborators')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'collaborators'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Colaboradores
        </button>
      </div>

      {/* Tab content */}
      {tab === 'gastos'        && <TabGastos />}
      {tab === 'collaborators' && <TabColaboradores />}
    </div>
  );
}
