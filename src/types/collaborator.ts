export type CollaboratorType = 'employee' | 'freelance';
export type CollaboratorPaymentFrequency = 'weekly' | 'biweekly' | 'monthly';

export const COLLABORATOR_TYPES: Record<CollaboratorType, string> = {
  employee:  'Empleado fijo',
  freelance: 'Freelance / Por services',
};

export const COLLABORATOR_PAYMENT_FREQUENCIES: Record<CollaboratorPaymentFrequency, string> = {
  weekly:    'Semanal',
  biweekly:  'Quincenal',
  monthly:   'Mensual',
};

export interface Collaborator {
  id: string;
  clinicId: string;
  name: string;
  role: string;           // free text: "Veterinario", "Recepcionista", etc.
  type: CollaboratorType;
  salary: number;
  paymentFrequency: CollaboratorPaymentFrequency;
  nextPaymentDate: string;   // YYYY-MM-DD
  active: boolean;
  phone?: string;
  notes?: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface CollaboratorPayment {
  id: string;
  clinicId: string;
  collaboratorId: string;
  amount: number;
  period: string;       // e.g. "Quincenal 1–15 Jul 2026"
  paymentDate: string;  // YYYY-MM-DD
  notes?: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

// Returns next payment date based on frequency
export function calculateNextCollaboratorPayment(
  from: string,
  frequency: CollaboratorPaymentFrequency,
): string {
  const date = new Date(from + 'T00:00:00');
  if (frequency === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (frequency === 'biweekly') {
    date.setDate(date.getDate() + 15);
  } else {
    date.setMonth(date.getMonth() + 1);
  }
  return date.toISOString().slice(0, 10);
}

// Initial next payment date: today or next occurrence based on frequency
export function initialPaymentDate(frequency: CollaboratorPaymentFrequency): string {
  const today = new Date();
  if (frequency === 'weekly') {
    // Next Monday
    const day = today.getDay();
    const daysUntil = day === 0 ? 1 : 8 - day;
    today.setDate(today.getDate() + daysUntil);
  } else if (frequency === 'biweekly') {
    // Next 15th or 1st
    if (today.getDate() < 15) {
      today.setDate(15);
    } else {
      today.setMonth(today.getMonth() + 1, 1);
    }
  } else {
    // First of next month
    today.setMonth(today.getMonth() + 1, 1);
  }
  return today.toISOString().slice(0, 10);
}

export function daysUntilCollaboratorPayment(nextPaymentDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const paymentDate = new Date(nextPaymentDate + 'T00:00:00');
  return Math.round((paymentDate.getTime() - today.getTime()) / 86400000);
}
