'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Ban, BadgePercent, Boxes, ScrollText, Search, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranches } from '@/hooks/useBranches';
import { db, branchOf, getAllowedBranchIds } from '@/lib/db/database';
import { isClinicManager } from '@/lib/auth/roles';
import { AUDIT_CATEGORIES, auditCategory } from '@/lib/audit/audit';
import { cn } from '@/lib/utils';
import type { AuditCategory } from '@/types/audit';

/** How far back the screen reads; older lines stay stored and synced. */
const MAX_ROWS = 500;

const CATEGORY_STYLE: Record<AuditCategory, { icon: React.ElementType; className: string }> = {
  void:     { icon: Ban,          className: 'bg-red-500/12 text-red-600' },
  discount: { icon: BadgePercent, className: 'bg-amber-500/15 text-amber-700' },
  stock:    { icon: Boxes,        className: 'bg-sky-500/12 text-sky-700' },
  team:     { icon: Users,        className: 'bg-violet-500/12 text-violet-700' },
};

/**
 * Admin → Bitácora: who voided, discounted, moved stock or changed the team,
 * where and when. Clinic managers read every branch; a branch manager only
 * theirs (firestore.rules only syncs those to their device anyway).
 */
export function AuditLogTab() {
  const { session } = useAuth();
  const branchState = useBranches();
  const [category, setCategory] = useState<AuditCategory | 'all'>('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [search, setSearch] = useState('');

  const entries = useLiveQuery(async () => {
    if (!session) return [];
    const allowed = isClinicManager(session.role) ? null : await getAllowedBranchIds();
    const rows = await db.auditLog.where('clinicId').equals(session.clinicId).reverse().sortBy('createdAt');
    return rows.filter((r) => !allowed || allowed.includes(branchOf(r))).slice(0, MAX_ROWS);
  }, [session?.clinicId, session?.role]);

  const branches = branchState?.branches ?? [];
  const multiBranch = branches.filter((b) => b.active).length > 1;
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (entries ?? []).filter((e) =>
      (category === 'all' || auditCategory(e.action) === category)
      && (branchFilter === 'all' || branchOf(e) === branchFilter)
      && (!q || e.summary.toLowerCase().includes(q) || e.userName.toLowerCase().includes(q)));
  }, [entries, category, branchFilter, search]);

  // Grouped by day, newest first
  const days = useMemo(() => {
    const groups = new Map<string, typeof visible>();
    for (const e of visible) {
      const key = format(e.createdAt, 'yyyy-MM-dd');
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    return [...groups.entries()];
  }, [visible]);

  return (
    <section className="bg-card rounded-2xl border border-border p-5 space-y-4">
      <div>
        <p className="font-medium text-sm">Bitácora</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Anulaciones, descuentos, cambios de stock y del equipo: quién, dónde y cuándo. Nadie puede borrar una línea.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Tipo de acción">
        {(['all', ...Object.keys(AUDIT_CATEGORIES)] as (AuditCategory | 'all')[]).map((c) => (
          <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              category === c ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>
            {c === 'all' ? 'Todo' : AUDIT_CATEGORIES[c]}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <label className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar persona, producto, número…"
            className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </label>
        {multiBranch && (
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} aria-label="Sucursal"
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="all">Todas las sucursales</option>
            {(branchState?.allowed ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {entries === undefined ? (
        <p className="text-sm text-muted-foreground py-4">Cargando…</p>
      ) : days.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <ScrollText size={24} className="mx-auto mb-2 opacity-40" />
          {entries.length === 0 ? 'Todavía no hay acciones registradas.' : 'Nada coincide con el filtro.'}
        </div>
      ) : (
        <div className="space-y-5">
          {days.map(([day, rows]) => (
            <div key={day} className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {format(rows[0].createdAt, "EEEE d 'de' MMMM yyyy", { locale: es })}
              </p>
              <div className="divide-y divide-border">
                {rows.map((e) => {
                  const cat = auditCategory(e.action);
                  const { icon: Icon, className } = CATEGORY_STYLE[cat];
                  return (
                    <div key={e.id} className="flex items-start gap-3 py-2.5">
                      <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', className)}>
                        <Icon size={14} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{e.summary}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {e.userName} · {format(e.createdAt, 'HH:mm')}
                          {multiBranch && ` · ${branchName(branchOf(e))}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {entries.length >= MAX_ROWS && (
            <p className="text-[11px] text-muted-foreground text-center">Se muestran las últimas {MAX_ROWS} acciones.</p>
          )}
        </div>
      )}
    </section>
  );
}
