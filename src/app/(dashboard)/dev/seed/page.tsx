'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { sembrarDatos, limpiarDatos } from '@/lib/dev/seed';
import { publishDemoSnapshot, getDemoConfig, type PublishResult, type DemoConfig } from '@/lib/demo/demo.snapshot';
import { syncService, type SyncAllProgress } from '@/lib/sync/sync.service';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Loader2, Sprout, Trash2, CheckCircle2, AlertCircle,
  Upload, RefreshCw, Clock, CloudUpload,
} from 'lucide-react';

function fmtTs(ts: number) {
  return new Date(ts).toLocaleString('es-NI', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

type Status = 'idle' | 'loading' | 'ok' | 'error';

export default function SeedPage() {
  const { session, loading } = useAuth();
  const router   = useRouter();
  const isMaster = session?.role === 'master';

  // ── clinicId diagnostic ─────────────────────────────────────────────────────
  const [dexieClinicId, setDexieClinicId] = useState<string | null>(null);

  useEffect(() => {
    if (!isMaster) return;
    import('@/lib/db/database').then(({ getClinicId }) => getClinicId().then(setDexieClinicId));
  }, [isMaster]);

  // ── local seed state ────────────────────────────────────────────────────────
  const [seedStatus,  setSeedStatus]  = useState<Status>('idle');
  const [seedMessage, setSeedMessage] = useState('');
  const [seedCounts,  setSeedCounts]  = useState<Record<string, number> | null>(null);

  // ── syncAll state ───────────────────────────────────────────────────────────
  const [syncStatus,   setSyncStatus]   = useState<Status>('idle');
  const [syncProgress, setSyncProgress] = useState<SyncAllProgress[]>([]);
  const [syncSummary,  setSyncSummary]  = useState<{ total: number; errors: number } | null>(null);
  const [syncError,    setSyncError]    = useState('');

  // ── demo publish state ──────────────────────────────────────────────────────
  const [publishStatus, setPublishStatus] = useState<Status>('idle');
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [publishError,  setPublishError]  = useState('');
  const [label,         setLabel]         = useState('');
  const [remoteConfig,  setRemoteConfig]  = useState<DemoConfig | null | undefined>(undefined);

  useEffect(() => {
    if (!loading && !isMaster) router.replace('/dashboard');
  }, [loading, isMaster, router]);

  useEffect(() => {
    if (!isMaster) return;
    getDemoConfig().then(setRemoteConfig);
  }, [isMaster]);

  if (loading || !isMaster) return null;

  // ── handlers ─────────────────────────────────────────────────────────────────

  async function handleSeed() {
    if (!session?.clinicId) { setSeedStatus('error'); setSeedMessage('No hay sesión activa.'); return; }
    setSeedStatus('loading');
    setSeedCounts(null);
    try {
      const result = await sembrarDatos(session.clinicId);
      setSeedMessage(result.mensaje);
      setSeedCounts(result.conteos);
      setSeedStatus('ok');
    } catch (e) {
      setSeedMessage((e as Error).message ?? 'Error desconocido');
      setSeedStatus('error');
    }
  }

  async function handleClear() {
    if (!confirm('¿Limpiar TODOS los datos locales? Esta acción no se puede deshacer.')) return;
    setSeedStatus('loading');
    setSeedCounts(null);
    try {
      await limpiarDatos();
      setSeedMessage('Base de datos local limpiada.');
      setSeedStatus('ok');
    } catch (e) {
      setSeedMessage((e as Error).message ?? 'Error desconocido');
      setSeedStatus('error');
    }
  }

  async function handleSyncAll() {
    setSyncStatus('loading');
    setSyncProgress([]);
    setSyncSummary(null);
    setSyncError('');
    try {
      const result = await syncService.syncAll((p) => {
        setSyncProgress((prev) => {
          const idx = prev.findIndex((x) => x.collection === p.collection);
          if (idx >= 0) { const next = [...prev]; next[idx] = p; return next; }
          return [...prev, p];
        });
      });
      setSyncSummary({ total: result.total, errors: result.errores });
      setSyncStatus(result.errores > 0 ? 'error' : 'ok');
    } catch (e) {
      setSyncError((e as Error).message ?? 'Error desconocido');
      setSyncStatus('error');
    }
  }

  async function handlePublishDemo() {
    if (!session?.clinicId) { setPublishError('No hay sesión activa.'); return; }
    const version = String(Date.now());
    setPublishStatus('loading');
    setPublishResult(null);
    setPublishError('');
    try {
      const result = await publishDemoSnapshot(version, label.trim() || version, session.clinicId);
      setPublishResult(result);
      setPublishStatus('ok');
      setLabel('');
      getDemoConfig().then(setRemoteConfig);
    } catch (e) {
      setPublishError((e as Error).message ?? 'Error desconocido');
      setPublishStatus('error');
    }
  }

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Datos de prueba</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Siembra datos locales, sincroniza con Firebase y publica snapshots de demo.
        </p>
      </div>

      {/* ── clinicId diagnostic ─────────────────────────────────────────────── */}
      <div className={cn(
        'rounded-xl border p-3 text-xs font-mono space-y-1',
        dexieClinicId === session?.clinicId
          ? 'border-green-200 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'
          : 'border-red-200 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400',
      )}>
        <div className="flex gap-3">
          <span className="text-muted-foreground w-28 shrink-0">Dexie clinicId</span>
          <span className="font-semibold">{dexieClinicId ?? '…'}</span>
        </div>
        <div className="flex gap-3">
          <span className="text-muted-foreground w-28 shrink-0">Session clinicId</span>
          <span className="font-semibold">{session?.clinicId ?? '…'}</span>
        </div>
        {dexieClinicId !== null && session?.clinicId && dexieClinicId !== session.clinicId && (
          <p className="mt-1 font-sans font-medium">
            ⚠ clinicId mismatch — el seed escribirá con Dexie ({dexieClinicId}) pero el publish leerá con Session ({session.clinicId}). Recarga la página o vuelve a iniciar sesión.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-300">
        <p className="font-semibold mb-1">Flujo de trabajo</p>
        <ol className="list-decimal list-inside space-y-0.5 opacity-90">
          <li><strong>Sembrar</strong> — llena IndexedDB local</li>
          <li><strong>Sync → Firebase</strong> — empuja a <code className="bg-amber-200/50 rounded px-1">clinics/{session?.clinicId}/</code></li>
          <li><strong>Publicar demo</strong> — copia a <code className="bg-amber-200/50 rounded px-1">clinics/demo/</code></li>
        </ol>
      </div>

      {/* ── 1. Local seed ───────────────────────────────────────────────────── */}
      <Section label="1 · Datos locales (IndexedDB)">
        <p className="text-xs text-muted-foreground">
          Crea 8 dueños, 12 pacientes, consultas, citas, 18 productos y 30 pagos del mes.
          El seed <strong>solo escribe en Dexie</strong> — usa el paso 2 para subir a Firebase.
        </p>
        <div className="flex gap-3">
          <Button onClick={handleSeed} disabled={seedStatus === 'loading'} className="gap-2 flex-1">
            {seedStatus === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Sprout size={14} />}
            Sembrar datos
          </Button>
          <Button onClick={handleClear} variant="outline" disabled={seedStatus === 'loading'}
            className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/5">
            <Trash2 size={14} /> Limpiar todo
          </Button>
        </div>
        <StatusBox status={seedStatus} message={seedMessage} counts={seedCounts} />
      </Section>

      {/* ── 2. Sync to Firebase ─────────────────────────────────────────────── */}
      <Section label="2 · Sync → Firebase (master account)">
        <p className="text-xs text-muted-foreground">
          Empuja <strong>todos</strong> los registros de Dexie a{' '}
          <code className="bg-muted rounded px-1">clinics/{session?.clinicId}/</code> en Firestore.
          Los datos creados desde la UI se sincronizan solos; este botón sirve para los datos sembrados manualmente.
        </p>
        <Button onClick={handleSyncAll} disabled={syncStatus === 'loading'} variant="outline" className="w-full gap-2">
          {syncStatus === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
          Sync todo a Firebase
        </Button>

        {/* Progress table */}
        {syncProgress.length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden text-xs">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">Colección</th>
                  <th className="text-right px-3 py-1.5 text-muted-foreground font-medium">Enviados</th>
                  <th className="text-right px-3 py-1.5 text-muted-foreground font-medium">Total</th>
                  <th className="text-right px-3 py-1.5 text-muted-foreground font-medium">Errores</th>
                </tr>
              </thead>
              <tbody>
                {syncProgress.map((p) => (
                  <tr key={p.collection} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono">{p.collection}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{p.enviados}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{p.total}</td>
                    <td className={cn('px-3 py-1.5 text-right tabular-nums', p.errores > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      {p.errores}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {syncStatus === 'ok' && syncSummary && (
          <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-3 flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle2 size={15} />
            <span className="text-sm font-medium">{syncSummary.total} documentos sincronizados con Firebase</span>
          </div>
        )}
        {syncStatus === 'error' && syncSummary && syncSummary.errors > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3 flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle size={15} className="shrink-0" />
            <span className="text-sm">{syncSummary.errors} errores al sincronizar — revisa la consola.</span>
          </div>
        )}
        {syncStatus === 'error' && syncError && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3 flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle size={15} className="shrink-0" />
            <span className="text-sm">{syncError}</span>
          </div>
        )}
      </Section>

      {/* ── 3. Demo snapshot publisher ───────────────────────────────────────── */}
      <Section label="3 · Publicar snapshot de demo">
        {process.env.NEXT_PUBLIC_FIRESTORE_DIRECT === 'true' ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
            <span className="font-semibold">FIRESTORE_DIRECT=true</span> — leyendo de{' '}
            <code className="bg-blue-200/50 dark:bg-blue-900/50 rounded px-1">clinics/{session?.clinicId}/</code>{' '}
            en Firestore (bypassing Dexie).
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Lee Dexie de <code className="bg-muted rounded px-1">{session?.clinicId}</code>, reemplaza el clinicId
            por <code className="bg-muted rounded px-1">demo</code> y escribe en{' '}
            <code className="bg-muted rounded px-1">clinics/demo/</code> en Firestore.
            Los usuarios demo lo descargarán en su próxima visita.
          </p>
        )}

        {/* Current + previous version */}
        {remoteConfig !== undefined && (
          <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2 text-xs">
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground shrink-0 w-14">Actual</span>
              {remoteConfig ? (
                <div className="min-w-0">
                  <span className="font-mono font-medium text-foreground">{remoteConfig.version}</span>
                  <span className="text-muted-foreground ml-1.5">· {fmtTs(Number(remoteConfig.version))}</span>
                  {remoteConfig.label && remoteConfig.label !== remoteConfig.version && (
                    <p className="text-muted-foreground mt-0.5 italic truncate">{remoteConfig.label}</p>
                  )}
                </div>
              ) : (
                <span className="italic text-muted-foreground">ninguna publicada</span>
              )}
            </div>
            {remoteConfig?.previousVersion && (
              <div className="flex items-start gap-2 opacity-55">
                <span className="text-muted-foreground shrink-0 w-14">Anterior</span>
                <div className="min-w-0">
                  <span className="font-mono">{remoteConfig.previousVersion}</span>
                  <span className="text-muted-foreground ml-1.5">· {fmtTs(Number(remoteConfig.previousVersion))}</span>
                  {remoteConfig.previousLabel && remoteConfig.previousLabel !== remoteConfig.previousVersion && (
                    <p className="italic mt-0.5 truncate">{remoteConfig.previousLabel}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-medium">
            Descripción <span className="text-muted-foreground font-normal">(opcional)</span>
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ej. Julio 2026 — módulo de ventas"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-[11px] text-muted-foreground">
            La versión se genera como <code className="bg-muted rounded px-1">Date.now()</code> — único por milisegundo.
          </p>
        </div>

        <Button onClick={handlePublishDemo} disabled={publishStatus === 'loading'} className="w-full gap-2">
          {publishStatus === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Publicar snapshot de demo
        </Button>

        {publishStatus === 'ok' && publishResult && (
          <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 size={16} />
              <span className="font-medium text-sm">
                Snapshot publicado
                {publishResult.label && publishResult.label !== publishResult.version && (
                  <> · <em>{publishResult.label}</em></>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
              <Clock size={11} />
              <span className="font-mono">{publishResult.version}</span>
              <span className="opacity-70">· {fmtTs(Number(publishResult.version))}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(publishResult.counts).map(([key, val]) => (
                <div key={key} className="flex justify-between rounded-lg bg-white/60 dark:bg-white/5 px-3 py-2">
                  <span className="text-xs text-muted-foreground capitalize">{key}</span>
                  <span className="text-xs font-semibold">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {publishStatus === 'error' && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-4 flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle size={16} className="shrink-0" />
            <p className="text-sm">{publishError}</p>
          </div>
        )}
      </Section>

      <button type="button" onClick={() => getDemoConfig().then(setRemoteConfig)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <RefreshCw size={11} /> Actualizar info publicada
      </button>
    </div>
  );
}

// ── Small layout helpers ──────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
      <p className="font-semibold text-sm">{label}</p>
      {children}
    </div>
  );
}

function StatusBox({
  status, message, counts,
}: { status: Status; message: string; counts: Record<string, number> | null }) {
  if (status === 'ok') return (
    <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-4 space-y-3">
      <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
        <CheckCircle2 size={16} />
        <span className="font-medium text-sm">{message}</span>
      </div>
      {counts && (
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(counts).map(([key, val]) => (
            <div key={key} className="flex justify-between rounded-lg bg-white/60 dark:bg-white/5 px-3 py-2">
              <span className="text-xs text-muted-foreground capitalize">{key}</span>
              <span className="text-xs font-semibold">{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  if (status === 'error') return (
    <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-4 flex items-center gap-2 text-red-700 dark:text-red-400">
      <AlertCircle size={16} className="shrink-0" />
      <p className="text-sm">{message}</p>
    </div>
  );
  return null;
}
