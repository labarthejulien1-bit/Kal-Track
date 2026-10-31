import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { MEAL_COLORS, MEAL_EMOJI, MEAL_LABELS, round } from '@/lib/utils';
import type { Meal, MealType, Nutrients } from '@/types';
import { MealCard, MealSectionHeaderChevron } from './MealCard';
import { useApp } from '@/components/AppContext';

export function MealSection({ type, meals, totals, target, date }: { type: MealType; meals: Meal[]; totals: Nutrients; target: number; date: string }) {
  const { openAdd } = useApp();
  const [open, setOpen] = useState(true);
  const pct = target > 0 ? Math.min(100, (totals.calories / target) * 100) : 0;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <button className="flex flex-1 items-center gap-3 text-left" onClick={() => setOpen((o) => !o)}>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl text-xl" style={{ background: `${MEAL_COLORS[type]}22` }}>
            {MEAL_EMOJI[type]}
          </span>
          <div className="flex-1">
            <div className="flex items-center gap-1 text-sm font-semibold text-slate-100">
              {MEAL_LABELS[type]} <span className="text-slate-500"><MealSectionHeaderChevron open={open} /></span>
            </div>
            <div className="text-[11px] text-slate-400">
              <span className="font-semibold tabular-nums" style={{ color: MEAL_COLORS[type] }}>{round(totals.calories)}</span> / {round(target)} kcal
              {totals.calories > 0 && (
                <span className="ml-1 text-slate-500">
                  · P{round(totals.protein)} G{round(totals.carbs)} L{round(totals.fat)} · S{round(totals.sugar)}
                </span>
              )}
            </div>
          </div>
        </button>
        <button
          onClick={() => openAdd({ date, mealType: type, mode: 'choose' })}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
          aria-label={`Ajouter au ${MEAL_LABELS[type]}`}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
      <div className="h-0.5 bg-slate-800">
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: MEAL_COLORS[type] }} />
      </div>
      {open && meals.length > 0 && (
        <div className="space-y-2 p-2">
          {meals.map((m) => (
            <MealCard key={m.id} meal={m} />
          ))}
        </div>
      )}
    </Card>
  );
}
