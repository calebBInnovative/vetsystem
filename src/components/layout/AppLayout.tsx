'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { syncService } from '@/lib/sync/sync.service';
import { useAuth } from '@/contexts/AuthContext';
import { logout, actualizarUsuario } from '@/lib/auth/auth.service';
import { db } from '@/lib/db/database';
import { clearDemo } from '@/lib/demo/demo.service';
import { LicenseBanner } from '@/components/license/LicenseBanner';
import { TourGuide } from '@/components/common/TourGuide';
import { puedeEscribir } from '@/lib/license/license.service';
import { ThemeSwitcher } from '@/components/themes/ThemeSwitcher';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AppModule } from '@/types/license';
import { useDemoMode } from '@/hooks/useDemoMode';
import {
  Menu, X, Home, Users, Calendar, Package,
  BarChart3, Settings, Search, DollarSign, Stethoscope, Receipt,
  ClipboardList, ShoppingBag, Tag, Shield, Database, LogOut, ChevronDown,
  FlaskConical, PlayCircle, UserCircle, Loader2, CheckCircle2, Phone,
  Wallet, Bell, FileSpreadsheet, MessageCircle,
} from 'lucide-react';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { useExpenseAlerts, useFixedExpenses } from '@/hooks/useExpenses';
import {
  alertLevel,
  daysUntilDue,
  EXPENSE_CATEGORIES,
} from '@/types/expense';
import { useCollaboratorAlerts, useCollaborators } from '@/hooks/useCollaborators';
import { daysUntilCollaboratorPayment } from '@/types/collaborator';
import { useStockAlerts } from '@/hooks/useInventory';
import { AlertasStock } from '@/components/inventory/StockAlerts';
import { useCitasDelDia } from '@/hooks/useAppointments';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import {
  requestNotifPermission,
  getNotifPermission,
  useSystemNotifications,
  testNotifications,
} from '@/hooks/useNotifications';
import { PWAInstallBanner } from '@/components/common/PWAInstallBanner';
import { toast } from 'sonner';

// ── Sync status indicator ─────────────────────────────────────────────────────

function SyncIndicator() {
  const { pending, stuck, healthy, loading } = useSyncStatus();
  if (loading || healthy) return null;

  const isStuck = stuck > 0 && pending === 0;
  const count   = pending + stuck;

  return (
    <div
      title={
        isStuck
          ? `${stuck} cambio${stuck !== 1 ? 's' : ''} sin sincronizar — reintentando automáticamente`
          : `Sincronizando ${count} cambio${count !== 1 ? 's' : ''}…`
      }
      className={cn(
        'flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full select-none',
        isStuck
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      )}
    >
      {isStuck ? (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="hidden sm:inline">Sin sync</span>
        </>
      ) : (
        <>
          <Loader2 size={10} className="animate-spin" />
          <span className="hidden sm:inline">Sincronizando</span>
        </>
      )}
    </div>
  );
}

// nav-id is used by TourGuide to spotlight each item
const menuItems: {
  icon: React.ElementType;
  label: string;
  href: string;
  disponible: boolean;
  modulo?: AppModule;
  navId?: string;
}[] = [
  { icon: Home,          label: 'Dashboard',     href: '/dashboard',     disponible: true,  navId: 'nav-dashboard'  },
  { icon: Users,         label: 'Pacientes',     href: '/patients',     disponible: true,  modulo: 'patients', navId: 'nav-patients'  },
  { icon: Calendar,      label: 'Agenda',        href: '/schedule',        disponible: true,  modulo: 'schedule',    navId: 'nav-schedule'     },
  { icon: ShoppingBag,   label: 'Vender',        href: '/sales',        disponible: true,  modulo: 'sales'                            },
  { icon: Stethoscope,   label: 'Consultas',     href: '/consultations',     disponible: true,  modulo: 'consultations', navId: 'nav-consultations'  },
  { icon: Package,       label: 'Inventario',    href: '/inventory',    disponible: true,  modulo: 'inventory',navId: 'nav-inventory' },
  { icon: ClipboardList,    label: 'Servicios',        href: '/services',     disponible: true,  modulo: 'services'                         },
  { icon: Tag,           label: 'Promociones',   href: '/promotions',   disponible: true,  modulo: 'promotions'                       },
  { icon: MessageCircle, label: 'WhatsApp',      href: '/marketing',    disponible: true                                                   },
  { icon: DollarSign,    label: 'Finanzas',      href: '/finances',      disponible: true,  modulo: 'finances',  navId: 'nav-finances'   },
  { icon: Receipt,       label: 'Facturas',      href: '/invoices',      disponible: true,  modulo: 'invoices'                          },
  { icon: Wallet,        label: 'Egresos',        href: '/expenses',       disponible: true,  modulo: 'finances'                          },
  { icon: BarChart3,     label: 'Reportes',      href: '/reports',       disponible: true                                               },
  { icon: FileSpreadsheet,  label: 'Importar/Exportar', href: '/import',      disponible: true,  modulo: 'import'                           },
  { icon: Settings,      label: 'Configuración', href: '/configuracion', disponible: false                                              },
];

// ── Bell notification ─────────────────────────────────────────────────────────

function BellNotification() {
  const alertsExpenses              = useExpenseAlerts();
  const alertsCollab                = useCollaboratorAlerts();
  const { expenses }                = useFixedExpenses();
  const { collaborators }           = useCollaborators();
  const { alerts: stockAlerts }     = useStockAlerts();
  const [notifPerm, setNotifPerm]   = useState<NotificationPermission>(() => getNotifPermission());

  const totalAlertas = alertsExpenses.total + alertsCollab.total + stockAlerts.length;

  const en30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const en14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const upcomingExpenses = expenses.filter(
    (g) => g.active && g.nextDueDate <= en30,
  );
  const upcomingCollaborators = collaborators.filter(
    (c) => c.active && c.nextPaymentDate <= en14,
  );

  const levelClasses: Record<string, string> = {
    overdue:  'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
    urgent:   'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
    upcoming: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
    normal:   'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  };

  function colabBadgeClass(nextPaymentDate: string): string {
    const dias = daysUntilCollaboratorPayment(nextPaymentDate);
    if (dias < 0 || dias <= 3) return levelClasses.overdue;
    if (dias <= 7)             return levelClasses.upcoming;
    return levelClasses.normal;
  }

  function colabBadgeText(nextPaymentDate: string): string {
    const dias = daysUntilCollaboratorPayment(nextPaymentDate);
    return dias < 0 ? 'Vencido' : `${dias}d`;
  }

  async function handleEnableNotifications() {
    const granted = await requestNotifPermission();
    setNotifPerm(granted ? 'granted' : 'denied');
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative p-1.5 rounded-lg hover:bg-muted/60 transition-colors">
          <Bell size={18} className="text-muted-foreground" />
          {totalAlertas > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
              {totalAlertas > 99 ? '99+' : totalAlertas}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0 overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">Alertas</p>
          {totalAlertas === 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">Todo al día ✓</p>
          )}
        </div>

        {/* Enable notifications prompt */}
        {notifPerm === 'default' && (
          <div className="px-4 py-3 bg-primary/5 border-b border-border flex items-start gap-3">
            <Bell size={15} className="text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">Activar notificaciones</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Recibe alertas de stock y recordatorios de citas aunque no tengas la app abierta.
              </p>
              <button
                onClick={handleEnableNotifications}
                className="mt-2 text-[11px] font-semibold text-primary hover:underline"
              >
                Activar →
              </button>
            </div>
          </div>
        )}

        {notifPerm === 'denied' && (
          <div className="px-4 py-2 bg-muted/30 border-b border-border">
            <p className="text-[11px] text-muted-foreground">
              🔕 Notificaciones bloqueadas en el navegador.
            </p>
          </div>
        )}

        {/* Content */}
        {totalAlertas === 0 ? (
          <div className="px-4 py-5 text-xs text-muted-foreground text-center">
            No hay alertas pendientes
          </div>
        ) : (
          <ul className="divide-y divide-border max-h-80 overflow-y-auto">

            {/* Stock */}
            {stockAlerts.length > 0 && (
              <>
                <li className="px-4 py-1.5 bg-muted/40">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Stock</p>
                </li>
                {stockAlerts.map((p) => {
                  const sinStock = p.currentStock === 0;
                  return (
                    <li key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">Inventario</p>
                      </div>
                      <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        sinStock ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                      }`}>
                        {sinStock ? 'Sin stock' : `${p.currentStock} bajo mín.`}
                      </span>
                    </li>
                  );
                })}
              </>
            )}

            {/* Expenses */}
            {upcomingExpenses.length > 0 && (
              <>
                <li className="px-4 py-1.5 bg-muted/40">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Gastos</p>
                </li>
                {upcomingExpenses.map((g) => {
                  const nivel = alertLevel(g.nextDueDate);
                  const dias  = daysUntilDue(g.nextDueDate);
                  return (
                    <li key={g.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{g.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {EXPENSE_CATEGORIES[g.category]} · {g.nextDueDate}
                        </p>
                      </div>
                      <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${levelClasses[nivel]}`}>
                        {nivel === 'overdue' ? 'Vencido' : `${dias}d`}
                      </span>
                    </li>
                  );
                })}
              </>
            )}

            {/* Collaborators */}
            {upcomingCollaborators.length > 0 && (
              <>
                <li className="px-4 py-1.5 bg-muted/40">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Colaboradores</p>
                </li>
                {upcomingCollaborators.map((c) => (
                  <li key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.role || 'Collaborator'} · {c.nextPaymentDate}
                      </p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colabBadgeClass(c.nextPaymentDate)}`}>
                      {colabBadgeText(c.nextPaymentDate)}
                    </span>
                  </li>
                ))}
              </>
            )}
          </ul>
        )}

        <div className="px-4 py-2.5 border-t border-border flex gap-4">
          <Link href="/inventory" className="text-xs text-primary hover:underline font-medium">
            Inventario →
          </Link>
          <Link href="/expenses" className="text-xs text-primary hover:underline font-medium">
            Egresos →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Phone validation helpers ──────────────────────────────────────────────────
function validarTelPersonal(tel: string): boolean {
  const d = tel.replace(/[\s\-\+]/g, '');
  if (d.startsWith('505')) return /^505\d{8}$/.test(d);
  return /^\d{8}$/.test(d);
}
function formatearTelPersonal(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  return d.length <= 4 ? d : `${d.slice(0, 4)}-${d.slice(4)}`;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navigating,  setNavigating]  = useState(false);
  const pathname = usePathname();
  const router   = useRouter();
  const { session, license, refreshFromDexie } = useAuth();
  const { isDemo, startTour } = useDemoMode();
  const soloLectura = !puedeEscribir(license.mode);
  const esMaster    = session?.role === 'master';
  const esAdmin     = session?.role === 'admin' || esMaster;

  const today = new Date().toISOString().slice(0, 10);
  const { appointments } = useCitasDelDia(today);
  useSystemNotifications(session?.clinicId, appointments);

  // ── "Mi perfil" modal state ───────────────────────────────────────────────
  const [perfilOpen,   setPerfilOpen]   = useState(false);
  const [perfilNombre, setPerfilNombre] = useState('');
  const [perfilTel,    setPerfilTel]    = useState('');
  const [perfilTelErr, setPerfilTelErr] = useState('');
  const [perfilAccion, setPerfilAccion] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  function abrirPerfil() {
    setPerfilNombre(session?.userName ?? '');
    setPerfilTel(session?.userTel ?? '');
    setPerfilTelErr('');
    setPerfilAccion('idle');
    setPerfilOpen(true);
  }

  async function handleGuardarPerfil(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (perfilTel.trim() && !validarTelPersonal(perfilTel)) {
      setPerfilTelErr('Número inválido. Usa formato 8163-0097 o +50581630097.');
      return;
    }
    setPerfilAccion('loading');
    try {
      await actualizarUsuario(session.uid, {
        name:        perfilNombre.trim() || session.userName,
        role:        session.role,
        permissions: session.permissions,
        phone:    perfilTel.trim() || undefined,
      });
      // Update Dexie session
      const local = await db.session.get('singleton');
      if (local) {
        await db.session.put({
          ...local,
          userName: perfilNombre.trim() || session.userName,
          userTel:  perfilTel.trim() || undefined,
        });
      }
      await refreshFromDexie();
      setPerfilAccion('ok');
      setTimeout(() => setPerfilOpen(false), 800);
    } catch {
      setPerfilAccion('error');
    }
  }

  function tieneAcceso(modulo?: AppModule): boolean {
    if (!modulo) return true;
    if (!session) return false;
    if (session.role === 'master' || session.role === 'admin') return true;
    // null permissions for a staff user means the Firestore doc was missing the field — grant default access
    if (session.permissions === null) return true;
    return session.permissions[modulo] === true;
  }

  async function handleLogout() {
    if (isDemo) {
      await clearDemo();
      await refreshFromDexie(); // nulls out the in-memory demo session before navigating
      router.push('/landing');
    } else {
      await logout();
      router.push('/login');
    }
  }

  useEffect(() => { setNavigating(false); }, [pathname]);

  // On first login from a new browser (or a new clinic on this browser),
  // the clinic-specific lastPull key is missing → download all Firestore data
  // before showing the app. Keyed per clinicId so switching users/clinics
  // always triggers a fresh pull for that clinic's data.
  const [initialSyncing, setInitialSyncing] = useState(typeof window !== 'undefined');

  // Once we know who is logged in, check if THIS user has already pulled data
  // on this browser. Key includes uid so different users on the same browser
  // each get a fresh pull (different IndexedDB state, different pull cursor).
  useEffect(() => {
    if (isDemo) { setInitialSyncing(false); return; }
    if (!session?.clinicId || !session?.uid) return;
    const key = `vetsystem_last_pull_${session.clinicId}_${session.uid}`;
    const lastPull = localStorage.getItem(key);
    if (lastPull && lastPull !== '0') setInitialSyncing(false);
  }, [session?.clinicId, session?.uid, isDemo]);

  useEffect(() => {
    syncService.start().finally(() => setInitialSyncing(false));
    return () => syncService.stop();
  }, []);

  const cerrarSidebar = () => setSidebarOpen(false);

  const esActivo = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  // First-time login on this browser: show a spinner while all Firestore
  // data downloads into local IndexedDB before revealing the empty-looking app.
  if (initialSyncing) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
        <div className="text-center space-y-1">
          <p className="font-semibold">Sincronizando datos</p>
          <p className="text-sm text-muted-foreground">
            Descargando información de la clínica…
          </p>
          <p className="text-xs text-muted-foreground">
            Esto solo ocurre la primera vez en este navegador
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* Tour guide overlay (demo only) */}
      <TourGuide />

      {/* PWA install banner (Android/Chrome prompt or iOS manual instructions) */}
      <PWAInstallBanner />

      {/* Overlay móvil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={cerrarSidebar}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-sidebar flex flex-col shadow-xl',
        'transition-transform duration-300 lg:translate-x-0 print:hidden',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>

        {/* Logo */}
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            {isDemo ? (
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <FlaskConical size={20} className="text-primary" />
              </div>
            ) : (
              <Image
                src="/logo.jpeg"
                alt="Pets House"
                width={40}
                height={40}
                className="rounded-xl object-cover shrink-0 bg-white"
              />
            )}
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-sidebar-foreground">
                {isDemo ? 'Modo Demo' : "Pet's House"}
              </h1>
              <p className="text-xs text-sidebar-muted">VetSystem</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 overflow-y-auto">
          <ul className="space-y-0.5">
            {menuItems.filter((item) => tieneAcceso(item.modulo)).map((item) => {
              const activo = esActivo(item.href);

              if (!item.disponible) {
                return (
                  <li key={item.label}>
                    <div className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium',
                      'text-sidebar-muted cursor-not-allowed opacity-50'
                    )}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                      <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide opacity-60">
                        Pronto
                      </span>
                    </div>
                  </li>
                );
              }

              return (
                <li key={item.label} id={item.navId}>
                  <Link
                    href={item.href}
                    onClick={() => { cerrarSidebar(); if (!esActivo(item.href)) setNavigating(true); }}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                      activo
                        ? 'bg-white/20 text-sidebar-foreground'
                        : 'text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground'
                    )}
                  >
                    <item.icon className={cn(
                      'h-4 w-4 shrink-0',
                      activo ? 'text-sidebar-foreground' : 'text-sidebar-muted'
                    )} />
                    <span>{item.label}</span>
                    {activo && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-sidebar-foreground/60" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10">
          <p className="text-xs text-sidebar-muted px-3">VetSystem v0.1 · Nicaragua</p>
        </div>
      </aside>

      {/* Barra de progreso de navegación */}
      {navigating && (
        <div className="fixed top-0 left-0 right-0 h-0.5 z-[9999] bg-primary/20 overflow-hidden pointer-events-none">
          <div className="h-full w-1/3 bg-primary rounded-full nav-loading-bar" />
        </div>
      )}

      {/* ── Contenido principal ────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64 print:ml-0">

        {/* Demo banner */}
        {isDemo && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 flex items-center justify-between print:hidden">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <FlaskConical size={13} />
              <span className="text-xs font-medium">Modo Demo — datos de prueba, sin conexión a la nube</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  const granted = await requestNotifPermission();
                  if (!granted) {
                    toast.error('Permiso denegado. Activa las notificaciones en la configuración del navegador.');
                    return;
                  }
                  await testNotifications(session?.clinicId ?? '');
                  toast.success('¡Prueba enviada! Revisa tus notificaciones. La de cita llega en 10 s.');
                }}
                className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 hover:underline"
              >
                <Bell size={13} />
                Probar alertas
              </button>
              <button
                onClick={startTour}
                className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 hover:underline"
              >
                <PlayCircle size={13} />
                Ver tour
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="h-14 bg-card shadow-sm flex items-center px-4 z-40 shrink-0 print:hidden">
          <div className="flex items-center justify-between w-full gap-4">

            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden h-8 w-8"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
              </Button>
            </div>

            <div className="flex items-center gap-3">
              {soloLectura && !isDemo && (
                <span className="hidden sm:flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
                  Solo lectura
                </span>
              )}
              {!isDemo && <SyncIndicator />}
              <ThemeSwitcher />
              <BellNotification />

              {/* ── User dropdown ── */}
              {session && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      id="user-menu-trigger"
                      className="flex items-center gap-2.5 pl-3 border-l border-border hover:opacity-80 transition-opacity"
                    >
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-medium leading-tight">{session.userName}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {isDemo ? 'Demo' : session.role}
                        </p>
                      </div>
                      <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">
                        {session.userName.slice(0, 2).toUpperCase()}
                      </div>
                      <ChevronDown size={14} className="text-muted-foreground hidden sm:block" />
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel className="font-normal">
                      <p className="text-sm font-semibold">{session.userName}</p>
                      <p className="text-xs text-muted-foreground truncate">{session.email}</p>
                    </DropdownMenuLabel>

                    {isDemo && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={startTour}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <PlayCircle size={14} />
                          Ver tour nuevamente
                        </DropdownMenuItem>
                      </>
                    )}

                    {!isDemo && esAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link href="/admin" className="flex items-center gap-2 cursor-pointer">
                            <Shield size={14} />
                            Admin
                          </Link>
                        </DropdownMenuItem>
                        {esMaster && (
                          <DropdownMenuItem asChild>
                            <Link href="/dev/seed" className="flex items-center gap-2 cursor-pointer">
                              <Database size={14} />
                              Dev / Seed
                            </Link>
                          </DropdownMenuItem>
                        )}
                      </>
                    )}

                    {!isDemo && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={abrirPerfil}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <UserCircle size={14} />
                          Mi perfil
                        </DropdownMenuItem>
                      </>
                    )}

                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
                    >
                      <LogOut size={14} />
                      {isDemo ? 'Salir del demo' : 'Cerrar sesión'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

          </div>
        </header>

        {/* Mi perfil modal */}
        <Dialog open={perfilOpen} onOpenChange={(o) => { if (!o) setPerfilOpen(false); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Mi perfil</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleGuardarPerfil} className="space-y-4 pt-1">
              <div className="space-y-1">
                <label className="text-xs font-medium">Nombre</label>
                <input
                  required
                  value={perfilNombre}
                  onChange={(e) => { setPerfilNombre(e.target.value); setPerfilAccion('idle'); }}
                  placeholder="Tu nombre completo"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">
                  Teléfono personal{' '}
                  <span className="text-muted-foreground font-normal">(opcional)</span>
                </label>
                <div className="relative">
                  <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    type="tel"
                    inputMode="tel"
                    value={perfilTel}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setPerfilTel(raw.startsWith('+') ? raw : formatearTelPersonal(raw));
                      setPerfilTelErr('');
                      setPerfilAccion('idle');
                    }}
                    onBlur={() => {
                      if (perfilTel && !validarTelPersonal(perfilTel)) setPerfilTelErr('Número inválido.');
                    }}
                    placeholder="8163-0097"
                    className={cn(
                      'w-full rounded-xl border bg-background pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2',
                      perfilTelErr
                        ? 'border-destructive focus:ring-destructive/40'
                        : 'border-input focus:ring-ring',
                    )}
                  />
                </div>
                {perfilTelErr
                  ? <p className="text-xs text-destructive">{perfilTelErr}</p>
                  : <p className="text-xs text-muted-foreground">Formato: 8163-0097</p>
                }
              </div>
              {perfilAccion === 'ok' && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Guardado correctamente.
                </p>
              )}
              {perfilAccion === 'error' && (
                <p className="text-xs text-destructive">Error al guardar. ¿Tienes conexión?</p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPerfilOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={perfilAccion === 'loading'} className="gap-2">
                  {perfilAccion === 'loading' && <Loader2 size={13} className="animate-spin" />}
                  Guardar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Banner de licencia (advertencias / solo lectura / bloqueado) */}
        {!isDemo && <LicenseBanner />}

        {/* Stock alerts — visible en todas las páginas */}
        <div className="px-6 pt-4 print:hidden">
          <AlertasStock />
        </div>

        {/* Contenido */}
        <main className="flex-1 overflow-auto p-6 print:p-0">
          {children}
        </main>
      </div>

    </div>
  );
}
