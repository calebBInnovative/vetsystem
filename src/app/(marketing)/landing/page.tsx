'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeSwitcher } from '@/components/themes/ThemeSwitcher';
import {
  WifiOff, FileText, Package, Receipt,
  ChevronRight, Menu, X, Check,
  Stethoscope, CalendarDays, ShoppingCart, ClipboardList, Wallet, Megaphone,
  MessageCircle, BarChart3, FileUp, Users, Smartphone, Bell,
} from 'lucide-react';
import { VetSystemIcon, VetSystemWordmark, PAW_BG_WHITE } from '@/components/common/VetSystemLogo';
import { PricingPlans } from '@/components/marketing/PricingPlans';
import { WhatsAppButton } from '@/components/marketing/WhatsAppButton';
import { Testimonials } from '@/components/marketing/Testimonials';
import { Faq } from '@/components/marketing/Faq';
import { OfflineDay } from '@/components/marketing/OfflineDay';
import { SiteFooter } from '@/components/marketing/SiteFooter';
import { ProductTour } from '@/components/marketing/ProductTour';
import { BrowserFrame, PhoneFrame } from '@/components/marketing/DeviceFrames';
import { useLandingContent } from '@/hooks/useLandingContent';
import { DEFAULT_HERO, splitHeroTitle } from '@/lib/marketing/landing';
import { cn } from '@/lib/utils';

// ─── Navbar ──────────────────────────────────────────────────────────────────

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-background/80 backdrop-blur-md shadow-sm border-b border-border' : 'bg-transparent'
      }`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

        <Link href="/landing" className="flex items-center gap-2.5">
          <VetSystemIcon size={32} />
          <VetSystemWordmark size="base" />
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-muted-foreground">
          <a href="#beneficios" className="hover:text-foreground transition-colors">Beneficios</a>
          <a href="#demo" className="hover:text-foreground transition-colors">El sistema</a>
          <a href="#precios" className="hover:text-foreground transition-colors">Precios</a>
          <a href="#preguntas" className="hover:text-foreground transition-colors">Preguntas</a>
          <a href="#contacto" className="hover:text-foreground transition-colors">Contacto</a>
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
          {[['#beneficios', 'Beneficios'], ['#demo', 'El sistema'], ['#precios', 'Precios'], ['#preguntas', 'Preguntas'], ['#contacto', 'Contacto']].map(([href, label]) => (
            <a
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {label}
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

function Hero() {
  const content = useLandingContent();
  const hero = content?.hero ?? DEFAULT_HERO;
  // A slow connection gets the default copy rather than an empty hero.
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 1500); return () => clearTimeout(t); }, []);
  const [before, highlight, after] = splitHeroTitle(hero);

  return (
    <section className="min-h-screen flex items-center pt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 w-full py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">

          {/* Default copy is in the static HTML (SEO); it fades in once the saved copy has loaded. */}
          <div className={cn('space-y-8 transition-opacity duration-300', content || slow ? 'opacity-100' : 'opacity-0')}>
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              {hero.badge}
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight">
              {before}<span className="text-primary">{highlight}</span>{after}
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed max-w-md">
              {hero.subtitle}
            </p>

            <div className="flex flex-wrap gap-3">
              <Button size="lg" className="h-12 px-8 text-base gap-2" asChild>
                <Link href="/register">
                  {hero.primaryCta}
                  <ChevronRight size={16} />
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="h-12 px-8 text-base" asChild>
                <Link href="/demo">{hero.secondaryCta}</Link>
              </Button>
            </div>

            {hero.trustPoints.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {hero.trustPoints.map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <Check size={13} className="text-primary" />
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Real screens of the demo clinic (public/landing/screens/) */}
          <div className="relative pb-10 lg:pb-0 lg:pl-6">
            <BrowserFrame src="dashboard.webp" darkSrc="dashboard-dark.webp" priority
              alt="Panel de control de VetSystem con las citas de hoy y las últimas consultas" />
            <PhoneFrame src="mobile-dashboard.webp" priority alt="VetSystem en el celular"
              className="absolute -bottom-4 -left-3 sm:-left-6 w-24 sm:w-32 lg:-bottom-16 lg:-left-10" />
            <div className="absolute -top-4 right-3 sm:-right-4 flex items-center gap-2 rounded-full bg-card border border-border shadow-lg px-3.5 py-2 text-xs font-semibold">
              <span className="flex w-5 h-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                <Check size={12} strokeWidth={3} />
              </span>
              Guardado sin internet
            </div>
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
    titulo: 'Permite funcionar sin internet',
    desc: 'Atiende pacientes, registra consultas y cobra aunque se vaya la luz o el internet. Todo se sincroniza automáticamente cuando vuelve la conexión.',
    color: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
  },
  {
    icon: FileText,
    titulo: 'Historial clínico completo',
    desc: 'Pacientes, consultas, vacunas, diagnósticos y recetas en un solo lugar. Encuentra todo en segundos.',
    color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
  },
  {
    icon: Package,
    titulo: 'Inventario con alertas',
    desc: 'Controla tu stock de medicamentos y productos. Recibe alertas antes de quedarte sin lo esencial.',
    color: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
  },
  {
    icon: Receipt,
    titulo: 'Facturación instantánea',
    desc: 'Genera facturas desde la misma consulta. Lleva el control de cobros pendientes y pagados sin planillas.',
    color: 'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400',
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

// ─── Módulos ──────────────────────────────────────────────────────────────────

const modules = [
  { icon: Stethoscope,   title: 'Consultas y expediente', desc: 'Historial, vacunas, diagnósticos y recetas por paciente.' },
  { icon: CalendarDays,  title: 'Agenda de citas',        desc: 'Citas del día, estados y recordatorios antes de cada cita.' },
  { icon: ShoppingCart,  title: 'Ventas (POS)',           desc: 'Cobra productos y servicios en segundos, con recibo impreso.' },
  { icon: ClipboardList, title: 'Cotizaciones',           desc: 'Envía presupuestos y conviértelos en venta con un clic.' },
  { icon: Package,       title: 'Inventario',             desc: 'Stock en tiempo real y alertas de productos por agotarse.' },
  { icon: Receipt,       title: 'Facturas y cobros',      desc: 'Facturas desde la consulta y control de lo pendiente.' },
  { icon: Wallet,        title: 'Finanzas y gastos',      desc: 'Ingresos, gastos fijos y pagos a colaboradores.' },
  { icon: BarChart3,     title: 'Reportes',               desc: 'Ventas por método de pago, capital en inventario y más.' },
  { icon: Megaphone,     title: 'Promociones',            desc: 'Descuentos y campañas para traer de vuelta a tus clientes.' },
  { icon: MessageCircle, title: 'Marketing por WhatsApp', desc: 'Mensajes a tus clientes directo desde el sistema.' },
  { icon: Users,         title: 'Usuarios y permisos',    desc: 'Roles para administración, veterinarios y recepción.' },
  { icon: FileUp,        title: 'Importar desde Excel',   desc: 'Sube tu catálogo de productos y servicios sin teclearlo.' },
  { icon: Smartphone,    title: 'Computadora y celular',  desc: 'Sin instalar nada; agrégalo como app si lo prefieres.' },
  { icon: Bell,          title: 'Alertas',                desc: 'Avisos de stock bajo y de citas próximas.' },
  { icon: WifiOff,       title: 'Sin internet',           desc: 'Todo sigue funcionando; se sincroniza al volver la conexión.' },
];

function Modulos() {
  return (
    <section id="modulos" className="py-24 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center space-y-3 mb-14">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider">Todo lo que incluye</p>
          <h2 className="text-3xl sm:text-4xl font-bold">Un solo sistema para toda tu clínica</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Desde la consulta hasta la caja. Sin hojas de Excel ni cuadernos.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-3.5 bg-card rounded-xl p-4 border border-border">
              <div className="w-10 h-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Icon size={20} />
              </div>
              <div className="space-y-0.5">
                <h3 className="font-semibold text-sm">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Algunos módulos dependen del plan. <a href="#precios" className="text-primary font-medium hover:underline">Compara los planes</a>.
        </p>
      </div>
    </section>
  );
}

// ─── CTA Final ────────────────────────────────────────────────────────────────

function CTAFinal() {
  return (
    <section className="py-24 bg-primary" style={PAW_BG_WHITE}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center space-y-6 text-primary-foreground">
        <h2 className="text-3xl sm:text-4xl font-extrabold">
          Empieza hoy. Sin complicaciones.
        </h2>
        <p className="text-primary-foreground/80 text-lg max-w-lg mx-auto">
          7 días gratis. Sin tarjeta. Sin contrato. Solo tu clínica funcionando mejor.
        </p>
        <Button
          size="lg"
          className="h-13 px-10 text-base bg-white text-primary hover:bg-white/90 font-bold shadow-lg"
          asChild
        >
          <Link href="/register">Crear mi cuenta gratis</Link>
        </Button>
        <p className="text-sm text-primary-foreground/80">
          ¿Prefieres verlo primero?{' '}
          <Link href="/demo" className="font-semibold underline underline-offset-4 hover:text-primary-foreground">
            Prueba el demo
          </Link>
        </p>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <Hero />
      <OfflineDay />
      <Beneficios />
      <ProductTour />
      <Modulos />
      <PricingPlans />
      <Testimonials />
      <Faq />
      <CTAFinal />
      <SiteFooter />
      <WhatsAppButton />
    </div>
  );
}
