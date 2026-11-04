'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { sembrarDatos, limpiarDatos } from '@/lib/dev/seed';
import { getClinicId } from '@/lib/db/database';
import { syncService, type SyncAllProgress } from '@/lib/sync/sync.service';
import { configurarLicencia, actualizarPerfilClinica } from '@/lib/auth/auth.service';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { PLAN_MODULE_LABELS, planLabel, sessionLimits } from '@/lib/billing/plans';
import { useBillingConfig } from '@/hooks/useBillingConfig';
import { ManualPaymentPanel } from '@/components/billing/ManualPaymentPanel';
import { EnableRemindersButton } from '@/components/billing/EnableRemindersButton';
import { formatMoney, subscribeClinicInvoices, type SubscriptionInvoice } from '@/lib/billing/manual-payments';
import { isPlatformOwner } from '@/lib/usage/usage.service';
import { Button } from '@/components/ui/button';
import {
  Loader2, Sprout, Trash2, CheckCircle2, AlertCircle,
  CloudUpload, RefreshCw, Database, Wifi, WifiOff, AlertTriangle,
  ShieldAlert, Phone,
  BookOpen, ChevronRight, Activity, CreditCard, BellRing, Landmark, Layers, Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BranchesCard } from '@/components/admin/BranchesCard';
import { TeamTab } from '@/components/admin/TeamTab';
import { canManageTeam, isClinicManager } from '@/lib/auth/roles';

type Accion = 'idle' | 'loading' | 'ok' | 'error';

interface QueueEstado {
  pendientes: number;
  conError:   number;
}

const ENV         = process.env.NODE_ENV;
const PROYECTO_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '—';
const ES_PROD     = PROYECTO_ID && !PROYECTO_ID.startsWith('REEMPLAZAR');

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const esMaster = session?.role === 'master';
  const esAdmin  = isClinicManager(session?.role);
  // A branch manager gets their team and their branch, never the plan or the clinic.
  const branchManager = session?.role === 'branch_manager';

  type TabKey = 'clinica' | 'sucursal' | 'usuarios' | 'plan' | 'datos' | 'firebase' | 'estado';
  const [tab, setTab] = useState<TabKey>(branchManager ? 'usuarios' : 'clinica');

  useEffect(() => {
    if (!loading && !canManageTeam(session?.role)) router.replace('/dashboard');
  }, [loading, session?.role, router]);

  if (loading) return null;
  if (!canManageTeam(session?.role)) return null;

  const tabs: { key: TabKey; label: string }[] = branchManager ? [
    { key: 'usuarios',  label: 'Equipo'         },
    { key: 'sucursal',  label: 'Sucursal'       },
  ] : [
    { key: 'clinica',   label: 'Clínica'        },
    { key: 'usuarios',  label: 'Equipo'         },
    { key: 'plan',      label: 'Plan'           },
    ...(esMaster ? [
      { key: 'datos'    as TabKey, label: 'Datos locales' },
      { key: 'firebase' as TabKey, label: 'Firebase sync' },
      { key: 'estado'   as TabKey, label: 'Estado DB'     },
    ] : []),
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {esMaster ? 'Panel master' : 'Administración'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {esMaster
              ? 'Gestión completa: usuarios, plan, datos, sync y estado de la DB'
              : branchManager
                ? 'Gestiona el equipo y los datos de tu sucursal'
                : 'Gestiona tu equipo, tus sucursales y la suscripción de tu clínica'}
          </p>
        </div>
        {esMaster && <EnvBadge />}
      </div>

      {/* ?tab=plan — links from the expiry alerts and the push reminder */}
      <Suspense fallback={null}>
        <TabFromQuery valid={tabs.map((t) => t.key)} onTab={setTab} />
      </Suspense>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {esAdmin && tab === 'clinica'  && <TabClinica />}
      {branchManager && tab === 'sucursal' && <BranchesCard />}
      {tab === 'usuarios' && <TeamTab />}
      {esAdmin && tab === 'plan'     && <TabPlan />}
      {esMaster && tab === 'datos'    && <TabDatos />}
      {esMaster && tab === 'firebase' && <TabFirebase />}
      {esMaster && tab === 'estado'   && <TabEstado />}

      {esMaster && (
        <button
          onClick={() => router.push('/admin/catalog')}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <BookOpen size={16} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Catálogo de proveedores</p>
            <p className="text-xs text-muted-foreground">Agrega y gestiona productos públicos que las clínicas pueden importar</p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground shrink-0" />
        </button>
      )}
    </div>
  );
}

// ─── Badge de entorno ─────────────────────────────────────────────────────────

function EnvBadge() {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={cn(
        'text-xs font-mono px-2.5 py-1 rounded-full font-semibold',
        ENV === 'development'
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
          : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
      )}>
        {ENV === 'development' ? '⚙ DEV' : '🚀 PROD'}
      </span>
      <span className="text-[10px] text-muted-foreground font-mono">{PROYECTO_ID}</span>
    </div>
  );
}

// ─── Deep link to a tab ───────────────────────────────────────────────────────
// Reacts to the query string, so a link to ?tab=plan also works when /admin is
// already open (the page does not remount on a same-route navigation).

function TabFromQuery<T extends string>({ valid, onTab }: { valid: T[]; onTab: (tab: T) => void }) {
  const requested = useSearchParams().get('tab');
  const match = valid.find((t) => t === requested);
  useEffect(() => {
    if (match) onTab(match);
  }, [match, onTab]);
  return null;
}

// ─── Tab: Clínica (admin + master) ───────────────────────────────────────────

// ── Validación teléfono nicaragüense ──────────────────────────────────────────
function validarTel(tel: string): boolean {
  const d = tel.replace(/[\s\-\+]/g, '');
  if (d.startsWith('505')) return /^505\d{8}$/.test(d);
  return /^\d{8}$/.test(d);
}
function formatearTel(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  return d.length <= 4 ? d : `${d.slice(0, 4)}-${d.slice(4)}`;
}

function TabClinica() {
  const { session, refreshFromDexie } = useAuth();
  const clinicId = session?.clinicId ?? process.env.NEXT_PUBLIC_CLINIC_ID ?? 'house-of-pets';

  const [nombre,   setNombre]   = useState(session?.clinicName ?? '');
  const [telefono, setTelefono] = useState(session?.clinicTel  ?? '');
  const [telError, setTelError] = useState('');
  const [accion,   setAccion]   = useState<Accion>('idle');

  function handleTelChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setTelefono(raw.startsWith('+') ? raw : formatearTel(raw));
    setTelError('');
    setAccion('idle');
  }

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    if (telefono.trim() && !validarTel(telefono)) {
      setTelError('Número inválido. Usa formato 8163-0097 o +50581630097.');
      return;
    }
    setAccion('loading');
    try {
      await actualizarPerfilClinica(clinicId, {
        name:  nombre.trim(),
        phone: telefono.trim() || undefined,
      });
      await refreshFromDexie();
      setAccion('ok');
    } catch { setAccion('error'); }
  }

  return (
    <div className="space-y-5">
      <Card titulo="Perfil de la clínica" desc="Nombre e información de contacto que aparece en los recibos.">
        <form onSubmit={handleGuardar} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Nombre de la clínica</label>
            <input
              required
              value={nombre}
              onChange={(e) => { setNombre(e.target.value); setAccion('idle'); }}
              placeholder="Pet's House"
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Teléfono de contacto</label>
            <div className="relative">
              <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="tel"
                inputMode="tel"
                value={telefono}
                onChange={handleTelChange}
                onBlur={() => {
                  if (telefono && !validarTel(telefono)) setTelError('Número inválido.');
                }}
                placeholder="8163-0097"
                className={cn(
                  'w-full rounded-xl border bg-background pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2',
                  telError
                    ? 'border-destructive focus:ring-destructive/40'
                    : 'border-input focus:ring-ring',
                )}
              />
            </div>
            {telError
              ? <p className="text-xs text-destructive">{telError}</p>
              : <p className="text-xs text-muted-foreground">Formato: 8163-0097 · Se muestra en los recibos de impresión.</p>
            }
          </div>
          <Button type="submit" variant="outline" disabled={accion === 'loading'} className="gap-2">
            {accion === 'loading' && <Loader2 size={13} className="animate-spin" />}
            Guardar cambios
          </Button>
          {accion === 'ok' && (
            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckCircle2 size={12} /> Guardado correctamente.
            </p>
          )}
          {accion === 'error' && (
            <p className="text-xs text-destructive">Error al guardar. ¿Tienes conexión?</p>
          )}
        </form>
      </Card>

      <BranchesCard />
    </div>
  );
}

// ─── Tab: Plan (admin + master) ──────────────────────────────────────────────

function TabPlan() {
  const router = useRouter();
  const { session, license } = useAuth();
  const { startCheckout, loading: checkoutLoading } = useSubscription();
  const billingConfig = useBillingConfig();
  const platformOwner = isPlatformOwner(session?.email);

  // This clinic's manual payment reports, live
  const [clinicInvoices, setClinicInvoices] = useState<SubscriptionInvoice[]>([]);
  const invoicesClinicId = session?.isDemo ? null : session?.clinicId;
  useEffect(() => {
    if (!invoicesClinicId) return;
    return subscribeClinicInvoices(invoicesClinicId, setClinicInvoices);
  }, [invoicesClinicId]);
  const clinicId = session?.clinicId ?? '';

  const days    = license.daysUntilExpiry;
  const expired = session?.subscription === false || (days !== null && days < 0);
  const isTrial = session?.plan === 'Trial';
  const limits  = sessionLimits(session);

  // State for the platform owner's license editor
  const [lic, setLic] = useState({
    clinicId,
    clinicName:     session?.clinicName     ?? '',
    plan:           session?.plan           ?? 'monthly',
    expirationDate: session?.expirationDate ?? '',
    subscription:   session?.subscription  ?? true,
  });
  const [accionLic, setAccionLic] = useState<Accion>('idle');

  async function handleGuardarLicencia(e: React.FormEvent) {
    e.preventDefault();
    setAccionLic('loading');
    try {
      await configurarLicencia({ ...lic, clinicId: lic.clinicId.trim() });
      setAccionLic('ok');
    } catch { setAccionLic('error'); }
  }

  const estado = expired
    ? { label: 'Vencida', dot: 'bg-red-500',   text: 'text-red-600 dark:text-red-400' }
    : isTrial
      ? { label: 'Prueba gratis', dot: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' }
      : { label: 'Activa', dot: 'bg-green-500', text: 'text-green-600 dark:text-green-400' };

  return (
    <div className="space-y-5">

      {/* Current plan info */}
      <Card titulo="Tu suscripción actual" desc={`Clínica: ${session?.clinicName ?? clinicId}`}>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-muted/40 px-4 py-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Plan</p>
            <p className="text-sm font-semibold">
              {isTrial ? `Prueba (${planLabel('professional')})` : planLabel(session?.plan)}
              {!isTrial && session?.planPeriod === 'annual' ? ' · anual' : ''}
            </p>
          </div>
          <div className="rounded-xl bg-muted/40 px-4 py-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Estado</p>
            <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', estado.text)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', estado.dot)} />
              {estado.label}
            </span>
          </div>
          <div className="rounded-xl bg-muted/40 px-4 py-3 col-span-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Vence el</p>
            <p className="text-sm font-semibold">
              {session?.expirationDate ?? '—'}
              {days !== null && days >= 0 && (
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  {days === 0 ? '(hoy)' : `(${days} ${days === 1 ? 'día' : 'días'})`}
                </span>
              )}
            </p>
          </div>
          <div className="rounded-xl bg-muted/40 px-4 py-3 col-span-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Incluye</p>
            <p className="text-xs">
              {limits.maxUsers === null ? 'Usuarios ilimitados' : `Hasta ${limits.maxUsers} usuarios`}
              {' · '}
              {limits.maxPatients === null ? 'pacientes ilimitados' : `hasta ${limits.maxPatients} pacientes`}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {limits.modules.map((m) => PLAN_MODULE_LABELS[m]).join(', ')}
            </p>
          </div>
        </div>
      </Card>

      {/* Pay / renew */}
      {!session?.isDemo && (
        <Card
          titulo={expired ? 'Reactivar suscripción' : 'Pagar o renovar'}
          desc="Elige tu plan: mensual (30 días) o anual (365 días)."
        >
          <p className="text-xs text-muted-foreground">
            Si pagas antes de que venza, los días se suman a tu fecha actual: no pierdes ningún día.
            Al cambiar de plan, el nuevo aplica cuando confirmamos tu pago.
          </p>
          <ManualPaymentPanel />
          {billingConfig?.cardEnabled && (
            <Button onClick={startCheckout} disabled={checkoutLoading} variant="outline" className="w-full gap-2">
              {checkoutLoading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
              {/* Card checkout sells only the plan in recurrente.plans.ts */}
              Pagar con tarjeta (Profesional mensual)
            </Button>
          )}
        </Card>
      )}

      {/* Expiry reminders on this device */}
      {!session?.isDemo && (
        <Card titulo="Avisos de vencimiento" desc="Recibe una notificación en este dispositivo 3 días antes, un día antes y el día que vence tu suscripción.">
          <EnableRemindersButton />
        </Card>
      )}

      {/* Payment history */}
      {!session?.isDemo && clinicInvoices.length > 0 && (
        <Card titulo="Tus pagos" desc="Pagos reportados por transferencia o Kash.">
          <ul className="divide-y divide-border">
            {clinicInvoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{inv.number} · {formatMoney(inv.amount, inv.currency)}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {inv.methodLabel} · comprobante {inv.payerReference} · {inv.paidOn}
                    {inv.status === 'rejected' && inv.rejectReason ? ` · ${inv.rejectReason}` : ''}
                  </p>
                </div>
                <span className={cn('shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-medium',
                  inv.status === 'confirmed' ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400'
                  : inv.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400')}>
                  {inv.status === 'confirmed' ? 'Confirmado' : inv.status === 'rejected' ? 'Rechazado' : 'En revisión'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Cancel note */}
      {!platformOwner && (
        <Card titulo="Cancelar cuenta" desc="La cancelación elimina permanentemente tu clínica y sus datos.">
          <p className="text-xs text-muted-foreground">
            Los pagos no se renuevan solos: si no pagas, el acceso se detiene al vencer. Para eliminar
            tu cuenta de VetSystem, contacta al soporte:{' '}
            <a href="mailto:soporte@vetsystem.app" className="underline text-foreground">
              soporte@vetsystem.app
            </a>
          </p>
        </Card>
      )}

      {/* Billing notices — platform owner only */}
      {platformOwner && (
        <Card titulo="Cobros a clínicas" desc="Confirma pagos por transferencia o Kash, y elige cuándo cada clínica ve el cobro.">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => router.push('/admin/payments')} className="gap-2">
              <Landmark size={14} /> Pagos por confirmar
            </Button>
            <Button onClick={() => router.push('/admin/billing')} variant="outline" className="gap-2">
              <BellRing size={14} /> Programar cobros
            </Button>
            <Button onClick={() => router.push('/admin/plans')} variant="outline" className="gap-2">
              <Layers size={14} /> Planes y precios
            </Button>
            <Button onClick={() => router.push('/admin/landing')} variant="outline" className="gap-2">
              <Globe size={14} /> Página web
            </Button>
          </div>
        </Card>
      )}

      {/* Full license editor — platform owner only (enforced by firestore.rules) */}
      {platformOwner && (
        <Card titulo="Editor de licencia" desc="Configura el plan de cualquier clínica. Se aplica en su próximo inicio de sesión.">
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mb-3">
            <ShieldAlert size={12} /> Solo visible para el dueño de la plataforma
          </div>
          <form onSubmit={handleGuardarLicencia} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">ID de la clínica</label>
              <input
                required
                value={lic.clinicId}
                onChange={(e) => setLic({ ...lic, clinicId: e.target.value })}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Nombre clínica</label>
                <input
                  required
                  value={lic.clinicName}
                  onChange={(e) => setLic({ ...lic, clinicName: e.target.value })}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Plan</label>
                <input
                  required
                  value={lic.plan}
                  onChange={(e) => setLic({ ...lic, plan: e.target.value })}
                  placeholder="monthly, Trial…"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Vence el</label>
                <input
                  type="date"
                  required
                  value={lic.expirationDate}
                  onChange={(e) => setLic({ ...lic, expirationDate: e.target.value })}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Estado</label>
                <select
                  value={lic.subscription ? 'active' : 'inactive'}
                  onChange={(e) => setLic({ ...lic, subscription: e.target.value === 'active' })}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="active">Activa</option>
                  <option value="inactive">Suspendida</option>
                </select>
              </div>
            </div>
            <Button type="submit" variant="outline" disabled={accionLic === 'loading'} className="w-full gap-2">
              {accionLic === 'loading' && <Loader2 size={14} className="animate-spin" />}
              Guardar licencia
            </Button>
            {accionLic === 'ok' && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 size={12} /> Guardado en Firestore.
              </p>
            )}
            {accionLic === 'error' && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle size={12} /> No se pudo guardar. Revisa el ID de la clínica.
              </p>
            )}
          </form>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Datos locales (master only) ────────────────────────────────────────

function TabDatos() {
  const [accion,  setAccion]  = useState<Accion>('idle');
  const [mensaje, setMensaje] = useState('');
  const [conteos, setConteos] = useState<Record<string, number> | null>(null);

  async function sembrar() {
    setAccion('loading'); setConteos(null);
    try {
      const clinicId = await getClinicId();
      const r = await sembrarDatos(clinicId);
      setMensaje(r.mensaje); setConteos(r.conteos); setAccion('ok');
    } catch (e) { setMensaje((e as Error).message); setAccion('error'); }
  }

  async function limpiar() {
    if (!confirm('¿Limpiar TODOS los datos locales? No se puede deshacer.')) return;
    setAccion('loading'); setConteos(null);
    try {
      await limpiarDatos();
      setMensaje('Base de datos local limpiada.'); setAccion('ok');
    } catch (e) { setMensaje((e as Error).message); setAccion('error'); }
  }

  return (
    <div className="space-y-4">
      <Advertencia>
        Opera solo sobre <strong>IndexedDB local</strong> (este navegador). No toca Firebase.
      </Advertencia>
      <Card titulo="Datos de prueba" desc="8 dueños · 12 pacientes · consultas · citas · 18 productos · 30 pagos">
        <div className="flex gap-3">
          <Button onClick={sembrar} disabled={accion === 'loading'} className="gap-2 flex-1">
            {accion === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Sprout size={14} />}
            Sembrar datos
          </Button>
          <Button onClick={limpiar} variant="outline" disabled={accion === 'loading'}
            className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/5">
            <Trash2 size={14} /> Limpiar todo
          </Button>
        </div>
      </Card>
      <ResultadoBox accion={accion} mensaje={mensaje} conteos={conteos} />
    </div>
  );
}

// ─── Tab: Firebase sync (master only) ────────────────────────────────────────

function TabFirebase() {
  const router = useRouter();
  const [online,      setOnline]      = useState(true);
  const [queue,       setQueue]       = useState<QueueEstado | null>(null);
  const [queueErrors, setQueueErrors] = useState<{ collection: string; documentId: string; lastError?: string }[]>([]);
  const [progress,    setProgress]    = useState<SyncAllProgress[]>([]);
  const [accion,      setAccion]      = useState<Accion>('idle');
  const [mensaje,     setMensaje]     = useState('');

  const cargarQueue = useCallback(async () => {
    const e = await syncService.estadoQueue();
    setQueue(e);
    if (e.conError > 0) {
      const errs = await syncService.queueErrors();
      setQueueErrors(errs);
    } else {
      setQueueErrors([]);
    }
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    window.addEventListener('online',  () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));
    cargarQueue();
  }, [cargarQueue]);

  async function handleFlush() {
    setAccion('loading');
    try {
      await syncService.flush();
      await cargarQueue();
      setMensaje('Queue drenada.'); setAccion('ok');
    } catch (e) { setMensaje((e as Error).message); setAccion('error'); }
  }

  async function handleForcePull() {
    if (!online) return;
    setAccion('loading'); setMensaje('');
    try {
      const written = await syncService.forcePull();
      setMensaje(`Re-pull completo: ${written} documentos escritos en este dispositivo.`);
      setAccion('ok');
      await cargarQueue();
    } catch (e) { setMensaje((e as Error).message); setAccion('error'); }
  }

  async function handleSyncAll() {
    if (!online) return;
    setAccion('loading'); setProgress([]);
    try {
      const r = await syncService.syncAll((p) =>
        setProgress((prev) => {
          const idx = prev.findIndex((x) => x.collection === p.collection);
          if (idx >= 0) { const n = [...prev]; n[idx] = p; return n; }
          return [...prev, p];
        }),
      );
      setMensaje(`${r.total} documentos enviados · ${r.errores} errores.`);
      setAccion(r.errores > 0 ? 'error' : 'ok');
      await cargarQueue();
    } catch (e) { setMensaje((e as Error).message); setAccion('error'); }
  }

  return (
    <div className="space-y-4">
      <div className={cn(
        'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium',
        online
          ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
          : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
      )}>
        {online ? <Wifi size={14} /> : <WifiOff size={14} />}
        {online ? 'Online' : 'Sin conexión — sync deshabilitado'}
        <span className="ml-auto font-mono text-xs opacity-60">{PROYECTO_ID}</span>
      </div>

      {queue && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-3xl font-bold">{queue.pendientes}</p>
            <p className="text-xs text-muted-foreground mt-1">Pendientes en queue</p>
          </div>
          <div className={cn('rounded-xl border bg-card p-4 text-center', queue.conError > 0 ? 'border-red-300' : 'border-border')}>
            <p className={cn('text-3xl font-bold', queue.conError > 0 && 'text-destructive')}>{queue.conError}</p>
            <p className="text-xs text-muted-foreground mt-1">Con error (&gt;5 intentos)</p>
          </div>
        </div>
      )}

      {/* Queue error details */}
      {queueErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-red-700 dark:text-red-400">
            {queueErrors.length} ítem{queueErrors.length !== 1 ? 's' : ''} atascado{queueErrors.length !== 1 ? 's' : ''} — no llegaron a Firebase:
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {queueErrors.map((err, i) => (
              <div key={i} className="text-[11px] font-mono text-red-600 dark:text-red-400">
                <span className="font-semibold">{err.collection}</span>
                <span className="text-red-400"> / {err.documentId.slice(0, 12)}…</span>
                {err.lastError && (
                  <p className="text-[10px] text-red-400/80 truncate pl-2">{err.lastError}</p>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-red-500">
            Usa &ldquo;Sync todo → Firebase&rdquo; desde este dispositivo para reenviarlos.
          </p>
        </div>
      )}

      {/* Re-pull from Firestore — USE THIS on developer laptop */}
      <Card
        titulo="Re-pull desde Firebase → este dispositivo"
        desc="Borra el cursor local y jala TODOS los documentos de Firestore desde el principio. Úsalo cuando este dispositivo no refleja datos de otras computadoras."
      >
        <Advertencia tipo="info">
          Esto solo <strong>lee</strong> de Firebase y actualiza este dispositivo. No modifica datos en otros dispositivos ni en Firebase.
        </Advertencia>
        <Button onClick={handleForcePull} variant="outline" disabled={accion === 'loading' || !online} className="gap-2 w-full">
          {accion === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
          Re-pull completo desde Firebase
        </Button>
      </Card>

      <Card titulo="Uso y costos" desc="Cuántos documentos tiene esta clínica, cuánto crece y qué cuesta en infraestructura.">
        <Button onClick={() => router.push('/admin/usage')} variant="outline" className="gap-2">
          <Activity size={14} /> Ver métricas
        </Button>
      </Card>

      <Card titulo="Drenar queue" desc="Envía los ítems pendientes en la cola de este dispositivo a Firebase.">
        <Button onClick={handleFlush} variant="outline" disabled={accion === 'loading' || !online} className="gap-2">
          <RefreshCw size={14} /> Flush ahora
        </Button>
      </Card>

      <Card titulo="Sync completo → Firebase" desc="Lee TODAS las tablas de Dexie de este dispositivo y las empuja a Firebase. Úsalo desde la compu del cliente si sus datos no llegaron.">
        {ES_PROD && (
          <Advertencia tipo="riesgo">
            Esto sobrescribe documentos en <strong>PROD</strong>. Úsalo DESDE la compu con los datos correctos.
          </Advertencia>
        )}
        <Button onClick={handleSyncAll} disabled={accion === 'loading' || !online} className="gap-2 w-full">
          {accion === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
          Sync todo → Firebase
        </Button>
        {progress.length > 0 && (
          <div className="mt-3 space-y-2">
            {progress.map((p) => (
              <div key={p.collection} className="space-y-1">
                <div className="flex items-center gap-3 text-xs">
                  <span className="w-28 font-mono text-muted-foreground truncate">{p.collection}</span>
                  <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${p.total > 0 ? (p.enviados / p.total) * 100 : 100}%` }} />
                  </div>
                  <span className="text-muted-foreground tabular-nums w-16 text-right">
                    {p.enviados}/{p.total}
                    {p.errores > 0 && <span className="text-destructive ml-1"> ·{p.errores}err</span>}
                  </span>
                </div>
                {p.mensajesError?.map((msg, i) => (
                  <p key={i} className="text-[10px] text-destructive font-mono pl-[7.5rem] leading-tight break-all">↳ {msg}</p>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>

      <ResultadoBox accion={accion} mensaje={mensaje} />
    </div>
  );
}

// ─── Tab: Estado DB (master only) ─────────────────────────────────────────────

function TabEstado() {
  const [conteos,  setConteos]  = useState<Record<string, number> | null>(null);
  const [loading, setCargando] = useState(true);

  useEffect(() => {
    syncService.conteoTablas().then((c) => { setConteos(c); setCargando(false); });
  }, []);

  return (
    <div className="space-y-4">
      <Card titulo="Registros en Dexie (IndexedDB local)" desc="Conteo actual por colección">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Contando…
          </div>
        ) : conteos ? (
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(conteos).map(([col, n]) => (
              <div key={col} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Database size={11} /> {col}
                </span>
                <span className="text-xs font-semibold tabular-nums">{n}</span>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

function Card({ titulo, desc, children }: { titulo: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <div>
        <p className="font-medium text-sm">{titulo}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Advertencia({ children, tipo = 'info' }: { children: React.ReactNode; tipo?: 'info' | 'riesgo' }) {
  return (
    <div className={cn(
      'rounded-xl border p-3.5 text-sm flex items-start gap-2',
      tipo === 'info'
        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300'
        : 'border-red-200 bg-red-50 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300',
    )}>
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function ResultadoBox({
  accion, mensaje, conteos,
}: { accion: Accion; mensaje: string; conteos?: Record<string, number> | null }) {
  if (accion === 'idle') return null;
  if (accion === 'ok') return (
    <div className="rounded-2xl border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-4 space-y-3">
      <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
        <CheckCircle2 size={16} /> <span className="font-medium text-sm">{mensaje}</span>
      </div>
      {conteos && (
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(conteos).map(([k, v]) => (
            <div key={k} className="flex justify-between rounded-lg bg-white/60 dark:bg-white/5 px-3 py-2">
              <span className="text-xs text-muted-foreground capitalize">{k}</span>
              <span className="text-xs font-semibold">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  if (accion === 'error') return (
    <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-4 flex items-center gap-2 text-red-700 dark:text-red-400">
      <AlertCircle size={16} className="shrink-0" />
      <p className="text-sm">{mensaje}</p>
    </div>
  );
  return null;
}
