'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeSwitcher } from '@/components/themes/ThemeSwitcher';
import {
  WifiOff, FileText, Package, Receipt,
  Star, ChevronRight, Menu, X, Check,
} from 'lucide-react';

// ─── Navbar ──────────────────────────────────────────────────────────────────

function Navbar() {
  const [scrolled,  setScrolled]  = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
      scrolled ? 'bg-background/80 backdrop-blur-md shadow-sm border-b border-border' : 'bg-transparent'
    }`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

        <Link href="/landing" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">V</div>
          <span className="text-base font-bold tracking-tight">VetSystem</span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-muted-foreground">
          <a href="#beneficios" className="hover:text-foreground transition-colors">Beneficios</a>
          <a href="#demo"       className="hover:text-foreground transition-colors">El sistema</a>
          <a href="#precios"    className="hover:text-foreground transition-colors">Precios</a>
          <a href="#contacto"   className="hover:text-foreground transition-colors">Contacto</a>
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <ThemeSwitcher />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Iniciar sesión</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/register">Comenzar gratis</Link>
          </Button>
        </div>

        <div className="md:hidden flex items-center gap-1">
          <ThemeSwitcher />
          <button className="p-2 rounded-lg hover:bg-muted transition-colors" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

      </div>

      {menuOpen && (
        <div className="md:hidden bg-background/95 backdrop-blur-md border-b border-border px-4 py-4 space-y-1">
          {['#beneficios', '#demo', '#precios', '#contacto'].map((href) => (
            <a
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors capitalize"
            >
              {href.slice(1)}
            </a>
          ))}
          <div className="pt-3 flex flex-col gap-2 border-t border-border mt-2">
            <Button variant="outline" className="w-full" asChild>
              <Link href="/login">Iniciar sesión</Link>
            </Button>
            <Button className="w-full" asChild>
              <Link href="/register">Comenzar gratis</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function DashboardMockup() {
  return (
    <div className="relative w-full max-w-lg mx-auto">
      <div className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Window bar */}
        <div className="flex items-center gap-1.5 px-4 py-3 bg-muted/60 border-b border-border">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
          <span className="ml-3 text-xs text-muted-foreground font-mono">vetsystem · dashboard</span>
        </div>

        <div className="flex h-64">
          {/* Sidebar mock */}
          <div className="w-14 bg-[rgb(13,78,70)] flex flex-col items-center py-3 gap-3 shrink-0">
            {['H','P','C','V','F'].map((l, i) => (
              <div key={i} className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold ${
                i === 0 ? 'bg-white/20 text-white' : 'text-white/50'
              }`}>{l}</div>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 p-3 space-y-2 overflow-hidden">
            <div className="grid grid-cols-3 gap-2">
              {[['Pacientes', '24', 'text-primary'], ['Citas hoy', '6', 'text-emerald-600'], ['Pendiente', '$850', 'text-amber-600']].map(([label, val, color]) => (
                <div key={label} className="bg-muted/50 rounded-xl p-2">
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className={`text-sm font-bold ${color}`}>{val}</p>
                </div>
              ))}
            </div>

            <div className="bg-muted/30 rounded-xl p-2">
              <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Citas del día</p>
              {[
                ['Luna', 'Golden R.', '9:00', 'Consulta'],
                ['Mochi', 'Persa',    '10:30','Vacuna'],
                ['Rex',  'Pastor A.','11:00','Control'],
              ].map(([name, breed, time, type]) => (
                <div key={name} className="flex items-center gap-2 py-1 border-b border-border/50 last:border-0">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                    {name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold truncate">{name} · {breed}</p>
                  </div>
                  <span className="text-[9px] text-muted-foreground shrink-0">{time}</span>
                  <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">{type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating badge */}
      <div className="absolute -bottom-3 -right-3 bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg">
        ✓ Sin internet
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="min-h-screen flex items-center pt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 w-full py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">

          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Hecho para clínicas en Nicaragua
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight">
              El sistema veterinario que{' '}
              <span className="text-primary">Nicaragua</span>{' '}
              estaba esperando
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed max-w-md">
              Gestiona pacientes, citas, inventario y cobros — aunque no tengas internet.
              Simple, rápido y diseñado para la realidad de nuestras clínicas.
            </p>

            <div className="flex flex-wrap gap-3">
              <Button size="lg" className="h-12 px-8 text-base gap-2" asChild>
                <Link href="/register">
                  Comenzar gratis
                  <ChevronRight size={16} />
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="h-12 px-8 text-base" asChild>
                <Link href="/demo">Probar demo</Link>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {['Sin tarjeta de crédito', '14 días de prueba gratis', 'Cancela cuando quieras'].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <Check size={13} className="text-primary" />
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="hidden lg:block">
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Beneficios ───────────────────────────────────────────────────────────────

const beneficios = [
  {
    icon: WifiOff,
    titulo: 'Funciona 100% sin internet',
    desc:   'Atiende pacientes, registra consultas y cobra aunque se vaya la luz o el internet. Todo se sincroniza automáticamente cuando vuelve la conexión.',
    color:  'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
  },
  {
    icon: FileText,
    titulo: 'Historial clínico completo',
    desc:   'Pacientes, consultas, vacunas, diagnósticos y recetas en un solo lugar. Encuentra todo en segundos.',
    color:  'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
  },
  {
    icon: Package,
    titulo: 'Inventario con alertas',
    desc:   'Controla tu stock de medicamentos y productos. Recibe alertas antes de quedarte sin lo esencial.',
    color:  'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
  },
  {
    icon: Receipt,
    titulo: 'Facturación instantánea',
    desc:   'Genera facturas desde la misma consulta. Lleva el control de cobros pendientes y pagados sin planillas.',
    color:  'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400',
  },
];

function Beneficios() {
  return (
    <section id="beneficios" className="py-24 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center space-y-3 mb-14">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider">Por qué elegirnos</p>
          <h2 className="text-3xl sm:text-4xl font-bold">Todo lo que tu clínica necesita</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Diseñado para la realidad de las clínicas veterinarias en Nicaragua.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {beneficios.map(({ icon: Icon, titulo, desc, color }) => (
            <div key={titulo} className="bg-card rounded-2xl p-6 border border-border shadow-sm hover:shadow-md transition-shadow space-y-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
                <Icon size={22} />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-semibold text-sm leading-snug">{titulo}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Demo / Sistema en acción ─────────────────────────────────────────────────

function PacienteMockup() {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary" />
        <span className="text-xs font-semibold">Ficha de paciente</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-xl">🐕</div>
          <div>
            <p className="font-bold text-sm">Luna</p>
            <p className="text-xs text-muted-foreground">Golden Retriever · 3 años · Hembra</p>
            <p className="text-xs text-muted-foreground">Dueño: María González</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[['Última visita', '15 jun 2026'], ['Vacunas', 'Al día ✓'], ['Peso', '28.5 kg'], ['Alergias', 'Ninguna']].map(([k, v]) => (
            <div key={k} className="bg-muted/40 rounded-xl px-3 py-2">
              <p className="text-[10px] text-muted-foreground">{k}</p>
              <p className="text-xs font-semibold">{v}</p>
            </div>
          ))}
        </div>
        <div className="bg-muted/30 rounded-xl p-2.5">
          <p className="text-[10px] font-semibold text-muted-foreground mb-1">Última consulta</p>
          <p className="text-xs">Revisión general. Sin anomalías. Se recomienda control en 6 meses.</p>
        </div>
      </div>
    </div>
  );
}

function AgendaMockup() {
  const citas = [
    { hora: '08:00', nombre: 'Mochi',   tipo: 'Vacuna',    estado: 'Atendida', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
    { hora: '09:30', nombre: 'Rex',     tipo: 'Control',   estado: 'En curso', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' },
    { hora: '10:00', nombre: 'Simba',   tipo: 'Consulta',  estado: 'Espera',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
    { hora: '11:30', nombre: 'Canela',  tipo: 'Revisión',  estado: 'Espera',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
  ];
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold">Agenda del día</span>
        </div>
        <span className="text-xs text-muted-foreground">24 jun 2026</span>
      </div>
      <div className="p-3 space-y-1.5">
        {citas.map(({ hora, nombre, tipo, estado, color }) => (
          <div key={hora} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-muted/40 transition-colors">
            <span className="text-xs font-mono text-muted-foreground w-10 shrink-0">{hora}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{nombre}</p>
              <p className="text-[10px] text-muted-foreground">{tipo}</p>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${color}`}>
              {estado}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FacturaMockup() {
  const items = [
    { desc: 'Consulta general',   qty: 1, precio: 350 },
    { desc: 'Vacuna antirrábica', qty: 1, precio: 280 },
    { desc: 'Desparasitante',     qty: 2, precio: 85  },
  ];
  const subtotal = items.reduce((s, i) => s + i.precio * i.qty, 0);
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span className="text-xs font-semibold">Factura · FAC-2026-0042</span>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Paciente: Luna G.</span>
          <span>24 jun 2026</span>
        </div>
        <div className="space-y-1">
          {items.map(({ desc, qty, precio }) => (
            <div key={desc} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
              <span className="truncate flex-1">{desc}</span>
              <span className="text-muted-foreground mx-2">x{qty}</span>
              <span className="font-semibold shrink-0">C$ {(precio * qty).toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="bg-primary/5 rounded-xl p-3 flex justify-between items-center">
          <span className="text-sm font-bold">Total</span>
          <span className="text-base font-extrabold text-primary">C$ {subtotal.toLocaleString()}</span>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 text-center bg-primary text-primary-foreground text-xs font-semibold py-2 rounded-xl">
            Marcar pagada
          </div>
          <div className="flex-1 text-center bg-muted text-muted-foreground text-xs font-semibold py-2 rounded-xl">
            Enviar
          </div>
        </div>
      </div>
    </div>
  );
}

function Demo() {
  const [tab, setTab] = useState<'paciente' | 'agenda' | 'factura'>('paciente');

  const tabs = [
    { id: 'paciente', label: 'Ficha clínica' },
    { id: 'agenda',   label: 'Agenda'        },
    { id: 'factura',  label: 'Facturación'   },
  ] as const;

  return (
    <section id="demo" className="py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center space-y-3 mb-14">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider">El sistema en acción</p>
          <h2 className="text-3xl sm:text-4xl font-bold">Diseñado para tu flujo diario</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Cada pantalla pensada para ser rápida. Sin curva de aprendizaje.
          </p>
        </div>

        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-muted rounded-xl p-1 gap-1">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === id
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-sm mx-auto">
          {tab === 'paciente' && <PacienteMockup />}
          {tab === 'agenda'   && <AgendaMockup />}
          {tab === 'factura'  && <FacturaMockup />}
        </div>
      </div>
    </section>
  );
}

// ─── Testimonios ──────────────────────────────────────────────────────────────

const testimonios = [
  {
    nombre:  'Dra. Sofía Martínez',
    clinica: 'Clínica Veterinaria Mascotas Felices · Managua',
    texto:   'Desde que empezamos a usar VetSystem el caos de papeles desapareció. Lo mejor es que si se va el internet seguimos atendiendo sin problema. Mis asistentes lo aprendieron en un día.',
    inicial: 'S',
    color:   'bg-emerald-100 text-emerald-700',
  },
  {
    nombre:  'Dr. Carlos Ibarra',
    clinica: 'Veterinaria San Francisco · León',
    texto:   'El control de inventario nos salvó varias veces. Antes se nos acababan las vacunas sin darnos cuenta. Ahora el sistema nos avisa antes de que llegue ese problema.',
    inicial: 'C',
    color:   'bg-blue-100 text-blue-700',
  },
  {
    nombre:  'Dra. Andrea López',
    clinica: 'PetCare Veterinaria · Granada',
    texto:   'La facturación directo desde la consulta es un antes y un después. Ya no perdemos cobros pendientes ni nos enredamos con las cuentas al final del día.',
    inicial: 'A',
    color:   'bg-purple-100 text-purple-700',
  },
];

function Testimonios() {
  return (
    <section className="py-24 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center space-y-3 mb-14">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider">Testimonios</p>
          <h2 className="text-3xl sm:text-4xl font-bold">Lo que dicen nuestros clientes</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonios.map(({ nombre, clinica, texto, inicial, color }) => (
            <div key={nombre} className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={14} className="fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">&ldquo;{texto}&rdquo;</p>
              <div className="flex items-center gap-3 pt-1 border-t border-border">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${color}`}>
                  {inicial}
                </div>
                <div>
                  <p className="text-sm font-semibold">{nombre}</p>
                  <p className="text-xs text-muted-foreground">{clinica}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Precios ──────────────────────────────────────────────────────────────────

const incluye = [
  'Pacientes y historial clínico ilimitados',
  'Agenda y citas',
  'Inventario con alertas de stock',
  'Facturación y control de cobros',
  'Funciona sin internet',
  'Usuarios ilimitados',
  'Actualizaciones incluidas',
  'Soporte por WhatsApp',
];

function Precios() {
  const [anual, setAnual] = useState(false);

  return (
    <section id="precios" className="py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center space-y-3 mb-12">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider">Precios</p>
          <h2 className="text-3xl sm:text-4xl font-bold">Simple y sin sorpresas</h2>
          <p className="text-muted-foreground">Un solo plan. Todo incluido.</p>

          <div className="flex items-center justify-center gap-3 pt-2">
            <span className={`text-sm font-medium ${!anual ? 'text-foreground' : 'text-muted-foreground'}`}>Mensual</span>
            <button
              onClick={() => setAnual(!anual)}
              className={`relative w-11 h-6 rounded-full transition-colors ${anual ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${anual ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className={`text-sm font-medium ${anual ? 'text-foreground' : 'text-muted-foreground'}`}>
              Anual
              <span className="ml-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">
                2 meses gratis
              </span>
            </span>
          </div>
        </div>

        <div className="max-w-sm mx-auto">
          <div className="bg-card border-2 border-primary rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-primary px-6 py-4 text-primary-foreground text-center">
              <p className="text-sm font-semibold opacity-80">Plan Completo</p>
              <div className="flex items-baseline justify-center gap-1 mt-1">
                <span className="text-4xl font-extrabold">${anual ? '12.50' : '15'}</span>
                <span className="text-sm opacity-70">USD / mes</span>
              </div>
              {anual && <p className="text-xs opacity-70 mt-1">Facturado como $150/año</p>}
            </div>

            <div className="p-6 space-y-3">
              {incluye.map((item) => (
                <div key={item} className="flex items-center gap-2.5 text-sm">
                  <Check size={16} className="text-primary shrink-0" />
                  <span>{item}</span>
                </div>
              ))}

              <div className="pt-3">
                <Button className="w-full h-11 text-base" asChild>
                  <Link href="/register">Comenzar 14 días gratis</Link>
                </Button>
                <p className="text-center text-xs text-muted-foreground mt-2">
                  Sin tarjeta de crédito · Cancela cuando quieras
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── CTA Final ────────────────────────────────────────────────────────────────

function CTAFinal() {
  return (
    <section className="py-24 bg-primary">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center space-y-6 text-primary-foreground">
        <h2 className="text-3xl sm:text-4xl font-extrabold">
          Empieza hoy. Sin complicaciones.
        </h2>
        <p className="text-primary-foreground/80 text-lg max-w-lg mx-auto">
          14 días gratis. Sin tarjeta. Sin contrato. Solo tu clínica funcionando mejor.
        </p>
        <Button
          size="lg"
          className="h-13 px-10 text-base bg-white text-primary hover:bg-white/90 font-bold shadow-lg"
          asChild
        >
          <Link href="/register">Crear mi cuenta gratis</Link>
        </Button>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer id="contacto" className="bg-muted/30 border-t border-border py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid sm:grid-cols-3 gap-8 mb-10">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">V</div>
              <span className="font-bold">VetSystem</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              El sistema de gestión veterinaria diseñado para Nicaragua.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold">Acceso</p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <Link href="/login"    className="block hover:text-foreground transition-colors">Iniciar sesión</Link>
              <Link href="/register" className="block hover:text-foreground transition-colors">Crear cuenta</Link>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold">Contacto</p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <a href="mailto:hola@vetsystem.app" className="block hover:text-foreground transition-colors">
                hola@vetsystem.app
              </a>
              <p>Managua, Nicaragua</p>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} VetSystem. Todos los derechos reservados.</p>
          <p>Hecho con ❤️ en Nicaragua</p>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <Hero />
      <Beneficios />
      <Demo />
      <Testimonios />
      <Precios />
      <CTAFinal />
      <Footer />
    </div>
  );
}
