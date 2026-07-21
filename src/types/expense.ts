export type ExpenseCategory = 'rent' | 'services' | 'payroll' | 'insurance' | 'maintenance' | 'other';
export type ExpenseFrequency = 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual';
export type AlertLevel = 'overdue' | 'urgent' | 'upcoming' | 'ok';

export interface FixedExpense {
  id: string;
  clinicId: string;
  name: string;
  amount: number;
  category: ExpenseCategory;
  frequency: ExpenseFrequency;
  paymentDay: number; // 1–28
  nextDueDate: string; // YYYY-MM-DD
  active: boolean;
  syncStatus: 'synced' | 'pending' | 'conflict';
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface ExpensePayment {
  id: string;
  clinicId: string;
  fixedExpenseId: string;
  amount: number;
  paymentDate: string; // YYYY-MM-DD
  notes?: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

// Helper: days until due (negative = overdue)
export function daysUntilDue(nextDueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(nextDueDate + 'T00:00:00');
  return Math.round((dueDate.getTime() - today.getTime()) / 86400000);
}

export function alertLevel(nextDueDate: string): AlertLevel {
  const days = daysUntilDue(nextDueDate);
  if (days < 0) return 'overdue';
  if (days <= 3) return 'urgent';
  if (days <= 7) return 'upcoming';
  return 'ok';
}

export function calculateNextDueDate(
  baseDate: string,
  frequency: ExpenseFrequency,
  paymentDay: number,
): string {
  const months: Record<ExpenseFrequency, number> = {
    monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12,
  };
  const date = new Date(baseDate + 'T00:00:00');
  date.setMonth(date.getMonth() + months[frequency]);
  // Clamp to last day of the resulting month
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(paymentDay, lastDay));
  return date.toISOString().slice(0, 10);
}

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, string> = {
  rent:         'Renta',
  services:     'Servicios',
  payroll:      'Nómina',
  insurance:    'Seguros',
  maintenance:  'Mantenimiento',
  other:        'Otros',
};

export const EXPENSE_FREQUENCIES: Record<ExpenseFrequency, string> = {
  monthly:    'Mensual',
  bimonthly:  'Bimestral',
  quarterly:  'Trimestral',
  semiannual: 'Semestral',
  annual:     'Anual',
};
