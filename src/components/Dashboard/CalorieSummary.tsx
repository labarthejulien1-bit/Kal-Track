import { Flame, Target, UtensilsCrossed, Candy, Wheat } from 'lucide-react';
import { Ring } from '@/components/common';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { COLORS, round } from '@/lib/utils';
import type { Goals, Nutrients } from '@/types';
import { GOAL_LABELS } from '@/services/bmrCalculator';
import type { Goal } from '@/types';

export function CalorieSummary({ totals, goals, goal }: { totals: Nutrients; goals: Goals; goal: Goal }) {
  const remaining = goals.calories - totals.calories;
  const over = remaining < 0;
  return (
    <Card className="overflow-hidden p-4">
      <div className="flex items-center gap-4">
        <Ring value={totals.calories} max={goals.calories} size={156} stroke={14} color={COLORS.kcal} ticks>
          <span className="text-3xl font-bold tabular-nums text-slate-50">{round(totals.calories)}</span>
          <span className="text-[11px] text-slate-400">kcal consommées</span>
          {over && (
            <span className="mt-1 rounded-full bg-red-600/90 px-2 py-0.5 text-xs font-bold tabular-nums text-white shadow-lg shadow-red-600/30">
              +{round(-remaining)} kcal
            </span>
          )}
        </Ring>
        <div className="flex flex-1 flex-col gap-3">
          <Stat icon={<Target className="h-4 w-4" />} label="Objectif" value={goals.calories} color="#94a3b8" />
          <Stat icon={<UtensilsCrossed className="h-4 w-4" />} label={over ? 'En trop' : 'Restant'} value={round(Math.abs(remaining))} color={over ? '#ef4444' : COLORS.kcal} />
          <Stat icon={<Flame className="h-4 w-4" />} label="Progression" value={`${round((totals.calories / Math.max(1, goals.calories)) * 100)}%`} color={over ? '#ef4444' : '#fbbf24'} />
          <span className="w-fit rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] text-slate-300">{GOAL_LABELS[goal]}</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]">
        <ZoneChip label="Perte" value={goals.loseTarget} color={COLORS.lose} active={goal === 'lose'} />
        <ZoneChip label="Maintien" value={goals.maintenance} color={COLORS.maintain} active={goal === 'maintain'} />
        <ZoneChip label="Prise" value={goals.gainTarget} color={COLORS.gain} active={goal === 'gain'} />
      </div>
    </Card>
  );
}

function ZoneChip({ label, value, color, active }: { label: string; value: number; color: string; active: boolean }) {
  return (
    <div className="rounded-lg border px-2 py-1" style={{ borderColor: active ? color : '#334155', background: active ? `${color}18` : 'transparent' }}>
      <div style={{ color }} className="font-semibold">{label}</div>
      <div className="tabular-nums text-slate-300">{value} kcal</div>
    </div>
  );
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}22`, color }}>
        {icon}
      </span>
      <div className="leading-tight">
        <div className="text-[11px] text-slate-400">{label}</div>
        <div className="font-semibold tabular-nums text-slate-100">{value}</div>
      </div>
    </div>
  );
}

const MACROS = [
  { key: 'protein', label: 'Protéines', color: COLORS.protein, kcalPerG: 4 },
  { key: 'carbs', label: 'Glucides', color: COLORS.carbs, kcalPerG: 4 },
  { key: 'fat', label: 'Lipides', color: COLORS.fat, kcalPerG: 9 },
] as const;

/** Bilan du jour en barres : protéines, glucides, lipides, sucres et fibres. */
export function MacroCircles({ totals, goals }: { totals: Nutrients; goals: Goals }) {
  return (
    <Card className="p-4">
      <div className="space-y-3">
        {MACROS.map((m) => (
          <BarRow key={m.key} label={m.label} value={totals[m.key]} max={goals[m.key]} color={m.color} unit="g" />
        ))}
        <BarRow label="Sucres" icon={<Candy className="h-3.5 w-3.5" />} value={totals.sugar} max={goals.sugar} color={COLORS.sugar} unit="g" limit />
        <BarRow label="Fibres" icon={<Wheat className="h-3.5 w-3.5" />} value={totals.fiber} max={goals.fiber} color={COLORS.fiber} unit="g" />
      </div>
    </Card>
  );
}

export function BarRow({ label, value, max, color, unit, limit, icon }: { label: string; value: number; max: number; color: string; unit: string; limit?: boolean; icon?: React.ReactNode }) {
  const over = value > max;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium" style={{ color }}>
          {icon ?? <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
          {label}
          {limit && <span className="text-[10px] text-slate-500">(limite)</span>}
        </span>
        <span className="flex items-center gap-1.5 text-slate-300">
          {over && (
            <span className="rounded-full bg-red-600/90 px-1.5 py-px text-[10px] font-bold tabular-nums text-white">
              +{round(value - max, 1)} {unit}
            </span>
          )}
          <span className={over ? 'font-semibold tabular-nums text-red-400' : 'tabular-nums'}>{round(value, 1)}</span>
          <span className="text-slate-500"> / {max} {unit}</span>
        </span>
      </div>
      <Progress value={value} max={max} color={color} showTicks />
    </div>
  );
}
