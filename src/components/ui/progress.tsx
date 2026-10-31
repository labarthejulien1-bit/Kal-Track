import { cn, clamp } from '@/lib/utils';

export function Progress({ value, max, color, className, showTicks }: { value: number; max: number; color: string; className?: string; showTicks?: boolean }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const over = pct > 100;
  return (
    <div className={cn('relative h-2.5 w-full overflow-hidden rounded-full bg-slate-700/60', className)}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${clamp(pct, 0, 100)}%`, background: over ? `repeating-linear-gradient(45deg, ${color}, ${color} 6px, #ef4444 6px, #ef4444 12px)` : color }}
      />
      {showTicks &&
        [25, 50, 75].map((t) => <span key={t} className="absolute top-0 h-full w-px bg-slate-900/70" style={{ left: `${t}%` }} />)}
    </div>
  );
}
