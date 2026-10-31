import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMealsRange } from '@/hooks/useMeals';
import { useProfile } from '@/hooks/useProfile';
import { COLORS, addDays, capitalize, formatDate, round, startOfWeek, todayISO } from '@/lib/utils';
import { ChartTooltip, StatGrid, ZoneLegend, axisProps, calorieReferenceLines, gridProps, seriesStats } from './chartKit';

export function WeekView({ anchor, setAnchor }: { anchor: string; setAnchor: (d: string) => void }) {
  const { goals } = useProfile();
  const start = startOfWeek(anchor);
  const end = addDays(start, 6);
  const { days } = useMealsRange(start, end);
  const today = todayISO();

  const data = days.map((d) => ({
    label: capitalize(formatDate(d.date, { weekday: 'short' }).replace('.', '')),
    date: d.date,
    Calories: d.date > today ? null : round(d.calories),
    'P (kcal)': round(d.protein * 4),
    'G (kcal)': round(d.carbs * 4),
    'L (kcal)': round(d.fat * 9),
    Protéines: round(d.protein, 1),
    Glucides: round(d.carbs, 1),
    Lipides: round(d.fat, 1),
    Sucres: round(d.sugar, 1),
    future: d.date > today,
  }));

  const kcal = seriesStats(days.map((d) => d.calories), goals.calories);
  const loggedDays = days.filter((d) => d.calories > 0);
  const avg = (k: 'protein' | 'carbs' | 'fat' | 'sugar') => (loggedDays.length ? loggedDays.reduce((s, d) => s + d[k], 0) / loggedDays.length : 0);
  const weekBalance = loggedDays.reduce((s, d) => s + (d.calories - goals.maintenance), 0);
  const yMax = Math.max(goals.gainTarget, ...days.map((d) => d.calories)) * 1.1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-800/40 p-2">
        <button className="rounded-full p-2 text-slate-300" onClick={() => setAnchor(addDays(start, -7))} aria-label="Semaine précédente">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-sm font-semibold text-slate-100">
          {formatDate(start, { day: 'numeric', month: 'short' })} – {formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
        <button className="rounded-full p-2 text-slate-300 disabled:opacity-30" disabled={addDays(start, 7) > today} onClick={() => setAnchor(addDays(start, 7))} aria-label="Semaine suivante">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <StatGrid
        items={[
          { label: 'Moyenne / jour', value: `${round(kcal.avg)}`, sub: `kcal · ${round(kcal.pctGoal)}% objectif`, color: COLORS.kcal },
          { label: 'Jours dans la cible', value: `${kcal.onTarget}/${kcal.logged}`, sub: '± 10 % de l’objectif' },
          { label: 'Min / Max', value: `${round(kcal.min)} – ${round(kcal.max)}`, sub: 'kcal' },
          { label: 'Bilan vs maintien', value: `${weekBalance > 0 ? '+' : ''}${round(weekBalance)}`, sub: `≈ ${weekBalance > 0 ? '+' : ''}${round(weekBalance / 7700, 2)} kg`, color: weekBalance > 0 ? COLORS.gain : COLORS.lose },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Calories consommées vs objectif</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data} margin={{ top: 10, right: 6, left: -10, bottom: 0 }}>
              <CartesianGrid {...gridProps} vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} domain={[0, round(yMax, -2)]} tickCount={8} />
              <Tooltip content={<ChartTooltip unit=" kcal" />} cursor={{ fill: '#ffffff08' }} />
              <Bar dataKey="Calories" radius={[6, 6, 0, 0]}>
                {data.map((d) => (
                  <Cell key={d.date} fill={(d.Calories ?? 0) > goals.calories * 1.1 ? '#f43f5e' : (d.Calories ?? 0) >= goals.calories * 0.9 ? COLORS.kcal : '#34d39988'} />
                ))}
              </Bar>
              {calorieReferenceLines(goals)}
            </ComposedChart>
          </ResponsiveContainer>
          <ZoneLegend />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Détail quotidien : calories, protéines, glucides, lipides</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data} margin={{ top: 10, right: 6, left: -10, bottom: 0 }}>
              <CartesianGrid {...gridProps} vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} tickCount={8} />
              <Tooltip content={<ChartTooltip unit=" kcal" />} cursor={{ fill: '#ffffff08' }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="P (kcal)" name="Protéines" stackId="m" fill={COLORS.protein} />
              <Bar dataKey="G (kcal)" name="Glucides" stackId="m" fill={COLORS.carbs} />
              <Bar dataKey="L (kcal)" name="Lipides" stackId="m" fill={COLORS.fat} radius={[6, 6, 0, 0]} />
              <Line dataKey="Calories" stroke={COLORS.kcal} strokeWidth={2.5} dot={{ r: 3, fill: COLORS.kcal }} type="monotone" />
              <ReferenceLine y={goals.calories} stroke={COLORS.target} strokeWidth={1.5} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="mt-1 text-center text-[10px] text-slate-500">Barres empilées = énergie issue de chaque macro · ligne verte = calories totales</p>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        <MacroWeekChart data={data} dataKey="Protéines" color={COLORS.protein} goal={goals.protein} avg={avg('protein')} />
        <MacroWeekChart data={data} dataKey="Glucides" color={COLORS.carbs} goal={goals.carbs} avg={avg('carbs')} />
        <MacroWeekChart data={data} dataKey="Lipides" color={COLORS.fat} goal={goals.fat} avg={avg('fat')} />
        <MacroWeekChart data={data} dataKey="Sucres" color={COLORS.sugar} goal={goals.sugar} avg={avg('sugar')} limit />
      </div>
    </div>
  );
}

export function MacroWeekChart({ data, dataKey, color, goal, avg, limit, height = 150 }: { data: object[]; dataKey: string; color: string; goal: number; avg: number; limit?: boolean; height?: number }) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle style={{ color }}>{dataKey}</CardTitle>
        <span className="text-[11px] text-slate-400">
          moy. <b className="text-slate-200">{round(avg, 1)} g</b> · {limit ? 'limite' : 'objectif'} {goal} g ·{' '}
          <b style={{ color: limit ? (avg > goal ? '#f43f5e' : '#10b981') : Math.abs(avg - goal) <= goal * 0.1 ? '#10b981' : '#f59e0b' }}>{goal ? round((avg / goal) * 100) : 0}%</b>
        </span>
      </CardHeader>
      <CardContent className="pt-2">
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={data} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
            <CartesianGrid {...gridProps} vertical={false} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} tickCount={5} domain={[0, (max: number) => Math.ceil(Math.max(max, goal * 1.25) / 10) * 10]} unit="g" />
            <Tooltip content={<ChartTooltip unit=" g" />} cursor={{ fill: '#ffffff08' }} />
            <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
            <ReferenceLine y={goal} stroke={COLORS.target} strokeDasharray={limit ? '4 3' : undefined} label={{ value: `${goal} g`, fill: COLORS.target, fontSize: 9, position: 'insideTopRight' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
