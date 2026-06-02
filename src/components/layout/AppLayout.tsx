'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeSwitcher } from '@/components/themes/ThemeSwitcher';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Menu, X, Home, Users, Calendar, Package,
  BarChart3, Settings, Search, DollarSign, Stethoscope, Receipt, ClipboardList,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Ítems del menú
// `disponible: false` → se muestra pero no es clickeable (módulo pendiente)
// ─────────────────────────────────────────────────────────────────────────────

const menuItems = [
  { icon: Home,        label: 'Dashboard',      href: '/dashboard',     disponible: true  },
  { icon: Users,       label: 'Pacientes',      href: '/pacientes',     disponible: true  },
  { icon: Calendar,    label: 'Agenda',         href: '/agenda',        disponible: true  },
  { icon: Package,     label: 'Inventario',     href: '/inventario',    disponible: true  },
  { icon: Stethoscope, label: 'Consultas',      href: '/consultas',     disponible: true  },
  { icon: DollarSign,  label: 'Finanzas',       href: '/finanzas',      disponible: true  },
  { icon: Receipt,       label: 'Facturas',       href: '/facturas',      disponible: true  },
  { icon: ClipboardList, label: 'Servicios',     href: '/servicios',     disponible: true  },
  { icon: BarChart3,     label: 'Reportes',      href: '/reportes',      disponible: false },
  { icon: Settings,    label: 'Configuración',  href: '/configuracion', disponible: false },
];

// ─────────────────────────────────────────────────────────────────────────────

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const cerrarSidebar = () => setSidebarOpen(false);

  // Una ruta está activa si el pathname empieza con su href
  // (excepción: '/' solo es exacto)
  const esActivo = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* Overlay móvil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={cerrarSidebar}
        />
      )}

      {/* ── Sidebar ────────────────────────────────────────── */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-sidebar flex flex-col shadow-xl',
        'transition-transform duration-300 lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>

        {/* Logo */}
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpeg"
              alt="Pets House"
              className="w-10 h-10 rounded-xl object-cover shrink-0 bg-white"
            />
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-sidebar-foreground">Pet's House</h1>
              <p className="text-xs text-sidebar-muted">VetSystem</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 overflow-y-auto">
          <ul className="space-y-0.5">
            {menuItems.map((item) => {
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
                <li key={item.label}>
                  <Link
                    href={item.href}
                    onClick={cerrarSidebar}
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
          <p className="text-xs text-sidebar-muted">VetSystem v0.1 · Nicaragua</p>
        </div>
      </aside>

      {/* ── Contenido principal ────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">

        {/* Header */}
        <header className="h-14 bg-card shadow-sm flex items-center px-4 z-40 shrink-0">
          <div className="flex items-center justify-between w-full gap-4">

            <div className="flex items-center gap-3">
              {/* Botón hamburguesa móvil */}
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden h-8 w-8"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
              </Button>

              {/* Buscador */}
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
              <ThemeSwitcher />
              <div className="flex items-center gap-2.5 pl-3 border-l border-border">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium leading-tight">Dr. Lucia Carballo</p>
                  <p className="text-xs text-muted-foreground">Veterinaria</p>
                </div>
                <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">
                  LC
                </div>
              </div>
            </div>

          </div>
        </header>

        {/* Contenido */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>

    </div>
  );
}
