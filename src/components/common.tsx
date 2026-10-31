import { useEffect, useRef, useState } from 'react';
import { cn, MEAL_EMOJI, round } from '@/lib/utils';
import type { MealType } from '@/types';

/** Anneau de progression circulaire SVG avec gestion du dépassement. */
export function Ring({
  value,
  max,
  size = 120,
  stroke = 12,
  color,
  track = '#1e293b',
  children,
  ticks = false,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color: string;
  track?: string;
  children?: React.ReactNode;
  ticks?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? value / max : 0;
  const main = Math.min(pct, 1);
  const over = Math.max(0, Math.min(pct - 1, 1));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - main)}
          style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 6px ${color}55)` }}
        />
        {over > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="#ef4444"
            strokeWidth={stroke * 0.55}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - over)}
            style={{ transition: 'stroke-dashoffset .8s' }}
          />
        )}
        {ticks &&
          Array.from({ length: 20 }).map((_, i) => {
            const a = (i / 20) * 2 * Math.PI;
            const r1 = r + stroke / 2 + 3;
            const r2 = r1 + (i % 5 === 0 ? 6 : 3);
            return (
              <line
                key={i}
                x1={size / 2 + r1 * Math.cos(a)}
                y1={size / 2 + r1 * Math.sin(a)}
                x2={size / 2 + r2 * Math.cos(a)}
                y2={size / 2 + r2 * Math.sin(a)}
                stroke="#475569"
                strokeWidth={i % 5 === 0 ? 2 : 1}
              />
            );
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function Thumbnail({ src, mealType, className }: { src?: string; mealType: MealType; className?: string }) {
  const [err, setErr] = useState(false);
  return (
    <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-800 text-2xl', className)}>
      {src && !err ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setErr(true)} /> : MEAL_EMOJI[mealType]}
    </div>
  );
}

export function MacroPill({ label, value, color, unit = 'g' }: { label: string; value: number; color: string; unit?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${color}22`, color }}>
      {label} {round(value, value < 10 ? 1 : 0)}
      {unit}
    </span>
  );
}

function fmtDecimal(v: number, allowEmpty?: boolean) {
  if (!Number.isFinite(v)) return '';
  if (v === 0 && allowEmpty) return '';
  return String(v).replace('.', ',');
}

/**
 * Champ numérique compatible claviers Android français (virgule décimale).
 * - type="text" + inputMode="decimal" : la virgule est acceptée (type="number" la rejetait → valeur 0).
 * - Le texte saisi est conservé localement : le champ peut être vidé puis retapé sans être réinitialisé.
 */
export function DecimalInput({
  value,
  onValueChange,
  allowEmpty,
  className,
  ...rest
}: { value: number; onValueChange: (v: number) => void; allowEmpty?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [text, setText] = useState(fmtDecimal(value, allowEmpty));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmtDecimal(value, allowEmpty));
  }, [value, allowEmpty]);
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      enterKeyHint="done"
      value={text}
      className={className}
      onFocus={(e) => {
        focused.current = true;
        const el = e.target;
        setTimeout(() => el.select(), 0);
      }}
      onBlur={() => {
        focused.current = false;
        setText(fmtDecimal(value, allowEmpty));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.,]/g, '');
        setText(t);
        if (t === '') return onValueChange(0);
        const n = parseFloat(t.replace(',', '.'));
        if (Number.isFinite(n)) onValueChange(n);
      }}
    />
  );
}

export function NumberField({
  label,
  value,
  onChange,
  unit,
  color,
  allowEmpty,
  placeholder,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  color?: string;
  step?: number;
  min?: number;
  allowEmpty?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
          {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
          {label}
        </span>
      )}
      <div className="relative">
        <DecimalInput
          value={value}
          onValueChange={onChange}
          allowEmpty={allowEmpty}
          placeholder={placeholder}
          className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900/60 px-3 pr-10 text-base text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
        />
        {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">{unit}</span>}
      </div>
    </label>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 mt-5 flex items-center justify-between px-1">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</h2>
      {right}
    </div>
  );
}

export function NutriScoreBadge({ grade }: { grade?: string }) {
  if (!grade) return null;
  const colors: Record<string, string> = { A: '#038141', B: '#85bb2f', C: '#fecb02', D: '#ee8100', E: '#e63e11' };
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: colors[grade] ?? '#64748b' }}>
      Nutri-Score {grade}
    </span>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-700 p-6 text-center">
      <div className="text-slate-500">{icon}</div>
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {text && <p className="text-xs text-slate-500">{text}</p>}
      {action}
    </div>
  );
}
