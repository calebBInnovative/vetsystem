'use client';

import { useTheme } from './ThemeProvider';
import { Button } from '@/components/ui/button';
import { Moon, Sun, Palette } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ThemeSwitcher() {
  const { palette, mode, setPalette, toggleMode, currentTheme } = useTheme();

  return (
    <div className="flex items-center gap-2">
      {/* Toggle Light/Dark */}
      <Button variant="outline" size="icon" onClick={toggleMode}>
        {mode === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </Button>

      {/* Selector de Paletas */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">{currentTheme.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setPalette('teal')}>
            Teal Profesional
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPalette('emerald')}>
            Esmeralda
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPalette('indigo')}>
            Azul Profundo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}