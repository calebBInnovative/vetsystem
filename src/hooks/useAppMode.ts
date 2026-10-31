'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { planAllowsModule } from '@/lib/billing/plans';

/** Lets the platform owner (and screenshot runs) preview app mode in a normal browser tab. */
export const APP_MODE_PREVIEW_KEY = 'vetsys-app-mode-preview';

const PHONE_QUERY = '(max-width: 1023px)';

function isInstalled(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true; // iOS Safari
  try {
    return localStorage.getItem(APP_MODE_PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
}

export interface AppMode {
  /** Native-like phone layout: installed PWA, phone-sized screen and a plan with "App móvil". */
  appMode: boolean;
  /** Installed on a phone, but the plan does not include the mobile app (upsell). */
  appModeLocked: boolean;
}

/**
 * Decides whether the dashboard renders as a phone app (bottom tabs, compact
 * header, dialogs as bottom sheets). Also marks <html data-app-mode> so plain
 * CSS (e.g. the Dialog component) can adapt without knowing about this hook.
 */
export function useAppMode(): AppMode {
  const { session } = useAuth();
  const [installedOnPhone, setInstalledOnPhone] = useState(false);

  useEffect(() => {
    const phone = window.matchMedia(PHONE_QUERY);
    const update = () => setInstalledOnPhone(isInstalled() && phone.matches);
    update();
    phone.addEventListener('change', update);
    return () => phone.removeEventListener('change', update);
  }, []);

  const allowed = planAllowsModule(session, 'mobileApp');
  const appMode = installedOnPhone && allowed;

  useEffect(() => {
    const root = document.documentElement;
    if (appMode) root.dataset.appMode = '';
    else delete root.dataset.appMode;
    return () => { delete root.dataset.appMode; };
  }, [appMode]);

  return { appMode, appModeLocked: installedOnPhone && !allowed };
}
