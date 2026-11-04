import type { UserRole } from '@/types/license';
import { MAIN_BRANCH_ID } from '@/types/branch';

/**
 * Who can do what, in one place. Three tiers, as in multi-location practice software:
 * - clinic managers (master, admin): every branch, the plan, the clinic profile;
 * - branch managers: every module, but only inside their branches, plus that branches' team;
 * - staff (veterinarian, reception): the modules and branches a manager grants them.
 * firestore.rules mirrors these checks; keep both in step.
 */

export const ROLE_LABELS: Record<UserRole, string> = {
  master:         'Master',
  admin:          'Administrador',
  branch_manager: 'Encargado de sucursal',
  veterinarian:   'Veterinario',
  reception:      'Recepción',
};

/** Every branch, billing, clinic profile. */
export function isClinicManager(role: UserRole | undefined): boolean {
  return role === 'master' || role === 'admin';
}

/** Every module without per-module permissions. */
export function hasFullModuleAccess(role: UserRole | undefined): boolean {
  return isClinicManager(role) || role === 'branch_manager';
}

/** Can open Admin and manage (part of) the team. */
export function canManageTeam(role: UserRole | undefined): boolean {
  return hasFullModuleAccess(role);
}

/** Roles a manager may hand out: a branch manager only grants staff roles. */
export function assignableRoles(role: UserRole | undefined): UserRole[] {
  if (isClinicManager(role)) return ['admin', 'branch_manager', 'veterinarian', 'reception'];
  if (role === 'branch_manager') return ['veterinarian', 'reception'];
  return [];
}

/** A user's branches as stored (none = the main branch). */
export function userBranchIds(branchIds: string[] | undefined): string[] {
  return branchIds?.length ? branchIds : [MAIN_BRANCH_ID];
}

/**
 * Whether `manager` may edit or remove `target`. Clinic managers reach everyone but
 * a master (only a master does); a branch manager reaches staff whose branches are
 * all inside theirs.
 */
export function canManageUser(
  manager: { role: UserRole; branchIds?: string[] },
  target: { role: UserRole; branchIds?: string[] },
): boolean {
  if (manager.role === 'master') return true;
  if (manager.role === 'admin') return target.role !== 'master';
  if (manager.role !== 'branch_manager') return false;
  if (target.role !== 'veterinarian' && target.role !== 'reception') return false;
  const mine = userBranchIds(manager.branchIds);
  return userBranchIds(target.branchIds).every((id) => mine.includes(id));
}
