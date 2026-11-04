'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Pencil, Plus, Store, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeBranchCode, saveBranch, useBranches } from '@/hooks/useBranches';
import { useClinicUsers } from '@/hooks/useClinicUsers';
import { isClinicManager, userBranchIds } from '@/lib/auth/roles';
import { sessionLimits } from '@/lib/billing/plans';
import { MAIN_BRANCH_ID, type BranchLocal } from '@/types/branch';
import { cn } from '@/lib/utils';

const INPUT = 'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

type Draft = { id?: string; name: string; code: string; address: string; phone: string; active: boolean };
const EMPTY: Draft = { name: '', code: '', address: '', phone: '', active: true };

/**
 * Admin → Clínica: the clinic's branches (points of sale). Patients are shared;
 * inventory, cash, sales, agenda, expenses and payroll are kept per branch.
 * How many can be active comes from the plan (maxBranches).
 * A branch manager sees only their branches and edits just name and contact
 * (firestore.rules refuses the rest).
 */
export function BranchesCard() {
  const { session } = useAuth();
  const state = useBranches();
  const { users } = useClinicUsers(session?.clinicId);
  const { maxBranches } = sessionLimits(session);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  if (!state) return null;
  const clinicManager = isClinicManager(session?.role);
  const myBranches = userBranchIds(session?.branchIds);
  const shown = clinicManager ? state.branches : state.branches.filter((b) => myBranches.includes(b.id));
  // Who works in each branch; clinic managers work in all of them and are left out.
  const teamOf = (branchId: string) => users.filter((u) => !isClinicManager(u.role) && userBranchIds(u.branchIds).includes(branchId));
  const activeCount = state.branches.filter((b) => b.active).length;
  const atLimit = maxBranches !== null && activeCount >= maxBranches;
  // Activating a branch counts against the plan too.
  const wouldExceed = (d: Draft) => {
    const wasActive = d.id ? state.branches.find((b) => b.id === d.id)?.active : false;
    return d.active && !wasActive && atLimit;
  };

  function edit(b: BranchLocal) {
    setDraft({ id: b.id, name: b.name, code: b.code, address: b.address ?? '', phone: b.phone ?? '', active: b.active });
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) { toast.error('Ponle un nombre a la sucursal'); return; }
    const code = normalizeBranchCode(draft.code || draft.name);
    if (code.length < 2) { toast.error('El código necesita al menos 2 letras'); return; }
    if (state!.branches.some((b) => b.code === code && b.id !== draft.id)) { toast.error(`Ya hay una sucursal con el código ${code}`); return; }
    if (wouldExceed(draft)) { toast.error(`Tu plan permite ${maxBranches} sucursal${maxBranches === 1 ? '' : 'es'} activa${maxBranches === 1 ? '' : 's'}`); return; }
    setSaving(true);
    try {
      await saveBranch({ ...draft, code });
      toast.success('Sucursal guardada');
      setDraft(null);
    } catch (err) {
      console.error('[branches] save failed:', err);
      toast.error('No se pudo guardar la sucursal');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">{clinicManager ? 'Sucursales' : 'Tu sucursal'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {clinicManager ? (
              <>
                Los pacientes se comparten. Inventario, caja, ventas, agenda, gastos y colaboradores van por sucursal.
                {' '}{maxBranches === null ? 'Tu plan no limita las sucursales.' : `Tu plan incluye ${maxBranches}.`}
              </>
            ) : 'La dirección y el teléfono salen en los recibos y cotizaciones de la sucursal.'}
          </p>
        </div>
        {clinicManager && (
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0" disabled={atLimit || !!draft}
            onClick={() => setDraft({ ...EMPTY })}>
            <Plus size={14} /> Agregar
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {shown.map((b) => {
          const team = teamOf(b.id);
          return (
          <div key={b.id} className={cn('flex items-center gap-3 rounded-xl border border-border px-3 py-2.5', !b.active && 'opacity-60')}>
            <Store size={16} className="text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {b.name} <span className="ml-1 text-[10px] font-mono text-muted-foreground">{b.code}</span>
                {b.id === MAIN_BRANCH_ID && <span className="ml-2 text-[10px] text-muted-foreground">(principal)</span>}
                {!b.active && <span className="ml-2 text-[10px] text-muted-foreground">inactiva</span>}
              </p>
              {(b.address || b.phone) && (
                <p className="text-xs text-muted-foreground truncate">{[b.address, b.phone].filter(Boolean).join(' · ')}</p>
              )}
              {team.length > 0 && (
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5" title={team.map((u) => u.name).join(', ')}>
                  <Users size={11} className="shrink-0" />
                  {team.length} {team.length === 1 ? 'persona' : 'personas'}: {team.map((u) => u.name.split(' ')[0]).join(', ')}
                </p>
              )}
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Editar ${b.name}`} onClick={() => edit(b)} disabled={!!draft}>
              <Pencil size={14} />
            </Button>
          </div>
          );
        })}
      </div>

      {clinicManager && atLimit && !draft && (
        <p className="text-xs text-muted-foreground">Llegaste al máximo de sucursales de tu plan. El plan Clínica incluye 3.</p>
      )}

      {draft && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
          <p className="text-xs font-semibold">{draft.id ? 'Editar sucursal' : 'Nueva sucursal'}</p>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Nombre (ej. Sucursal Centro)" maxLength={60} className={INPUT} />
            <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: normalizeBranchCode(e.target.value) })}
              placeholder="CEN" maxLength={4} className={cn(INPUT, 'font-mono uppercase')} aria-label="Código"
              disabled={!clinicManager} />
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="Dirección (opcional)" maxLength={120} className={INPUT} />
            <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="Teléfono (opcional)" maxLength={20} className={INPUT} />
          </div>
          <p className="text-[11px] text-muted-foreground">El código (2 a 4 letras) identificará los documentos de la sucursal, como las facturas.</p>
          {clinicManager && draft.id !== MAIN_BRANCH_ID && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Activa
            </label>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
              {saving && <Loader2 size={13} className="animate-spin" />} Guardar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
