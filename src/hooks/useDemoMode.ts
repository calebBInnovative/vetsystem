'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export const TOUR_STEPS = [
  {
    targetId: 'nav-dashboard',
    titulo:   'Panel principal',
    desc:     'Un summary en tiempo real de tu clínica: appointments del día, cobros pendientes y alerts de inventario.',
  },
  {
    targetId: 'nav-patients',
    titulo:   'Gestión de patients',
    desc:     'Registra y consulta el historial completo de cada mascota. Vacunas, diagnósticos, recetas y más.',
  },
  {
    targetId: 'nav-schedule',
    titulo:   'Agenda y appointments',
    desc:     'Organiza las appointments del día. Ve, edita y confirma desde un solo lugar.',
  },
  {
    targetId: 'nav-consultations',
    titulo:   'Consultas médicas',
    desc:     'Registra consultations con diagnóstico, tratamiento y services usados. Genera la factura al finalizar.',
  },
  {
    targetId: 'nav-inventory',
    titulo:   'Inventario inteligente',
    desc:     'Controla el stock de tus products. El sistema te avisa cuando algo está por agotarse.',
  },
  {
    targetId: 'nav-finances',
    titulo:   'Finanzas',
    desc:     'Ve todos tus cobros, payments pendientes y el summary financiero del mes.',
  },
  {
    targetId: 'user-menu-trigger',
    titulo:   '¡Listo para explorar!',
    desc:     'Puedes volver a ver este tour cuando quieras desde tu menú de usuario. ¡Disfruta VetSystem!',
  },
] as const;

const LS_ACTIVE = 'demo_tour_active';
const LS_STEP   = 'demo_tour_step';

export function useDemoMode() {
  const { session } = useAuth();
  const isDemo = session?.isDemo === true;

  const [tourActive, setTourActive] = useState(false);
  const [tourStep,   setTourStep]   = useState(0);

  useEffect(() => {
    if (!isDemo) return;
    // Always restart tour from step 0 when entering demo
    setTourActive(true);
    setTourStep(0);
    localStorage.setItem(LS_ACTIVE, 'true');
    localStorage.setItem(LS_STEP, '0');
  }, [isDemo]);

  const startTour = useCallback(() => {
    setTourStep(0);
    setTourActive(true);
    localStorage.setItem(LS_ACTIVE, 'true');
    localStorage.setItem(LS_STEP, '0');
  }, []);

  const stopTour = useCallback(() => {
    setTourActive(false);
    localStorage.setItem(LS_ACTIVE, 'false');
  }, []);

  const nextStep = useCallback(() => {
    setTourStep(prev => {
      const next = prev + 1;
      if (next >= TOUR_STEPS.length) {
        setTourActive(false);
        localStorage.setItem(LS_ACTIVE, 'false');
        return prev;
      }
      localStorage.setItem(LS_STEP, String(next));
      return next;
    });
  }, []);

  const prevStep = useCallback(() => {
    setTourStep(prev => {
      const p = Math.max(0, prev - 1);
      localStorage.setItem(LS_STEP, String(p));
      return p;
    });
  }, []);

  return { isDemo, tourActive, tourStep, startTour, stopTour, nextStep, prevStep };
}
