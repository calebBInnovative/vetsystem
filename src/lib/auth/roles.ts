import type { ActionPermissions, SensitiveAction, UserRole } from '@/types/license';
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

export const ACTION_LABELS: Record<SensitiveAction, { label: string; hint: string }> = {
  voidDocuments: { label: 'Anular ventas y facturas', hint: 'También anular cotizaciones y pagos.' },
  giveDiscounts: { label: 'Dar descuentos',           hint: 'Descuentos manuales al cobrar. Las promociones siempre aplican.' },
  viewCosts:     { label: 'Ver costos y ganancias',   hint: 'Precio de compra de los productos y utilidad en los reportes.' },
  adjustStock:   { label: 'Ajustar y trasladar stock', hint: 'Corregir existencias a mano y enviar productos a otra sucursal.' },
};

/** What a new staff member may do until a manager says otherwise. */
export const DEFAULT_STAFF_ACTIONS: Required<ActionPermissions> = {
  voidDocuments: false, giveDiscounts: true, viewCosts: false, adjustStock: false,
};

/**
 * Whether this session may perform a sensitive action. Managers always may;
 * staff profiles saved before actions existed keep doing everything, as they did.
 */
export function canDo(
  session: { role: UserRole; actions?: ActionPermissions } | null | undefined,
  action: SensitiveAction,
): boolean {
  if (!session) return false;
  if (hasFullModuleAccess(session.role)) return true;
  if (!session.actions) return true;
  return session.actions[action] === true;
}
