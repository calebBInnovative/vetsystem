export type ExpenseCategory = 'renta' | 'services' | 'nomina' | 'seguros' | 'mantenimiento' | 'otros';
export type ExpenseFrequency = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';
export type AlertLevel = 'vencido' | 'urgente' | 'proximo' | 'normal';

export interface FixedExpense {
  id: string;
  clinicaId: string;
  nombre: string;
  monto: number;
  categoria: ExpenseCategory;
  frecuencia: ExpenseFrequency;
  diaPago: number; // 1–28
  nextDueDate: string; // YYYY-MM-DD
  activo: boolean;
  syncStatus: 'synced' | 'pending' | 'conflict';
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface ExpensePayment {
  id: string;
  clinicaId: string;
  gastoFijoId: string;
  monto: number;
  fechaPago: string; // YYYY-MM-DD
  notas?: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

// Helper: days until due (negative = overdue)
export function daysUntilDue(nextDueDate: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(nextDueDate + 'T00:00:00');
  return Math.round((venc.getTime() - hoy.getTime()) / 86400000);
}

export function alertLevel(nextDueDate: string): AlertLevel {
  const dias = daysUntilDue(nextDueDate);
  if (dias < 0) return 'vencido';
  if (dias <= 3) return 'urgente';
  if (dias <= 7) return 'proximo';
  return 'normal';
}

export function calculateNextDueDate(
  fechaBase: string,
  frecuencia: ExpenseFrequency,
  diaPago: number,
): string {
  const meses: Record<ExpenseFrequency, number> = {
    mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12,
  };
  const fecha = new Date(fechaBase + 'T00:00:00');
  fecha.setMonth(fecha.getMonth() + meses[frecuencia]);
  // Clamp to last day of the resulting month
  const ultimoDia = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
  fecha.setDate(Math.min(diaPago, ultimoDia));
  return fecha.toISOString().slice(0, 10);
}

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, string> = {
  renta:          'Renta',
  services:      'Servicios',
  nomina:         'Nómina',
  seguros:        'Seguros',
  mantenimiento:  'Mantenimiento',
  otros:          'Otros',
};

export const EXPENSE_FREQUENCIES: Record<ExpenseFrequency, string> = {
  mensual:    'Mensual',
  bimestral:  'Bimestral',
  trimestral: 'Trimestral',
  semestral:  'Semestral',
  anual:      'Anual',
};
