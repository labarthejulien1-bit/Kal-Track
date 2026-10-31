import { PieChart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MEAL_COLORS, MEAL_EMOJI, MEAL_LABELS, MEAL_TYPES, round } from '@/lib/utils';
import type { MealType, Nutrients, Profile } from '@/types';

/** Répartition des calories de la journée entre petit-déj, déjeuner, dîner et en-cas. */
export function MealDistribution({
  byType,
  total,
  goal,
  split,
}: {
  byType: Record<MealType, { totals: Nutrients }>;
  total: number;
  goal: number;
  split: Profile['mealSplit'];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChart className="h-4 w-4 text-emerald-400" /> Répartition de la journée
        </CardTitle>
        <span className="text-xs text-slate-400">{round(total)} kcal</span>
      </CardHeader>
      <CardContent>
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-700/60">
          {MEAL_TYPES.map((t) => {
            const v = byType[t].totals.calories;
            const pct = total > 0 ? (v / total) * 100 : 0;
            return pct > 0 ? <div key={t} style={{ width: `${pct}%`, background: MEAL_COLORS[t] }} className="h-full transition-all" title={MEAL_LABELS[t]} /> : null;
          })}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {MEAL_TYPES.map((t) => {
            const v = byType[t].totals.calories;
            const pct = total > 0 ? (v / total) * 100 : 0;
            const target = (goal * split[t]) / 100;
            return (
              <div key={t} className="rounded-xl bg-slate-900/50 p-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: MEAL_COLORS[t] }} />
                  <span className="text-slate-300">{MEAL_EMOJI[t]} {MEAL_LABELS[t]}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-sm font-semibold tabular-nums text-slate-100">{round(v)} kcal</span>
                  <span className="text-[11px] text-slate-400">{round(pct)}%</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-700">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, target > 0 ? (v / target) * 100 : 0)}%`, background: v > target * 1.15 ? '#ef4444' : MEAL_COLORS[t] }} />
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">cible ≈ {round(target)} kcal ({split[t]}%)</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
