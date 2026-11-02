'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import {
  db, getActiveBranchId, getAllowedBranchIds, getClinicId, setActiveBranchId,
} from '@/lib/db/database';
import { DEFAULT_MAIN_BRANCH, MAIN_BRANCH_ID, type BranchLocal } from '@/types/branch';

/** The clinic's branches, the main one first (virtual until it is first edited). */
async function listBranches(): Promise<BranchLocal[]> {
  const clinicId = await getClinicId();
  const rows = await db.branches.where('clinicId').equals(clinicId).filter((b) => !b.deletedAt).toArray();
  const main = rows.find((b) => b.id === MAIN_BRANCH_ID)
    ?? { ...DEFAULT_MAIN_BRANCH, clinicId, syncStatus: 'synced' as const, updatedAt: 0 };
  return [main, ...rows.filter((b) => b.id !== MAIN_BRANCH_ID).sort((a, b) => a.createdAt - b.createdAt)];
}

export interface BranchState {
  /** Every branch of the clinic (active or not), main first */
  branches: BranchLocal[];
  /** Branches this user may switch to */
  allowed: BranchLocal[];
  activeId: string;
  active: BranchLocal | undefined;
}

/** Live branch state; undefined while loading. */
export function useBranches(): BranchState | undefined {
  return useLiveQuery(async () => {
    const [branches, allowedIds, activeId] = await Promise.all([listBranches(), getAllowedBranchIds(), getActiveBranchId()]);
    const allowed = branches.filter((b) => allowedIds.includes(b.id) && b.active);
    return { branches, allowed, activeId, active: branches.find((b) => b.id === activeId) };
  }, []);
}

export async function switchBranch(branchId: string): Promise<void> {
  await setActiveBranchId(branchId);
}

/** Uppercase letters only, 2–4 of them: it goes into document numbers. */
export function normalizeBranchCode(code: string): string {
  return code.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

/** Managers only (firestore.rules). Creates or edits a branch, main included. */
export async function saveBranch(input: Pick<BranchLocal, 'name' | 'code' | 'active'> & Partial<Pick<BranchLocal, 'id' | 'address' | 'phone'>>): Promise<string> {
  const clinicId = await getClinicId();
  const now = Date.now();
  const id = input.id ?? crypto.randomUUID();
  const existing = await db.branches.get(id);
  const branch: BranchLocal = {
    id,
    clinicId,
    name: input.name.trim(),
    code: normalizeBranchCode(input.code),
    address: input.address?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    // The main branch always stays active: every record without a branch lives there.
    active: id === MAIN_BRANCH_ID ? true : input.active,
    createdAt: existing?.createdAt ?? (id === MAIN_BRANCH_ID ? 0 : now),
    syncStatus: 'pending',
    updatedAt: now,
  };
  await db.transaction('rw', [db.branches, db.syncQueue], async () => {
    await db.branches.put(branch);
    const { syncStatus: _s, ...data } = branch;
    void _s;
    await db.syncQueue.add({
      collection: 'branches', documentId: id, operation: existing ? 'update' : 'create',
      data, attempts: 0, createdAt: now,
    });
  });
  return id;
}
