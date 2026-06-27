import type { SyncProvider, RemoteDoc } from '@/lib/sync/sync.provider';

/**
 * Provider no-op: no sincroniza a ningún backend.
 * Útil en desarrollo sin conexión a Firebase o en tests.
 */
export class LocalSyncProvider implements SyncProvider {
  readonly nombre = 'local';

  async push(_coleccion: string, _id: string, _datos: object): Promise<void> {}

  async pull(_coleccion: string, _desde: number): Promise<RemoteDoc[]> {
    return [];
  }
}
