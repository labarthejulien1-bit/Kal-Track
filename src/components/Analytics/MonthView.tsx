import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMealsRange } from '@/hooks/useMeals';
import { useProfile } from '@/hooks/useProfile';
import { useWeights, trendSeries } from '@/hooks/useWeights';
import { COLORS, addMonths, capitalize, cn, endOfMonth, formatDate, round, startOfMonth, todayISO, fromISODate } from '@/lib/utils';
import { ChartTooltip, StatGrid, ZoneLegend, axisProps, calorieReferenceLines, gridProps, seriesStats } from './chartKit';
import { MacroWeekChart } from './WeekView';

export function MonthView({ anchor, setAnchor, onPickDay }: { anchor: string; setAnchor: (d: string) => void; onPickDay: (d: string) => void }) {
  const { goals, profile } = useProfile();
  const start = startOfMonth(anchor);
  const end = endOfMonth(anchor);
  const { days } = useMealsRange(start, end);
  const { logs } = useWeights();
  const today = todayISO();

  const kcal = seriesStats(days.map((d) => d.calories), goals.calories);
  const compliance = kcal.logged ? round((kcal.onTarget / kcal.logged) * 100) : 0;
  const logged = days.filter((d) => d.calories > 0);
  const avg = (k: 'protein' | 'carbs' | 'fat' | 'sugar') => (logged.length ? logged.reduce((s, d) => s + d[k], 0) / logged.length : 0);

  const data = days.map((d) => ({
    label: formatDate(d.date, { day: 'numeric' }),
    date: d.date,
    Calories: d.calories > 0 ? round(d.calories) : null,
    Protéines: round(d.protein, 1),
    Glucides: round(d.carbs, 1),
    Lipides: round(d.fat, 1),
    Sucres: round(d.sugar, 1),
  }));

  const trend = trendSeries(logs);
  const monthWeights = trend.filter((w) => w.date >= start && w.date <= end).map((w) => ({ label: formatDate(w.date, { day: 'numeric', month: 'short' }), Poids: w.weight, Tendance: w.trend }));
  const wFirst = monthWeights[0]?.Tendance;
  const wLast = monthWeights[monthWeights.length - 1]?.Tendance;

  // Calendrier (lundi en premier)
  const firstDow = (fromISODate(start).getDay() + 6) % 7;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-800/40 p-2">
        <button className="rounded-full p-2 text-slate-300" onClick={() => setAnchor(addMonths(start, -1))} aria-label="Mois précédent">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-sm font-semibold text-slate-100">{capitalize(formatDate(start, { month: 'long', year: 'numeric' }))}</p>
        <button className="rounded-full p-2 text-slate-300 disabled:opacity-30" disabled={addMonths(start, 1) > today} onClick={() => setAnchor(addMonths(start, 1))} aria-label="Mois suivant">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <StatGrid
        items={[
          { label: 'Conformité', value: `${compliance}%`, sub: `${kcal.onTarget}/${kcal.logged} jours ± 10 %`, color: compliance >= 70 ? COLORS.kcal : compliance >= 40 ? COLORS.carbs : COLORS.fat },
          { label: 'Moyenne / jour', value: round(kcal.avg), sub: `kcal · objectif ${goals.calories}`, color: COLORS.kcal },
          { label: 'Jours suivis', value: `${kcal.logged}`, sub: `sur ${days.filter((d) => d.date <= today).length}` },
          {
            label: 'Poids (tendance)',
            value: wLast !== undefined ? `${wLast} kg` : '—',
            sub: wFirst !== undefined && wLast !== undefined ? `${wLast - wFirst > 0 ? '+' : ''}${round(wLast - wFirst, 1)} kg ce mois` : 'Aucune pesée',
            color: COLORS.water,
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Calendrier de conformité</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-500">
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
            {Array.from({ length: firstDow }).map((_, i) => (
              <span key={`e${i}`} />
            ))}
            {days.map((d) => {
              const pct = d.calories / goals.calories;
              const color = d.calories === 0 ? '#1e293b' : Math.abs(pct - 1) <= 0.1 ? COLORS.kcal : pct < 0.9 ? COLORS.lose : '#f43f5e';
              return (
                <button
                  key={d.date}
                  disabled={d.date > today}
                  onClick={() => onPickDay(d.date)}
                  className={cn('aspect-square rounded-lg text-[11px] font-medium text-slate-100 disabled:opacity-30', d.date === today && 'ring-1 ring-white/60')}
                  style={{ background: d.calories ? `${color}cc` : color }}
                  title={`${round(d.calories)} kcal`}
                >
                  {Number(d.date.slice(8))}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-center gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: COLORS.lose }} /> Sous l'objectif</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: COLORS.kcal }} /> Cible ± 10 %</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-500" /> Au-dessus</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Évolution calorique</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={data} margin={{ top: 10, right: 6, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="kcalFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.kcal} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={COLORS.kcal} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} vertical={false} />
              <XAxis dataKey="label" {...axisProps} interval={2} />
              <YAxis {...axisProps} tickCount={8} domain={[0, (max: number) => Math.ceil(Math.max(max, goals.gainTarget) * 1.1 / 100) * 100]} />
              <Tooltip content={<ChartTooltip unit=" kcal" />} />
              <Area dataKey="Calories" stroke={COLORS.kcal} fill="url(#kcalFill)" strokeWidth={2} connectNulls type="monotone" dot={{ r: 2 }} />
              {calorieReferenceLines(goals)}
            </ComposedChart>
          </ResponsiveContainer>
          <ZoneLegend />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suivi du poids</CardTitle>
          <span className="text-[11px] text-slate-400">cible {profile.targetWeight} kg</span>
        </CardHeader>
        <CardContent>
          {monthWeights.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={monthWeights} margin={{ top: 10, right: 6, left: -14, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} domain={[(min: number) => Math.floor(Math.min(min, profile.targetWeight) - 1), (max: number) => Math.ceil(max + 1)]} unit="kg" tickCount={6} />
                <Tooltip content={<ChartTooltip unit=" kg" />} />
                <Line dataKey="Poids" stroke="#64748b" strokeWidth={0} dot={{ r: 3, fill: '#94a3b8' }} />
                <Line dataKey="Tendance" stroke={COLORS.water} strokeWidth={2.5} dot={false} type="monotone" />
                <ReferenceLine y={profile.targetWeight} stroke={COLORS.kcal} strokeDasharray="5 4" label={{ value: 'Cible', fill: COLORS.kcal, fontSize: 9, position: 'insideBottomRight' }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-6 text-center text-xs text-slate-500">Aucune pesée ce mois-ci. Ajoute ton poids dans l'onglet Poids.</p>
          )}
        </CardContent>
      </Card>

      <MacroWeekChart data={data} dataKey="Protéines" color={COLORS.protein} goal={goals.protein} avg={avg('protein')} height={130} />
      <MacroWeekChart data={data} dataKey="Glucides" color={COLORS.carbs} goal={goals.carbs} avg={avg('carbs')} height={130} />
      <MacroWeekChart data={data} dataKey="Lipides" color={COLORS.fat} goal={goals.fat} avg={avg('fat')} height={130} />
      <MacroWeekChart data={data} dataKey="Sucres" color={COLORS.sugar} goal={goals.sugar} avg={avg('sugar')} height={130} limit />
    </div>
  );
}
