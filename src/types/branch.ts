import type { SyncMeta } from '@/types/patient';

/**
 * A point of sale of the clinic. Patients, owners, services and promotions are
 * shared by every branch; inventory, sales, cash, invoices, appointments,
 * quotes, consultations, expenses and payroll belong to one branch (branchId).
 */
export interface Branch {
  id: string;
  clinicId: string;
  name: string;
  /** 2–4 uppercase letters, used in document numbers (FAC-CEN-…) */
  code: string;
  address?: string;
  phone?: string;
  active: boolean;
  createdAt: number;
}

export type BranchLocal = Branch & SyncMeta;

/** Every record without a branchId (all data from before branches) belongs here. */
export const MAIN_BRANCH_ID = 'main';

export const DEFAULT_MAIN_BRANCH: Omit<Branch, 'clinicId'> = {
  id: MAIN_BRANCH_ID, name: 'Principal', code: 'PRI', active: true, createdAt: 0,
};
