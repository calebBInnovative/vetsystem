import type { SyncMeta } from './paciente';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type CategoriaServicio =
  | 'consulta'
  | 'vacunacion'
  | 'cirugia'
  | 'desparasitacion'
  | 'estetica'
  | 'laboratorio'
  | 'emergencia'
  | 'otro';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Servicio {
  id: string;
  nombre: string;
  descripcion?: string;
  categoria: CategoriaServicio;
  precio: number;
  activo: boolean;
  clinicaId: string;
  creadoEn: number;
}

export interface ServicioLocal extends Servicio, SyncMeta {}

// ─── Constantes de UI ─────────────────────────────────────────────────────────

export const CATEGORIAS_SERVICIO: Record<CategoriaServicio, { label: string; emoji: string; color: string }> = {
  consulta:       { label: 'Consulta',      emoji: '🩺', color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'     },
  vacunacion:     { label: 'Vacunación',    emoji: '💉', color: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800' },
  cirugia:        { label: 'Cirugía',       emoji: '🔬', color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'           },
  desparasitacion:{ label: 'Desparasit.',   emoji: '🐛', color: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800' },
  estetica:       { label: 'Estética',      emoji: '✂️', color: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800' },
  laboratorio:    { label: 'Laboratorio',   emoji: '🧪', color: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800' },
  emergencia:     { label: 'Emergencia',    emoji: '🚨', color: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800' },
  otro:           { label: 'Otro',          emoji: '💊', color: 'bg-muted text-muted-foreground border-border'                                                               },
};
