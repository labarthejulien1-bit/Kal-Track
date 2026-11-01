import { cn, clamp } from '@/lib/utils';

export const OVER_RED = '#dc2626';

/**
 * Barre de progression. En cas de dépassement, la barre reste pleine dans sa couleur
 * et une barre rouge superposée montre la progression du dépassement (2e tour).
 */
export function Progress({ value, max, color, className, showTicks }: { value: number; max: number; color: string; className?: string; showTicks?: boolean }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const overPct = clamp(pct - 100, 0, 100);
  return (
    <div className={cn('relative h-3 w-full overflow-hidden rounded-full bg-slate-700/60', className)}>
      <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out" style={{ width: `${clamp(pct, 0, 100)}%`, background: color }} />
      {showTicks &&
        [25, 50, 75].map((t) => <span key={t} className="absolute top-0 h-full w-px bg-slate-900/70" style={{ left: `${t}%` }} />)}
      {overPct > 0 && (
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${Math.max(overPct, 3)}%`,
            background: `linear-gradient(90deg, #991b1b, ${OVER_RED} 60%, #f87171)`,
            boxShadow: '0 0 0 2px #0f172a, 0 0 8px rgba(239,68,68,.6)',
          }}
        />
      )}
    </div>
  );
}
