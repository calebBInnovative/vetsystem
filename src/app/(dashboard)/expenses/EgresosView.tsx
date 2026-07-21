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

function formatAmount(amount: number): string {
  return `C$ ${amount.toLocaleString('es-NI', { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${day} ${months[parseInt(month, 10) - 1]} ${year}`;
}

function AlertBadge({ nextDueDate }: { nextDueDate: string }) {
  const days  = daysUntilDue(nextDueDate);
  const level = alertLevel(nextDueDate);

  const classes: Record<typeof level, string> = {
    overdue:  'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
    urgent:   'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
    upcoming: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
    ok:       'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  };

  const label = level === 'overdue' ? 'Vencido' : `${days} día${days === 1 ? '' : 's'}`;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${classes[level]}`}>
      {label}
    </span>
  );
}

function CollaboratorBadge({ nextPaymentDate }: { nextPaymentDate: string }) {
  const days = daysUntilCollaboratorPayment(nextPaymentDate);

  let className: string;
  let label: string;

  if (days < 0) {
    className = 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400';
    label = 'Vencido';
  } else if (days <= 3) {
    className = 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400';
    label = `${days} día${days === 1 ? '' : 's'}`;
  } else if (days <= 7) {
    className = 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400';
    label = `${days} días`;
  } else {
    className = 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400';
    label = `${days} días`;
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

function PayExpenseDialog({
  expense,
  onClose,
}: {
  expense: FixedExpense | null;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [notes,  setNotes]  = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useState(() => {
    if (expense) {
      setAmount(String(expense.amount));
      setNotes('');
      setError('');
    }
  });

  if (!expense) return null;

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) { setError('Ingresa un monto válido.'); return; }
    setSaving(true);
    try {
      await markAsPaid(expense!.id, amountNum, new Date().toISOString().slice(0, 10), notes.trim() || undefined);
      onClose();
    } catch { setError('Error al registrar el pago.'); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={!!expense} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Registrar pago</DialogTitle></DialogHeader>
        <form onSubmit={handlePay} className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground">{expense.name}</p>
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Monto pagado</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">C$</span>
              <Input id="pay-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="pl-9" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-notes">Notas <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving && <span className="animate-spin">↻</span>} Confirmar pago
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayCollaboratorDialog({
  collaborator,
  onClose,
}: {
  collaborator: Collaborator | null;
  onClose:      () => void;
}) {
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState('');
  const [notes,  setNotes]  = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useState(() => {
    if (collaborator) {
      setAmount(String(collaborator.salary));
      const today = new Date();
      const month = today.toLocaleString('es-NI', { month: 'short' });
      const year  = today.getFullYear();
      const freq  = COLLABORATOR_PAYMENT_FREQUENCIES[collaborator.paymentFrequency];
      setPeriod(`${freq} ${month} ${year}`);
      setNotes('');
      setError('');
    }
  });

  if (!collaborator) return null;

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) { setError('Ingresa un monto válido.'); return; }
    setSaving(true);
    try {
      await registerCollaboratorPayment(collaborator!.id, amountNum, period.trim(), new Date().toISOString().slice(0, 10), notes.trim() || undefined);
      onClose();
    } catch { setError('Error al registrar el pago.'); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={!!collaborator} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Registrar pago — {collaborator.name}</DialogTitle></DialogHeader>
        <form onSubmit={handlePay} className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground">{collaborator.role}</p>
          <div className="space-y-1.5">
            <Label htmlFor="pcolab-amount">Monto</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">C$</span>
              <Input id="pcolab-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="pl-9" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pcolab-period">Período</Label>
            <Input id="pcolab-period" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Quincenal Jul 2026" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pcolab-notes">Notas <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input id="pcolab-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving && <span className="animate-spin">↻</span>} Confirmar pago
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TabExpenses() {
  const { expenses, loading } = useFixedExpenses();
  const [formOpen,    setFormOpen]    = useState(false);
  const [editExpense, setEditExpense] = useState<FixedExpense | undefined>(undefined);
  const [payExpense,  setPayExpense]  = useState<FixedExpense | null>(null);
  const [deleting,    setDeleting]    = useState<string | null>(null);

  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const upcomingExpenses = expenses.filter((g) => g.active && g.nextDueDate <= in30);

  function openEdit(g: FixedExpense) { setEditExpense(g); setFormOpen(true); }
  function closeForm() { setFormOpen(false); setEditExpense(undefined); }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este gasto fijo?')) return;
    setDeleting(id);
    try { await deleteFixedExpense(id); } finally { setDeleting(null); }
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

  if (expenses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <Wallet size={32} className="text-muted-foreground" />
        </div>
        <div>
          <p className="text-lg font-semibold">Sin gastos fijos</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">Agrega tus gastos fijos para recibir recordatorios de pago</p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="gap-2 mt-2"><Plus size={14} /> Agregar gasto</Button>
        <GastoFijoForm open={formOpen} onClose={closeForm} gasto={editExpense} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">Seguimiento de gastos recurrentes</p>
        <Button size="sm" onClick={() => setFormOpen(true)} className="gap-1.5"><Plus size={14} /> Agregar gasto</Button>
      </div>

      {upcomingExpenses.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Próximos payments (30 días)</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {upcomingExpenses.map((g) => (
              <div key={g.id} className="shrink-0 w-56 bg-card border border-border rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-tight line-clamp-2">{g.name}</p>
                  <AlertBadge nextDueDate={g.nextDueDate} />
                </div>
                <p className="text-xl font-bold">{formatAmount(g.amount)}</p>
                <p className="text-xs text-muted-foreground">{formatDate(g.nextDueDate)}</p>
                <Button size="sm" className="w-full" onClick={() => setPayExpense(g)}>Pagar</Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Todos los gastos</h2>
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
                {expenses.map((g) => (
                  <tr key={g.id} className={`hover:bg-muted/30 transition-colors ${!g.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium">{g.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{EXPENSE_CATEGORIES[g.category]}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatAmount(g.amount)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{EXPENSE_FREQUENCIES[g.frequency]}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{g.paymentDay}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{formatDate(g.nextDueDate)}</span>
                        {g.active && g.nextDueDate <= in30 && <AlertBadge nextDueDate={g.nextDueDate} />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleExpenseActive(g.id)} className="text-muted-foreground hover:text-primary transition-colors" title={g.active ? 'Desactivar' : 'Activar'}>
                        {g.active ? <ToggleRight size={20} className="text-primary" /> : <ToggleLeft size={20} />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(g)} title="Editar"><Pencil size={13} /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(g.id)} disabled={deleting === g.id} title="Eliminar"><Trash2 size={13} /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <GastoFijoForm open={formOpen} onClose={closeForm} gasto={editExpense} />
      <PayExpenseDialog expense={payExpense} onClose={() => setPayExpense(null)} />
    </div>
  );
}

function TabCollaborators() {
  const { collaborators, loading } = useCollaborators();
  const [formOpen,  setFormOpen]  = useState(false);
  const [editColab, setEditColab] = useState<Collaborator | undefined>(undefined);
  const [payColab,  setPayColab]  = useState<Collaborator | null>(null);
  const [deleting,  setDeleting]  = useState<string | null>(null);

  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const upcomingCollaborators = collaborators.filter((c) => c.active && c.nextPaymentDate <= in14);

  function openEdit(c: Collaborator) { setEditColab(c); setFormOpen(true); }
  function closeForm() { setFormOpen(false); setEditColab(undefined); }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este colaborador?')) return;
    setDeleting(id);
    try { await deleteCollaborator(id); } finally { setDeleting(null); }
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

  if (collaborators.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <Users size={32} className="text-muted-foreground" />
        </div>
        <div>
          <p className="text-lg font-semibold">Sin colaboradores</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">Agrega tus colaboradores para recibir recordatorios de pago</p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="gap-2 mt-2"><Plus size={14} /> Agregar colaborador</Button>
        <ColaboradorForm open={formOpen} onClose={closeForm} colaborador={editColab} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">Nómina y recordatorios de pago</p>
        <Button size="sm" onClick={() => setFormOpen(true)} className="gap-1.5"><Plus size={14} /> Agregar colaborador</Button>
      </div>

      {upcomingCollaborators.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Próximos payments de colaboradores (14 días)</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {upcomingCollaborators.map((c) => (
              <div key={c.id} className="shrink-0 w-60 bg-card border border-border rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.role}</p>
                  </div>
                  <CollaboratorBadge nextPaymentDate={c.nextPaymentDate} />
                </div>
                <p className="text-xl font-bold">{formatAmount(c.salary)}</p>
                <p className="text-xs text-muted-foreground">{formatDate(c.nextPaymentDate)}</p>
                <Button size="sm" className="w-full" onClick={() => setPayColab(c)}>Registrar pago</Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Todos los colaboradores</h2>
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
                {collaborators.map((c) => (
                  <tr key={c.id} className={`hover:bg-muted/30 transition-colors ${!c.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.role || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{COLLABORATOR_TYPES[c.type]}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatAmount(c.salary)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{COLLABORATOR_PAYMENT_FREQUENCIES[c.paymentFrequency]}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{formatDate(c.nextPaymentDate)}</span>
                        {c.active && c.nextPaymentDate <= in14 && <CollaboratorBadge nextPaymentDate={c.nextPaymentDate} />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleCollaboratorActive(c.id)} className="text-muted-foreground hover:text-primary transition-colors" title={c.active ? 'Desactivar' : 'Activar'}>
                        {c.active ? <ToggleRight size={20} className="text-primary" /> : <ToggleLeft size={20} />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)} title="Editar"><Pencil size={13} /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(c.id)} disabled={deleting === c.id} title="Eliminar"><Trash2 size={13} /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <ColaboradorForm open={formOpen} onClose={closeForm} colaborador={editColab} />
      <PayCollaboratorDialog collaborator={payColab} onClose={() => setPayColab(null)} />
    </div>
  );
}

export function EgresosView() {
  const [tab, setTab] = useState<'expenses' | 'collaborators'>('expenses');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Egresos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gastos fijos y nómina de colaboradores</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab('expenses')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === 'expenses' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Gastos Fijos
        </button>
        <button
          onClick={() => setTab('collaborators')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === 'collaborators' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Colaboradores
        </button>
      </div>

      {tab === 'expenses'      && <TabExpenses />}
      {tab === 'collaborators' && <TabCollaborators />}
    </div>
  );
}
