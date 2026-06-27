'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
import type { ModuloApp } from '@/types/licencia';
import { useDemoMode } from '@/hooks/useDemoMode';
import {
  Menu, X, Home, Users, Calendar, Package,
  BarChart3, Settings, Search, DollarSign, Stethoscope, Receipt,
  ClipboardList, ShoppingBag, Shield, Database, LogOut, ChevronDown,
  FlaskConical, PlayCircle, UserCircle, Loader2, CheckCircle2, Phone,
} from 'lucide-react';

// nav-id is used by TourGuide to spotlight each item
const menuItems: {
  icon: React.ElementType;
  label: string;
  href: string;
  disponible: boolean;
  modulo?: ModuloApp;
  navId?: string;
}[] = [
  { icon: Home,          label: 'Dashboard',     href: '/dashboard',     disponible: true,  navId: 'nav-dashboard'  },
  { icon: Users,         label: 'Pacientes',     href: '/pacientes',     disponible: true,  modulo: 'pacientes', navId: 'nav-pacientes'  },
  { icon: Calendar,      label: 'Agenda',        href: '/agenda',        disponible: true,  modulo: 'agenda',    navId: 'nav-agenda'     },
  { icon: ShoppingBag,   label: 'Ventas',        href: '/ventas',        disponible: true,  modulo: 'ventas'                            },
  { icon: Package,       label: 'Inventario',    href: '/inventario',    disponible: true,  modulo: 'inventario',navId: 'nav-inventario' },
  { icon: Stethoscope,   label: 'Consultas',     href: '/consultas',     disponible: true,  modulo: 'consultas', navId: 'nav-consultas'  },
  { icon: DollarSign,    label: 'Finanzas',      href: '/finanzas',      disponible: true,  modulo: 'finanzas',  navId: 'nav-finanzas'   },
  { icon: Receipt,       label: 'Facturas',      href: '/facturas',      disponible: true,  modulo: 'facturas'                          },
  { icon: ClipboardList, label: 'Servicios',     href: '/servicios',     disponible: true,  modulo: 'servicios'                         },
  { icon: BarChart3,     label: 'Reportes',      href: '/reportes',      disponible: false                                              },
  { icon: Settings,      label: 'Configuración', href: '/configuracion', disponible: false                                              },
];

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
  const soloLectura = !puedeEscribir(license.modo);
  const esMaster    = session?.role === 'master';
  const esAdmin     = session?.role === 'admin' || esMaster;

  // ── "Mi perfil" modal state ───────────────────────────────────────────────
  const [perfilOpen,   setPerfilOpen]   = useState(false);
  const [perfilNombre, setPerfilNombre] = useState('');
  const [perfilTel,    setPerfilTel]    = useState('');
  const [perfilTelErr, setPerfilTelErr] = useState('');
  const [perfilAccion, setPerfilAccion] = useState<'idle' | 'cargando' | 'ok' | 'error'>('idle');

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
    setPerfilAccion('cargando');
    try {
      await actualizarUsuario(session.uid, {
        name:     perfilNombre.trim() || session.userName,
        role:     session.role,
        permisos: session.permisos,
        telefono: perfilTel.trim() || undefined,
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

  function tieneAcceso(modulo?: ModuloApp): boolean {
    if (!modulo) return true;
    if (!session) return false;
    if (session.role === 'master' || session.role === 'admin') return true;
    // null permisos for a staff user means the Firestore doc was missing the field — grant default access
    if (session.permisos === null) return true;
    return session.permisos[modulo] === true;
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

  useEffect(() => {
    syncService.iniciar();
    return () => syncService.detener();
  }, []);

  const cerrarSidebar = () => setSidebarOpen(false);

  const esActivo = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* Tour guide overlay (demo only) */}
      <TourGuide />

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
              <img
                src="/logo.jpeg"
                alt="Pets House"
                className="w-10 h-10 rounded-xl object-cover shrink-0 bg-white"
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
            <button
              onClick={startTour}
              className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 hover:underline"
            >
              <PlayCircle size={13} />
              Ver tour
            </button>
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

              <div className="relative hidden sm:block w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" size={14} />
                <input
                  type="text"
                  placeholder="Buscar paciente, dueño..."
                  className="w-full bg-muted/60 border-0 pl-8 pr-4 py-1.5 rounded-lg text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {soloLectura && !isDemo && (
                <span className="hidden sm:flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
                  Solo lectura
                </span>
              )}
              <ThemeSwitcher />

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
                <Button type="submit" disabled={perfilAccion === 'cargando'} className="gap-2">
                  {perfilAccion === 'cargando' && <Loader2 size={13} className="animate-spin" />}
                  Guardar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Banner de licencia (advertencias / solo lectura / bloqueado) */}
        {!isDemo && <LicenseBanner />}

        {/* Contenido */}
        <main className="flex-1 overflow-auto p-6 print:p-0">
          {children}
        </main>
      </div>

    </div>
  );
}
