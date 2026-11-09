import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Sheet } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface PickerOption<T extends string> {
  value: T;
  label: React.ReactNode;
  hint?: React.ReactNode;
  badge?: React.ReactNode;
}

/**
 * Liste de choix moderne : bouton qui ouvre une feuille avec des cartes d'options
 * (remplace la liste déroulante native, d'aspect daté sur Android).
 */
export function Picker<T extends string>({
  value,
  onChange,
  options,
  title,
  className,
  compact,
}: {
  value: T;
  onChange: (v: T) => void;
  options: PickerOption<T>[];
  title?: React.ReactNode;
  className?: string;
  /** Bouton réduit (une ligne, sans description) pour les petites colonnes. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        style={{ backgroundColor: 'var(--c-input)' }}
        className={cn(
          'flex min-h-11 w-full items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-left transition-colors hover:border-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60',
          className,
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-100">{current?.label ?? '—'}</span>
          {!compact && current?.hint && <span className="block truncate text-xs text-slate-400">{current.hint}</span>}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div role="listbox" className="flex flex-col gap-2 pb-2">
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.99]',
                  active ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-800/40 hover:border-slate-600',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className={cn('flex items-center gap-2 text-sm font-semibold', active ? 'text-emerald-300' : 'text-slate-100')}>
                    {o.label}
                    {o.badge && <span className="rounded-full bg-slate-700/70 px-2 py-0.5 text-[10px] font-semibold text-slate-300">{o.badge}</span>}
                  </span>
                  {o.hint && <span className="mt-0.5 block text-xs leading-snug text-slate-400">{o.hint}</span>}
                </span>
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    active ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-600',
                  )}
                >
                  {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
