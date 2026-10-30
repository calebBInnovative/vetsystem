'use client';

import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';

export const INPUT = 'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

/** Editors receive updaters, so an edit made during an async upload is never lost. */
export type Update<T> = (updater: (prev: T) => T) => void;

/** Visible checkbox, reorder and delete controls shared by the list editors. */
export function ItemControls({ visible, onVisible, index, count, onMove, onDelete }: {
  visible: boolean;
  onVisible: (visible: boolean) => void;
  index: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <label className="ml-auto flex items-center gap-2 text-sm">
        <input type="checkbox" checked={visible} onChange={(e) => onVisible(e.target.checked)} />
        Visible
      </label>
      <button type="button" disabled={index === 0} onClick={() => onMove(-1)}
        className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Subir">
        <ArrowUp size={14} />
      </button>
      <button type="button" disabled={index === count - 1} onClick={() => onMove(1)}
        className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Bajar">
        <ArrowDown size={14} />
      </button>
      <button type="button" onClick={onDelete}
        className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Borrar">
        <Trash2 size={14} />
      </button>
    </>
  );
}

/** List helpers for items with an id. */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const next = [...list];
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
}

export function patchItem<T extends { id: string }>(list: T[], id: string, patch: Partial<T>): T[] {
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export function Counter({ value, max }: { value: string; max: number }) {
  return <span className="block text-right text-[11px] text-muted-foreground">{value.length}/{max}</span>;
}
