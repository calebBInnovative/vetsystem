import type { SyncProvider, RemoteDoc } from '@/lib/sync/sync.provider';

/**
 * Provider no-op: no sincroniza a ningún backend.
 * Útil en desarrollo sin conexión a Firebase o en tests.
 */
export class LocalSyncProvider implements SyncProvider {
  readonly name = 'local';

  async push(_collection: string, _id: string, _data: object): Promise<void> {}

  async pull(_collection: string, _desde: number): Promise<RemoteDoc[]> {
    return [];
  }
}
