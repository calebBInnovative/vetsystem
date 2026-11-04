'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, KeySquare, Loader2, Pencil, RefreshCw, Trash2, UserPlus, Users, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useBranches } from '@/hooks/useBranches';
import { useClinicUsers } from '@/hooks/useClinicUsers';
import { createUser, deleteUser, sendPasswordReset, updateUser, type FirestoreUser } from '@/lib/auth/auth.service';
import {
  ROLE_LABELS, assignableRoles, canManageUser, hasFullModuleAccess, isClinicManager, userBranchIds,
} from '@/lib/auth/roles';
import { sessionLimits } from '@/lib/billing/plans';
import { cn } from '@/lib/utils';
import type { AppModule, Permissions, UserRole } from '@/types/license';
import { BranchAssignment } from './BranchAssignment';

const INPUT = 'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

const MODULES: { key: AppModule; label: string }[] = [
  { key: 'patients',      label: 'Pacientes' },
  { key: 'schedule',      label: 'Agenda' },
  { key: 'consultations', label: 'Consultas' },
  { key: 'sales',         label: 'Ventas' },
  { key: 'quotes',        label: 'Cotizaciones' },
  { key: 'inventory',     label: 'Inventario' },
  { key: 'finances',      label: 'Finanzas' },
  { key: 'invoices',      label: 'Facturas' },
  { key: 'services',      label: 'Servicios' },
  { key: 'promotions',    label: 'Promociones' },
  { key: 'import',        label: 'Importar/Exportar' },
];

const DEFAULT_PERMISSIONS: Permissions = {
  patients: true, schedule: true, consultations: true, sales: true, quotes: true,
  inventory: false, finances: false, invoices: false, services: false,
  promotions: false, import: false,
};

/** What each role means, shown under the role picker. */
const ROLE_HINTS: Partial<Record<UserRole, string>> = {
  admin:          'Acceso completo: todas las sucursales, el plan y los datos de la clínica.',
  branch_manager: 'Todos los módulos, pero solo en sus sucursales. Administra al equipo de esas sucursales.',
  veterinarian:   'Solo los módulos que marques abajo.',
  reception:      'Solo los módulos que marques abajo.',
};

const ROLE_BADGE: Partial<Record<UserRole, string>> = {
  master:         'bg-amber-500/15 text-amber-700',
  admin:          'bg-primary/12 text-primary',
  branch_manager: 'bg-violet-500/15 text-violet-700',
};

type Draft = {
  name: string;
  role: UserRole;
  permissions: Permissions | null;
  branchIds?: string[];
};

function permissionsForRole(role: UserRole, current: Permissions | null): Permissions | null {
  if (hasFullModuleAccess(role)) return null;
  return current ?? { ...DEFAULT_PERMISSIONS };
}

/**
 * Admin → Equipo. Clinic managers see and manage everyone; a branch manager
 * sees the staff of their branches and can add, edit or remove only them
 * (firestore.rules enforces the same limits).
 */
export function TeamTab() {
  const { session } = useAuth();
  const branchState = useBranches();
  const clinicId = session?.clinicId;
  const { users, loading, error, reload } = useClinicUsers(clinicId);
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const me = session ? { role: session.role, branchIds: session.branchIds } : null;
  const clinicManager = isClinicManager(session?.role);
  const myBranches = userBranchIds(session?.branchIds);
  const roles = assignableRoles(session?.role);
  const activeBranches = branchState?.branches.filter((b) => b.active) ?? [];
  const multiBranch = activeBranches.length > 1;
  const branchName = (id: string) => branchState?.branches.find((b) => b.id === id)?.name ?? id;

  // Branch managers see only their branches' staff (and themselves).
  const visible = useMemo(() => users.filter((u) =>
    clinicManager || u.uid === session?.uid
      || (!isClinicManager(u.role) && userBranchIds(u.branchIds).some((id) => myBranches.includes(id)))),
  [users, clinicManager, session?.uid, myBranches]);

  const filtered = branchFilter === 'all'
    ? visible
    : visible.filter((u) => isClinicManager(u.role) || userBranchIds(u.branchIds).includes(branchFilter));
  const filterOptions = clinicManager ? activeBranches : activeBranches.filter((b) => myBranches.includes(b.id));

  // Plan cap on team size (soft: checked here, not in firestore.rules)
  const { maxUsers } = sessionLimits(session);
  const atUserLimit = maxUsers !== null && !loading && !error && users.length >= maxUsers;

  // ── Create ──
  const emptyCreate = (): Draft & { email: string; password: string } => ({
    email: '', password: '', name: '', role: 'veterinarian', permissions: { ...DEFAULT_PERMISSIONS },
    // A branch manager must name the branch: the rules refuse a profile outside theirs.
    branchIds: clinicManager ? undefined : [branchState?.activeId && myBranches.includes(branchState.activeId) ? branchState.activeId : myBranches[0]],
  });
  const [form, setForm] = useState(emptyCreate);
  const [creating, setCreating] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!clinicId) return;
    if (atUserLimit) { toast.error(`Tu plan permite hasta ${maxUsers} usuarios.`); return; }
    setCreating(true);
    try {
      await createUser({
        ...form,
        clinicId,
        branchIds: isClinicManager(form.role) ? undefined : (form.branchIds ?? (clinicManager ? undefined : myBranches)),
      });
      toast.success(`Usuario ${form.email} creado`);
      setForm(emptyCreate());
      void reload();
    } catch (err) {
      toast.error((err as Error).message || 'No se pudo crear el usuario');
    } finally {
      setCreating(false);
    }
  }

  // ── Edit ──
  const [editTarget, setEditTarget] = useState<FirestoreUser | null>(null);
  const [edit, setEdit] = useState<Draft>({ name: '', role: 'veterinarian', permissions: null });
  const [saving, setSaving] = useState(false);

  function openEdit(u: FirestoreUser) {
    setEditTarget(u);
    setEdit({
      name: u.name,
      role: u.role,
      permissions: hasFullModuleAccess(u.role) ? null : (u.permissions ?? { ...DEFAULT_PERMISSIONS }),
      branchIds: u.branchIds,
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      await updateUser(editTarget.uid, {
        name: edit.name.trim() || editTarget.name,
        role: edit.role,
        permissions: edit.permissions,
        branchIds: isClinicManager(edit.role) ? undefined : (edit.branchIds ?? (clinicManager ? undefined : myBranches)),
      });
      toast.success('Usuario actualizado');
      setEditTarget(null);
      void reload();
    } catch (err) {
      console.error('[team] update failed:', err);
      toast.error('No se pudo guardar. ¿Tienes conexión?');
    } finally {
      setSaving(false);
    }
  }

  // ── Password reset / delete ──
  const [resetTarget, setResetTarget] = useState<FirestoreUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FirestoreUser | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmReset() {
    if (!resetTarget) return;
    setBusy(true);
    try {
      await sendPasswordReset(resetTarget.email);
      toast.success(`Enviamos el enlace a ${resetTarget.email}`);
      setResetTarget(null);
    } catch {
      toast.error('No se pudo enviar el correo. ¿Tienes conexión?');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteUser(deleteTarget.uid);
      toast.success(`${deleteTarget.name} ya no tiene acceso`);
      setDeleteTarget(null);
      void reload();
    } catch {
      toast.error('No se pudo eliminar. ¿Tienes conexión?');
    } finally {
      setBusy(false);
    }
  }

  const roleFields = (draft: Draft, set: (d: Draft) => void) => (
    <>
      <div className="space-y-1">
        <label className="text-xs font-medium">Rol</label>
        <select value={draft.role} className={INPUT}
          onChange={(e) => {
            const role = e.target.value as UserRole;
            set({ ...draft, role, permissions: permissionsForRole(role, draft.permissions) });
          }}>
          {(roles.includes(draft.role) ? roles : [draft.role, ...roles]).map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        {ROLE_HINTS[draft.role] && <p className="text-[11px] text-muted-foreground">{ROLE_HINTS[draft.role]}</p>}
      </div>
      {!isClinicManager(draft.role) && (
        <BranchAssignment
          value={draft.branchIds}
          onChange={(ids) => set({ ...draft, branchIds: ids })}
          allowedIds={clinicManager ? undefined : myBranches}
          hint={draft.role === 'branch_manager'
            ? 'Administrará el equipo, el inventario, la caja y las ventas de estas sucursales.'
            : undefined}
        />
      )}
      {draft.permissions && (
        <div className="rounded-xl border border-border p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Acceso a módulos</p>
          <div className="grid grid-cols-2 gap-1.5">
            {MODULES.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer select-none rounded-lg px-2.5 py-1.5 hover:bg-muted/60 transition-colors">
                <input type="checkbox" className="accent-primary h-3.5 w-3.5"
                  checked={draft.permissions?.[key] ?? false}
                  onChange={(e) => set({ ...draft, permissions: { ...draft.permissions!, [key]: e.target.checked } })} />
                <span className="text-xs">{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-5">
      {/* ── Team list ── */}
      <section className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-sm">{clinicManager ? 'Equipo de la clínica' : 'Equipo de tus sucursales'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {maxUsers !== null && !loading && !error
                ? `${users.length} de ${maxUsers} usuarios de tu plan.`
                : 'Quién entra al sistema y qué puede hacer.'}
            </p>
          </div>
          <button type="button" onClick={() => void reload()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <RefreshCw size={11} /> Recargar
          </button>
        </div>

        {multiBranch && filterOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filtrar por sucursal">
            {[{ id: 'all', name: 'Todas' }, ...filterOptions].map((b) => (
              <button key={b.id} type="button" role="radio" aria-checked={branchFilter === b.id}
                onClick={() => setBranchFilter(b.id)}
                className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  branchFilter === b.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>
                {b.name}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 size={14} className="animate-spin" /> Cargando…
          </div>
        ) : error ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <WifiOff size={22} className="mx-auto mb-2 opacity-50" />
            El equipo se administra con internet. Conéctate y toca Recargar.
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <Users size={24} className="mx-auto mb-2 opacity-40" />
            Nadie trabaja en esta sucursal todavía.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((u) => {
              const manageable = !!me && u.uid !== session?.uid && canManageUser(me, u);
              // Clinic managers represent the clinic: only branch managers and staff are removed.
              const removable = manageable && !isClinicManager(u.role);
              return (
                <div key={u.uid} className="flex items-center gap-3 py-2.5">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary text-xs font-bold shrink-0">
                    {u.name?.slice(0, 2).toUpperCase() ?? 'US'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {u.name}{u.uid === session?.uid && <span className="ml-1.5 text-[10px] text-muted-foreground">(tú)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    {multiBranch && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {isClinicManager(u.role)
                          ? <span className="text-[10px] rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">Todas las sucursales</span>
                          : userBranchIds(u.branchIds).map((id) => (
                            <span key={id} className="text-[10px] rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">{branchName(id)}</span>
                          ))}
                      </div>
                    )}
                  </div>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0',
                    ROLE_BADGE[u.role] ?? 'bg-muted text-muted-foreground')}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                  {manageable && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button type="button" onClick={() => openEdit(u)} title="Editar" aria-label={`Editar a ${u.name}`}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button type="button" onClick={() => setResetTarget(u)} title="Restablecer contraseña" aria-label={`Restablecer la contraseña de ${u.name}`}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <KeySquare size={13} />
                      </button>
                      {removable && (
                        <button type="button" onClick={() => setDeleteTarget(u)} title="Quitar acceso" aria-label={`Quitar el acceso de ${u.name}`}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── New user ── */}
      <section className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <div>
          <p className="font-medium text-sm">Agregar a alguien del equipo</p>
          <p className="text-xs text-muted-foreground mt-0.5">Entrará con su correo y esta contraseña temporal. Requiere internet.</p>
        </div>
        <form onSubmit={create} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Nombre completo</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Dra. Ana López" className={INPUT} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Email</label>
              <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="ana@clinica.com" className={INPUT} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium flex items-center gap-1.5"><KeyRound size={11} /> Contraseña temporal</label>
            <input type="text" required minLength={6} value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="mínimo 6 caracteres" className={cn(INPUT, 'font-mono')} />
          </div>
          {roleFields(form, (d) => setForm({ ...form, ...d }))}
          <Button type="submit" disabled={creating || atUserLimit} className="w-full gap-2">
            {creating ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            {atUserLimit ? 'Límite de usuarios del plan alcanzado' : 'Crear usuario'}
          </Button>
          {atUserLimit && clinicManager && (
            <p className="text-[11px] text-muted-foreground text-center">Cambia de plan en la pestaña Plan para agregar más.</p>
          )}
        </form>
      </section>

      {/* ── Edit ── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar usuario</DialogTitle></DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4 pt-1">
            <div className="space-y-1">
              <label className="text-xs font-medium">Nombre completo</label>
              <input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={INPUT} />
            </div>
            {roleFields(edit, setEdit)}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="gap-1.5">
                {saving && <Loader2 size={13} className="animate-spin" />} Guardar cambios
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Password reset ── */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) setResetTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Restablecer contraseña</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground pt-1">
            Enviaremos un enlace a <span className="font-medium text-foreground">{resetTarget?.email}</span> para que cree una contraseña nueva.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancelar</Button>
            <Button onClick={confirmReset} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <KeySquare size={13} />} Enviar enlace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Quitar acceso</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground pt-1">
            <span className="font-semibold text-foreground">{deleteTarget?.name}</span> dejará de entrar al sistema de inmediato.
            Lo que registró se conserva.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Quitar acceso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
