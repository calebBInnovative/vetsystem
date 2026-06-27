/**
 * Contrato que debe implementar cualquier backend de sincronización.
 *
 * Para agregar un nuevo backend (Supabase, PocketBase, etc.):
 *   1. Crear src/lib/sync/providers/[nombre].provider.ts implementando esta interfaz
 *   2. Cambiar la exportación en sync.config.ts
 *   No se modifica nada más en la app.
 */
export interface RemoteDoc {
  id: string;
  updatedAt: number;
  deletedAt?: number;
  [key: string]: unknown;
}

export interface SyncProvider {
  /**
   * Escribe o actualiza un documento en el backend.
   * Si el documento ya existe, se hace merge (no sobreescribe campos no incluidos).
   */
  push(coleccion: string, id: string, datos: object): Promise<void>;

  /**
   * Trae documentos de una colección modificados después de `desde` (timestamp ms).
   * Retorna array vacío si no hay cambios.
   */
  pull(coleccion: string, desde: number): Promise<RemoteDoc[]>;

  /**
   * Suscripción en tiempo real (opcional).
   * Retorna una función para cancelar la suscripción.
   */
  subscribe?(
    coleccion: string,
    clinicaId: string,
    onChange: (docs: RemoteDoc[]) => void,
  ): () => void;

  /** Nombre del provider — útil para logs */
  readonly nombre: string;
}
