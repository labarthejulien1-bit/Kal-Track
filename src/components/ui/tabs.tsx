import { cn } from '@/lib/utils';

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn('flex rounded-xl bg-slate-800/70 p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
            value === o.value ? 'bg-slate-950 text-emerald-400 shadow' : 'text-slate-400 hover:text-slate-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
