export type ColorPalette = 'teal' | 'emerald' | 'indigo';
export type ThemeMode = 'light' | 'soft' | 'dark';

export interface ThemeConfig {
  name: string;
  primary: string;
  accent: string;
  label: string;
}

export const themesConfig: Record<ColorPalette, ThemeConfig> = {
  teal: { name: "Teal Profesional", primary: "#0f766e", accent: "#10b981", label: "Teal" },
  emerald: { name: "Esmeralda", primary: "#10b981", accent: "#3b82f6", label: "Esmeralda" },
  indigo: { name: "Azul Profundo", primary: "#1e40af", accent: "#14b8a6", label: "Azul" },
};