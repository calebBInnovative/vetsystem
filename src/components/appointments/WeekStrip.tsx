'use client';

import { addDays, format, isToday, parseISO, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMonthlyAppointments } from '@/hooks/useAppointments';
import { cn } from '@/lib/utils';

/**
 * Phone-app week strip for the schedule: seven tappable days with a dot per
 * day that has appointments, instead of the full month grid.
 */
export function WeekStrip({ fecha, onFechaChange, className }: {
  /** Selected day, YYYY-MM-DD */
  fecha: string;
  onFechaChange: (fecha: string) => void;
  className?: string;
}) {
  const selected = parseISO(fecha);
  const monday = startOfWeek(selected, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const sunday = days[6];

  // A week can span two months: count both.
  const first = useMonthlyAppointments(monday.getFullYear(), monday.getMonth());
  const second = useMonthlyAppointments(sunday.getFullYear(), sunday.getMonth());
  const count = (iso: string) => first.get(iso) ?? second.get(iso) ?? 0;

  const shift = (weeks: number) => onFechaChange(format(addDays(selected, weeks * 7), 'yyyy-MM-dd'));

  return (
    <div className={cn('bg-card rounded-2xl border border-border p-3 space-y-2', className)}>
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-semibold first-letter:uppercase">{format(selected, 'MMMM yyyy', { locale: es })}</p>
        <div className="flex gap-1">
          <button type="button" aria-label="Semana anterior" onClick={() => shift(-1)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground active:bg-muted">
            <ChevronLeft size={18} />
          </button>
          <button type="button" aria-label="Semana siguiente" onClick={() => shift(1)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground active:bg-muted">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const iso = format(d, 'yyyy-MM-dd');
          const active = iso === fecha;
          const n = count(iso);
          return (
            <button key={iso} type="button" onClick={() => onFechaChange(iso)}
              className={cn('flex flex-col items-center gap-0.5 rounded-xl py-2 min-h-16 transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'active:bg-muted')}>
              <span className={cn('text-[11px] font-medium uppercase', active ? 'opacity-90' : 'text-muted-foreground')}>
                {format(d, 'EEEEE', { locale: es })}
              </span>
              <span className={cn('text-base font-bold', !active && isToday(d) && 'text-primary')}>{format(d, 'd')}</span>
              <span className={cn('h-1.5 w-1.5 rounded-full', n === 0 ? 'opacity-0' : active ? 'bg-primary-foreground' : 'bg-primary')} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
