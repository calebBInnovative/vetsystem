'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'vetsys-pwa-dismissed';

export function usePWAInstall() {
  const [prompt,      setPrompt]      = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS,       setIsIOS]       = useState(false);
  const [dismissed,   setDismissed]   = useState(false);

  useEffect(() => {
    // Already running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // iOS detection (no beforeinstallprompt support — show manual instructions)
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !('MSStream' in window));

    // User previously dismissed
    if (localStorage.getItem(DISMISSED_KEY) === 'true') {
      setDismissed(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Mark as installed if appinstalled fires
    const installed = () => setIsInstalled(true);
    window.addEventListener('appinstalled', installed);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setPrompt(null);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  }

  // Show when: not installed, not dismissed, and either Chrome gives us the prompt OR it's iOS
  const showBanner = !isInstalled && !dismissed && (prompt !== null || isIOS);

  return {
    install,
    dismiss,
    showBanner,
    isIOS,
    canDirectInstall: prompt !== null,
  };
}
