export type ExpenseCategory = 'rent' | 'services' | 'payroll' | 'insurance' | 'maintenance' | 'supplies' | 'equipment' | 'marketing' | 'other';
export type ExpenseFrequency = 'daily' | 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual';
export type AlertLevel = 'overdue' | 'urgent' | 'upcoming' | 'ok';
export type ExpenseType = 'recurring' | 'one_time' | 'daily';

export interface FixedExpense {
  id: string;
  clinicId: string;
  name: string;
  amount: number;
  category: ExpenseCategory;
  // recurring-only fields (ignored for one_time)
  frequency: ExpenseFrequency;
  paymentDay: number;       // 1–28
  nextDueDate: string;      // YYYY-MM-DD — for one_time this is the expense date
  active: boolean;          // for one_time: true=pending, false=done
  expenseType?: ExpenseType; // undefined = 'recurring' (backwards compat)
  notes?: string;           // one_time: description/notes
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
  const date = new Date(baseDate + 'T00:00:00');
  if (frequency === 'daily') {
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }
  const months: Record<Exclude<ExpenseFrequency, 'daily'>, number> = {
    monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12,
  };
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
  supplies:     'Insumos',
  equipment:    'Equipos',
  marketing:    'Marketing',
  other:        'Otros',
};

export const EXPENSE_FREQUENCIES: Record<ExpenseFrequency, string> = {
  daily:      'Diario',
  monthly:    'Mensual',
  bimonthly:  'Bimestral',
  quarterly:  'Trimestral',
  semiannual: 'Semestral',
  annual:     'Anual',
};
