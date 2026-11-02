'use client';

import { Check, ChevronDown, Store } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { switchBranch, useBranches } from '@/hooks/useBranches';
import { cn } from '@/lib/utils';

/**
 * Header picker for the branch (point of sale) the user is working in. Hidden
 * when the user has a single branch, which is every clinic without branches.
 */
export function BranchSwitcher() {
  const state = useBranches();
  if (!state || state.allowed.length < 2) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button"
          className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-muted max-w-[9rem] sm:max-w-[14rem]"
          aria-label="Cambiar de sucursal">
          <Store size={14} className="text-primary shrink-0" />
          <span className="truncate">{state.active?.name ?? 'Sucursal'}</span>
          <ChevronDown size={13} className="text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Trabajando en</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {state.allowed.map((b) => (
          <DropdownMenuItem key={b.id} className="flex items-center gap-2 cursor-pointer"
            onClick={async () => {
              if (b.id === state.activeId) return;
              await switchBranch(b.id);
              toast.success(`Ahora trabajas en ${b.name}`);
            }}>
            <Check size={14} className={cn('shrink-0', b.id === state.activeId ? 'text-primary' : 'opacity-0')} />
            <span className="flex-1 truncate">{b.name}</span>
            <span className="text-[10px] font-mono text-muted-foreground">{b.code}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
