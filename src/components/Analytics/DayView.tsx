import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, LabelList } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMealsForDate } from '@/hooks/useMeals';
import { useProfile } from '@/hooks/useProfile';
import { COLORS, MEAL_LABELS, MEAL_TYPES, addDays, relativeDayLabel, round, todayISO } from '@/lib/utils';
import { ChartTooltip, GraduatedGauge, axisProps, gridProps } from './chartKit';

export function DayView({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const { goals } = useProfile();
  const { totals, byType, meals } = useMealsForDate(date);

  // Détail par repas : chaque barre empile les kcal issues des protéines / glucides / lipides.
  const perMeal = MEAL_TYPES.map((t) => {
    const n = byType[t].totals;
    return {
      name: MEAL_LABELS[t].replace('Petit-déjeuner', 'P.-déj'),
      Protéines: round(n.protein * 4),
      Glucides: round(n.carbs * 4),
      Lipides: round(n.fat * 9),
      kcal: round(n.calories),
      sugar: round(n.sugar, 1),
    };
  });

  const macroPie = [
    { name: 'Protéines', value: round(totals.protein * 4), grams: totals.protein, color: COLORS.protein },
    { name: 'Glucides', value: round(totals.carbs * 4), grams: totals.carbs, color: COLORS.carbs },
    { name: 'Lipides', value: round(totals.fat * 9), grams: totals.fat, color: COLORS.fat },
  ];
  const pieTotal = macroPie.reduce((s, x) => s + x.value, 0);

  // Comparaison en % de l'objectif pour chaque élément (couleurs distinctes).
  const vsGoal = [
    { name: 'Calories', pct: round((totals.calories / goals.calories) * 100), color: COLORS.kcal },
    { name: 'Protéines', pct: round((totals.protein / goals.protein) * 100), color: COLORS.protein },
    { name: 'Glucides', pct: round((totals.carbs / goals.carbs) * 100), color: COLORS.carbs },
    { name: 'Lipides', pct: round((totals.fat / goals.fat) * 100), color: COLORS.fat },
    { name: 'Sucres', pct: round((totals.sugar / goals.sugar) * 100), color: COLORS.sugar },
    { name: 'Fibres', pct: round((totals.fiber / goals.fiber) * 100), color: COLORS.fiber },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-800/40 p-2">
        <button className="rounded-full p-2 text-slate-300" onClick={() => setDate(addDays(date, -1))} aria-label="Jour précédent">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-100">{relativeDayLabel(date)}</p>
          <p className="text-[11px] text-slate-500">{meals.length} élément(s) · {round(totals.calories)} kcal</p>
        </div>
        <button className="rounded-full p-2 text-slate-300 disabled:opacity-30" disabled={date >= todayISO()} onClick={() => setDate(addDays(date, 1))} aria-label="Jour suivant">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bilan détaillé vs objectifs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <GraduatedGauge
            label="Calories"
            value={totals.calories}
            goal={goals.calories}
            unit="kcal"
            color={COLORS.kcal}
            markers={[
              { value: goals.loseTarget, color: COLORS.lose, label: 'Limite perte' },
              { value: goals.maintenance, color: COLORS.maintain, label: 'Maintien' },
              { value: goals.gainTarget, color: COLORS.gain, label: 'Limite prise' },
            ]}
          />
          <GraduatedGauge label="Protéines" value={totals.protein} goal={goals.protein} unit="g" color={COLORS.protein} />
          <GraduatedGauge label="Glucides" value={totals.carbs} goal={goals.carbs} unit="g" color={COLORS.carbs} />
          <GraduatedGauge label="Lipides" value={totals.fat} goal={goals.fat} unit="g" color={COLORS.fat} />
          <GraduatedGauge label="Sucres" value={totals.sugar} goal={goals.sugar} unit="g" color={COLORS.sugar} isLimit />
          <GraduatedGauge label="Fibres" value={totals.fiber} goal={goals.fiber} unit="g" color={COLORS.fiber} />
          <p className="text-[10px] text-slate-500">
            Trait rouge = objectif · pointillés : <span style={{ color: COLORS.lose }}>perte</span>, <span style={{ color: COLORS.maintain }}>maintien</span>, <span style={{ color: COLORS.gain }}>prise</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Atteinte des objectifs (%)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={vsGoal} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid {...gridProps} vertical={false} />
              <XAxis dataKey="name" {...axisProps} interval={0} tick={{ fill: '#94a3b8', fontSize: 9 }} />
              <YAxis {...axisProps} ticks={[0, 25, 50, 75, 100, 125, 150]} domain={[0, (max: number) => Math.max(150, max)]} unit="%" />
              <Tooltip content={<ChartTooltip unit="%" />} cursor={{ fill: '#ffffff08' }} />
              <Bar dataKey="pct" name="Objectif atteint" radius={[6, 6, 0, 0]}>
                {vsGoal.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
                <LabelList dataKey="pct" position="top" fill="#cbd5e1" fontSize={10} formatter={(v: number) => `${v}%`} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Détail par repas (kcal par macro)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={perMeal} margin={{ top: 16, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid {...gridProps} vertical={false} />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis {...axisProps} tickCount={6} unit="" />
              <Tooltip content={<ChartTooltip unit=" kcal" />} cursor={{ fill: '#ffffff08' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Protéines" stackId="a" fill={COLORS.protein} />
              <Bar dataKey="Glucides" stackId="a" fill={COLORS.carbs} />
              <Bar dataKey="Lipides" stackId="a" fill={COLORS.fat} radius={[6, 6, 0, 0]}>
                <LabelList dataKey="kcal" position="top" fill={COLORS.kcal} fontSize={10} formatter={(v: number) => (v ? `${v}` : '')} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px]">
            {perMeal.map((m) => (
              <div key={m.name} className="rounded-lg bg-slate-900/60 p-1">
                <div className="text-slate-400">{m.name}</div>
                <div className="font-semibold text-emerald-400">{m.kcal}</div>
                <div style={{ color: COLORS.sugar }}>sucres {m.sugar} g</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Répartition énergétique des macros</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="h-36 w-36 shrink-0">
            {pieTotal > 0 ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={macroPie} dataKey="value" innerRadius={42} outerRadius={64} paddingAngle={3} stroke="none">
                    {macroPie.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-full border-8 border-slate-800 text-xs text-slate-500">—</div>
            )}
          </div>
          <div className="flex-1 space-y-2">
            {macroPie.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5" style={{ color: d.color }}>
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
                  {d.name}
                </span>
                <span className="tabular-nums text-slate-300">
                  {round(d.grams)} g · {d.value} kcal · <b>{pieTotal ? round((d.value / pieTotal) * 100) : 0}%</b>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
