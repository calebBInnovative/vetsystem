'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { ColorPalette, themesConfig, ThemeConfig } from './theme-config';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  palette: ColorPalette;
  mode: ThemeMode;
  setPalette: (palette: ColorPalette) => void;
  toggleMode: () => void;
  currentTheme: ThemeConfig;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [palette, setPaletteState] = useState<ColorPalette>('teal');
  const [mode, setModeState] = useState<ThemeMode>('light');

  useEffect(() => {
    const savedPalette = (localStorage.getItem('vet-theme-palette') as ColorPalette) || 'teal';
    const savedMode = (localStorage.getItem('vet-theme-mode') as ThemeMode) || 'light';

    setPaletteState(savedPalette);
    setModeState(savedMode);

    // Aplicar al <html>
    document.documentElement.setAttribute('data-palette', savedPalette);
    document.documentElement.classList.toggle('dark', savedMode === 'dark');
  }, []);

  const setPalette = (newPalette: ColorPalette) => {
    setPaletteState(newPalette);
    localStorage.setItem('vet-theme-palette', newPalette);
    document.documentElement.setAttribute('data-palette', newPalette);
  };

  const toggleMode = () => {
    const newMode = mode === 'light' ? 'dark' : 'light';
    setModeState(newMode);
    localStorage.setItem('vet-theme-mode', newMode);
    document.documentElement.classList.toggle('dark', newMode === 'dark');
  };

  return (
    <ThemeContext.Provider value={{
      palette,
      mode,
      setPalette,
      toggleMode,
      currentTheme: themesConfig[palette],
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
