import { useRef } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { addDays, cn, formatDate, relativeDayLabel, startOfWeek, todayISO, haptic } from '@/lib/utils';
import { useLoggedDates } from '@/hooks/useMeals';

export function DateNavigator({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const today = todayISO();
  const weekStart = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const logged = useLoggedDates(days[0], days[6]);

  const go = (d: string) => {
    haptic(8);
    onChange(d > today ? today : d);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-3">
      <div className="flex items-center justify-between">
        <button className="rounded-full p-2 text-slate-300 hover:bg-slate-700" onClick={() => go(addDays(date, -1))} aria-label="Jour précédent">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-base font-semibold text-slate-100"
          onClick={() => inputRef.current?.showPicker?.() ?? inputRef.current?.click()}
        >
          <CalendarDays className="h-4 w-4 text-emerald-400" />
          {relativeDayLabel(date)}
          <input
            ref={inputRef}
            type="date"
            max={today}
            value={date}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="pointer-events-none absolute h-0 w-0 opacity-0 [color-scheme:dark]"
            tabIndex={-1}
          />
        </button>
        <button
          className="rounded-full p-2 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
          onClick={() => go(addDays(date, 1))}
          disabled={date >= today}
          aria-label="Jour suivant"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-1">
        <button className="p-1 text-slate-500" onClick={() => go(addDays(date, -7))} aria-label="Semaine précédente">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="grid flex-1 grid-cols-7 gap-1">
          {days.map((d) => {
            const sel = d === date;
            const future = d > today;
            return (
              <button
                key={d}
                disabled={future}
                onClick={() => go(d)}
                className={cn(
                  'flex flex-col items-center rounded-xl py-1.5 text-xs transition-colors',
                  sel ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:bg-slate-700/60',
                  future && 'opacity-30',
                  d === today && !sel && 'ring-1 ring-emerald-500/50',
                )}
              >
                <span className="uppercase">{formatDate(d, { weekday: 'narrow' })}</span>
                <span className="text-sm font-semibold">{formatDate(d, { day: 'numeric' })}</span>
                <span className={cn('mt-0.5 h-1 w-1 rounded-full', logged.has(d) ? (sel ? 'bg-slate-950' : 'bg-emerald-400') : 'bg-transparent')} />
              </button>
            );
          })}
        </div>
        <button
          className="p-1 text-slate-500 disabled:opacity-30"
          onClick={() => go(addDays(date, 7))}
          disabled={addDays(weekStart, 7) > today}
          aria-label="Semaine suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {date !== today && (
        <button onClick={() => go(today)} className="mt-2 w-full rounded-lg bg-slate-700/50 py-1.5 text-xs font-medium text-emerald-300">
          Revenir à aujourd'hui
        </button>
      )}
    </div>
  );
}
