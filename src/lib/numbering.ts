import { db, getActiveBranchId } from '@/lib/db/database';
import { MAIN_BRANCH_ID } from '@/types/branch';

export type DocumentKind = 'FAC' | 'COT';

/**
 * Next number for an invoice (FAC) or quote (COT) of the active branch:
 *   main branch   → FAC-2026-0043      (the format every clinic already uses)
 *   other branches → FAC-SUR-2026-0001 (the branch code keeps series apart)
 *
 * The sequence is the highest number already used with that prefix + 1, among
 * every document on this device — synced ones from other devices included —
 * so it restarts each year and does not shift when a document is deleted.
 * Two devices of the same branch that both issue documents while offline can
 * still pick the same number; that needs a per-device series if it matters.
 */
export async function nextDocumentNumber(kind: DocumentKind, clinicId: string, year = new Date().getFullYear()): Promise<string> {
  const branchId = await getActiveBranchId();
  const code = branchId === MAIN_BRANCH_ID ? null : (await db.branches.get(branchId))?.code;
  const prefix = code ? `${kind}-${code}-${year}-` : `${kind}-${year}-`;

  const table = kind === 'FAC' ? db.invoices : db.quotes;
  let highest = 0;
  await table.where('clinicId').equals(clinicId).each((row: { number?: string }) => {
    if (typeof row.number !== 'string' || !row.number.startsWith(prefix)) return;
    const seq = Number.parseInt(row.number.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > highest) highest = seq;
  });
  return `${prefix}${String(highest + 1).padStart(4, '0')}`;
}
