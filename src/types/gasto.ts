export type CategoriaGasto = 'renta' | 'servicios' | 'nomina' | 'seguros' | 'mantenimiento' | 'otros';
export type FrecuenciaGasto = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';
export type NivelAlerta = 'vencido' | 'urgente' | 'proximo' | 'normal';

export interface GastoFijo {
  id: string;
  clinicaId: string;
  nombre: string;
  monto: number;
  categoria: CategoriaGasto;
  frecuencia: FrecuenciaGasto;
  diaPago: number; // 1–28
  proximoVencimiento: string; // YYYY-MM-DD
  activo: boolean;
  syncStatus: 'synced' | 'pending' | 'conflict';
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface PagoGasto {
  id: string;
  clinicaId: string;
  gastoFijoId: string;
  monto: number;
  fechaPago: string; // YYYY-MM-DD
  notas?: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  createdAt: number;
  updatedAt: number;
}

// Helper: days until due (negative = overdue)
export function diasHastaVencimiento(proximoVencimiento: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(proximoVencimiento + 'T00:00:00');
  return Math.round((venc.getTime() - hoy.getTime()) / 86400000);
}

export function nivelAlerta(proximoVencimiento: string): NivelAlerta {
  const dias = diasHastaVencimiento(proximoVencimiento);
  if (dias < 0) return 'vencido';
  if (dias <= 3) return 'urgente';
  if (dias <= 7) return 'proximo';
  return 'normal';
}

export function calcularProximoVencimiento(
  fechaBase: string,
  frecuencia: FrecuenciaGasto,
  diaPago: number,
): string {
  const meses: Record<FrecuenciaGasto, number> = {
    mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12,
  };
  const fecha = new Date(fechaBase + 'T00:00:00');
  fecha.setMonth(fecha.getMonth() + meses[frecuencia]);
  // Clamp to last day of the resulting month
  const ultimoDia = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
  fecha.setDate(Math.min(diaPago, ultimoDia));
  return fecha.toISOString().slice(0, 10);
}

export const CATEGORIAS_GASTO: Record<CategoriaGasto, string> = {
  renta:          'Renta',
  servicios:      'Servicios',
  nomina:         'Nómina',
  seguros:        'Seguros',
  mantenimiento:  'Mantenimiento',
  otros:          'Otros',
};

export const FRECUENCIAS_GASTO: Record<FrecuenciaGasto, string> = {
  mensual:    'Mensual',
  bimestral:  'Bimestral',
  trimestral: 'Trimestral',
  semestral:  'Semestral',
  anual:      'Anual',
};
