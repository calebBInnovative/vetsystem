'use client';

import { useBranches } from '@/hooks/useBranches';
import { MAIN_BRANCH_ID } from '@/types/branch';

/**
 * Which branches a staff member works in. Hidden while the clinic has a single
 * branch. Managers (admin) reach every branch, so it is not shown for them.
 */
export function BranchAssignment({ value, onChange }: { value: string[] | undefined; onChange: (ids: string[]) => void }) {
  const state = useBranches();
  const branches = state?.branches.filter((b) => b.active) ?? [];
  if (branches.length < 2) return null;
  const selected = value?.length ? value : [MAIN_BRANCH_ID];

  return (
    <div className="rounded-xl border border-border p-3 space-y-2">
      <p className="text-xs font-medium">Sucursales donde trabaja</p>
      <div className="flex flex-wrap gap-2">
        {branches.map((b) => {
          const on = selected.includes(b.id);
          return (
            <label key={b.id} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={on}
                onChange={() => {
                  const next = on ? selected.filter((id) => id !== b.id) : [...selected, b.id];
                  if (next.length > 0) onChange(next); // at least one branch
                }} />
              {b.name}
            </label>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">Solo verá el inventario, la caja, la agenda y las ventas de estas sucursales.</p>
    </div>
  );
}
