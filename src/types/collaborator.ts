export type CollaboratorType = 'empleado' | 'freelance';
export type CollaboratorPaymentFrequency = 'semanal' | 'quincenal' | 'mensual';

export const COLLABORATOR_TYPES: Record<CollaboratorType, string> = {
  empleado:  'Empleado fijo',
  freelance: 'Freelance / Por services',
};

export const COLLABORATOR_PAYMENT_FREQUENCIES: Record<CollaboratorPaymentFrequency, string> = {
  semanal:   'Semanal',
  quincenal: 'Quincenal',
  mensual:   'Mensual',
};

export interface Collaborator {
  id: string;
  clinicaId: string;
  nombre: string;
  rol: string;           // free text: "Veterinario", "Recepcionista", etc.
  tipo: CollaboratorType;
  salario: number;
  frecuenciaPago: CollaboratorPaymentFrequency;
  nextPaymentDate: string;   // YYYY-MM-DD
  activo: boolean;
  telefono?: string;
  notas?: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface CollaboratorPayment {
  id: string;
  clinicaId: string;
  colaboradorId: string;
  monto: number;
  periodo: string;       // e.g. "Quincenal 1–15 Jul 2026"
  fechaPago: string;     // YYYY-MM-DD
  notas?: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

// Returns next payment date based on frequency
export function calculateNextCollaboratorPayment(
  desde: string,
  frecuencia: CollaboratorPaymentFrequency,
): string {
  const fecha = new Date(desde + 'T00:00:00');
  if (frecuencia === 'semanal') {
    fecha.setDate(fecha.getDate() + 7);
  } else if (frecuencia === 'quincenal') {
    fecha.setDate(fecha.getDate() + 15);
  } else {
    fecha.setMonth(fecha.getMonth() + 1);
  }
  return fecha.toISOString().slice(0, 10);
}

// Initial próximoPago: today or next occurrence based on frequency
export function initialPaymentDate(frecuencia: CollaboratorPaymentFrequency): string {
  const hoy = new Date();
  if (frecuencia === 'semanal') {
    // Next Monday
    const dia = hoy.getDay();
    const diasHasta = dia === 0 ? 1 : 8 - dia;
    hoy.setDate(hoy.getDate() + diasHasta);
  } else if (frecuencia === 'quincenal') {
    // Next 15th or 1st
    if (hoy.getDate() < 15) {
      hoy.setDate(15);
    } else {
      hoy.setMonth(hoy.getMonth() + 1, 1);
    }
  } else {
    // First of next month
    hoy.setMonth(hoy.getMonth() + 1, 1);
  }
  return hoy.toISOString().slice(0, 10);
}

export function daysUntilCollaboratorPayment(nextPaymentDate: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const pago = new Date(nextPaymentDate + 'T00:00:00');
  return Math.round((pago.getTime() - hoy.getTime()) / 86400000);
}
