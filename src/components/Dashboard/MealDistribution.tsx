import { PieChart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MEAL_COLORS, MEAL_EMOJI, MEAL_LABELS, MEAL_TYPES, round } from '@/lib/utils';
import type { MealType, Nutrients, Profile } from '@/types';
import { t } from '@/i18n';

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
          <PieChart className="h-4 w-4 text-emerald-400" /> {t('Répartition de la journée')}
        </CardTitle>
        <span className="text-xs text-slate-400">{round(total)} kcal</span>
      </CardHeader>
      <CardContent>
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-700/60">
          {MEAL_TYPES.map((mt) => {
            const v = byType[mt].totals.calories;
            const pct = total > 0 ? (v / total) * 100 : 0;
            return pct > 0 ? <div key={mt} style={{ width: `${pct}%`, background: MEAL_COLORS[mt] }} className="h-full transition-all" title={MEAL_LABELS[mt]} /> : null;
          })}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {MEAL_TYPES.map((mt) => {
            const v = byType[mt].totals.calories;
            const target = (goal * split[mt]) / 100;
            // % atteint du budget calorique de ce repas
            const pctTarget = target > 0 ? (v / target) * 100 : 0;
            const tColor = pctTarget > 100 ? '#f87171' : '#34d399';
            return (
              <div key={mt} className="rounded-xl bg-slate-900/50 p-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: MEAL_COLORS[mt] }} />
                  <span className="text-slate-300">{MEAL_EMOJI[mt]} {MEAL_LABELS[mt]}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-sm font-semibold tabular-nums text-slate-100">{round(v)} kcal</span>
                  <span className="rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums" style={{ color: tColor, background: `${tColor}22` }} title={t('% du budget de ce repas')}>
                    {round(pctTarget)}%
                  </span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-700">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, target > 0 ? (v / target) * 100 : 0)}%`, background: v > target ? '#ef4444' : MEAL_COLORS[mt] }} />
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  {t('cible')} {round(target)} kcal
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
