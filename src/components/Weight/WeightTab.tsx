import { useMemo, useState } from 'react';
import { Scale, Trash2, Pencil, TrendingDown, TrendingUp, Minus, Plus, Target, Brain } from 'lucide-react';
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Area } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { SegmentedTabs } from '@/components/ui/tabs';
import { EmptyState } from '@/components/common';
import { useToast } from '@/components/ui/toast';
import { useProfile } from '@/hooks/useProfile';
import { deleteWeight, trendSeries, upsertWeight, useWeights } from '@/hooks/useWeights';
import { useMealsRange } from '@/hooks/useMeals';
import { adaptiveTdee, bmiCategory } from '@/services/bmrCalculator';
import { COLORS, addDays, daysBetween, formatDate, haptic, round, todayISO, capitalize } from '@/lib/utils';
import { ChartTooltip, axisProps, gridProps } from '@/components/Analytics/chartKit';
import { db } from '@/db/database';

type Range = '1M' | '3M' | '6M' | '1A' | 'Tout';
const RANGE_DAYS: Record<Range, number> = { '1M': 30, '3M': 91, '6M': 182, '1A': 365, Tout: 100000 };

export function WeightTab() {
  const { profile, goals } = useProfile();
  const { logs } = useWeights();
  const toast = useToast();
  const today = todayISO();
  const last = logs[logs.length - 1];

  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState<string>('');
  const [note, setNote] = useState('');
  const [range, setRange] = useState<Range>('3M');

  const currentValue = weight === '' ? (last?.weight ?? profile.weight) : parseFloat(weight.replace(',', '.'));

  const save = async () => {
    const w = currentValue;
    if (!w || w < 20 || w > 400) return toast('Poids invalide', 'error');
    await upsertWeight(date, round(w, 1), note || undefined);
    haptic(25);
    toast(`Poids enregistré pour ${date === today ? "aujourd'hui" : formatDate(date, { day: 'numeric', month: 'long' })}`);
    setWeight('');
    setNote('');
  };

  const bump = (d: number) => setWeight(String(round(currentValue + d, 1)));

  const trend = useMemo(() => trendSeries(logs), [logs]);
  const from = addDays(today, -RANGE_DAYS[range]);
  const chartData = trend
    .filter((t) => t.date >= from)
    .map((t) => ({ label: formatDate(t.date, { day: 'numeric', month: 'short' }), date: t.date, Poids: t.weight, Tendance: t.trend }));

  // Projection par régression linéaire sur la tendance des 30 derniers jours.
  const projection = useMemo(() => {
    const recent = trend.filter((t) => t.date >= addDays(today, -30));
    if (recent.length < 3) return null;
    const xs = recent.map((t) => daysBetween(recent[0].date, t.date));
    const ys = recent.map((t) => t.trend);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    if (!den) return null;
    const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / den; // kg/jour
    const remaining = profile.targetWeight - recent[recent.length - 1].trend;
    const perWeek = slope * 7;
    let eta: string | null = null;
    if (Math.abs(remaining) > 0.1 && Math.sign(remaining) === Math.sign(slope) && Math.abs(slope) > 0.002) {
      eta = addDays(today, Math.round(remaining / slope));
    }
    return { perWeek, eta };
  }, [trend, today, profile.targetWeight]);

  // TDEE adaptatif (28 derniers jours)
  const winStart = addDays(today, -27);
  const { days: intakeDays } = useMealsRange(winStart, today);
  const adaptive = useMemo(() => {
    const inWin = trend.filter((t) => t.date >= winStart);
    if (inWin.length < 2) return null;
    const span = daysBetween(inWin[0].date, inWin[inWin.length - 1].date);
    return adaptiveTdee(
      intakeDays.filter((d) => d.date >= inWin[0].date),
      inWin[0].trend,
      inWin[inWin.length - 1].trend,
      span,
    );
  }, [trend, intakeDays, winStart]);

  const first = logs[0];
  const latestTrend = trend[trend.length - 1]?.trend;
  const bmi = last ? last.weight / (profile.height / 100) ** 2 : goals.bmi;
  const cat = bmiCategory(bmi);
  const totalChange = first && last ? last.weight - first.weight : 0;
  const toGo = last ? profile.targetWeight - last.weight : 0;
  const progressPct = first && last && first.weight !== profile.targetWeight ? Math.max(0, Math.min(100, ((first.weight - last.weight) / (first.weight - profile.targetWeight)) * 100)) : 0;

  const reversed = [...logs].reverse();

  return (
    <div className="space-y-3">
      <h1 className="pt-1 text-lg font-bold text-slate-50">Poids</h1>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Scale className="h-4 w-4 text-sky-400" /> Nouvelle pesée
        </div>
        <div className="flex items-center justify-center gap-3">
          <button className="rounded-full bg-slate-700/70 p-3" onClick={() => bump(-0.1)} aria-label="-0,1 kg">
            <Minus className="h-5 w-5" />
          </button>
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={weight === '' ? round(currentValue, 1) : weight}
              onChange={(e) => setWeight(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="w-36 bg-transparent text-center text-4xl font-bold tabular-nums text-slate-50 focus:outline-none"
            />
            <span className="absolute -right-4 bottom-2 text-sm text-slate-400">kg</span>
          </div>
          <button className="rounded-full bg-slate-700/70 p-3" onClick={() => bump(0.1)} aria-label="+0,1 kg">
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <Label>Date</Label>
            <Input type="date" max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
          <div>
            <Label>Note (optionnel)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="à jeun, après sport…" />
          </div>
        </div>
        <Button className="mt-3 w-full" onClick={save}>
          Enregistrer {logs.some((l) => l.date === date) && '(remplacer)'}
        </Button>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Actuel" value={last ? `${last.weight} kg` : '—'} sub={latestTrend ? `tendance ${latestTrend} kg` : undefined} color={COLORS.water} />
        <MiniStat
          label="Évolution totale"
          value={`${totalChange > 0 ? '+' : ''}${round(totalChange, 1)} kg`}
          sub={first ? `depuis le ${formatDate(first.date, { day: 'numeric', month: 'short', year: '2-digit' })}` : undefined}
          color={totalChange <= 0 ? COLORS.kcal : COLORS.gain}
          icon={totalChange <= 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
        />
        <MiniStat label="IMC" value={round(bmi, 1)} sub={cat.label} color={cat.color} />
        <MiniStat label="Objectif" value={`${profile.targetWeight} kg`} sub={last ? `${toGo > 0 ? '+' : ''}${round(toGo, 1)} kg restants` : undefined} color={COLORS.kcal} icon={<Target className="h-4 w-4" />} />
      </div>

      {first && last && Math.abs(first.weight - profile.targetWeight) > 0.1 && (
        <Card className="p-4">
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span>{first.weight} kg</span>
            <span className="font-semibold text-emerald-400">{round(progressPct)}% du chemin</span>
            <span>{profile.targetWeight} kg</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400" style={{ width: `${progressPct}%` }} />
          </div>
          {projection && (
            <p className="mt-2 text-xs text-slate-400">
              Rythme actuel : <b className="text-slate-200">{projection.perWeek > 0 ? '+' : ''}{round(projection.perWeek, 2)} kg/sem</b>
              {projection.eta && (
                <>
                  {' '}· objectif estimé le <b className="text-emerald-300">{formatDate(projection.eta, { day: 'numeric', month: 'long', year: 'numeric' })}</b>
                </>
              )}
            </p>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Courbe de poids</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SegmentedTabs value={range} onChange={setRange} options={(['1M', '3M', '6M', '1A', 'Tout'] as Range[]).map((r) => ({ value: r, label: r }))} />
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 6, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="wFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.water} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLORS.water} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} minTickGap={20} />
                <YAxis
                  {...axisProps}
                  unit="kg"
                  tickCount={7}
                  domain={[(min: number) => Math.floor(Math.min(min, profile.targetWeight) - 1), (max: number) => Math.ceil(Math.max(max, profile.targetWeight) + 1)]}
                />
                <Tooltip content={<ChartTooltip unit=" kg" />} />
                <Area dataKey="Tendance" stroke={COLORS.water} strokeWidth={2.5} fill="url(#wFill)" type="monotone" dot={false} baseValue="dataMin" />
                <Line dataKey="Poids" stroke="transparent" dot={{ r: 3, fill: '#e2e8f0', stroke: COLORS.water }} activeDot={{ r: 5 }} />
                <ReferenceLine y={profile.targetWeight} stroke={COLORS.kcal} strokeDasharray="6 4" label={{ value: `Objectif ${profile.targetWeight} kg`, fill: COLORS.kcal, fontSize: 10, position: 'insideBottomRight' }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={<Scale className="h-8 w-8" />} title="Pas encore de pesée" text="Ajoute ton poids pour voir la courbe." />
          )}
          <p className="text-center text-[10px] text-slate-500">Points = pesées · courbe = tendance lissée (moyenne mobile exponentielle)</p>
        </CardContent>
      </Card>

      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
            <Brain className="h-5 w-5" />
          </span>
          <div className="text-xs text-slate-300">
            <p className="text-sm font-semibold text-slate-100">Dépense adaptative</p>
            {adaptive ? (
              <>
                <p className="mt-1">
                  D'après tes apports et ta tendance de poids sur 4 semaines, ta dépense réelle est estimée à <b className="text-indigo-300">{adaptive} kcal/j</b> (formule théorique : {goals.tdee} kcal).
                </p>
                <p className="mt-1 text-slate-400">
                  {Math.abs(adaptive - goals.tdee) > 150
                    ? `Écart de ${round(adaptive - goals.tdee)} kcal : tu peux ajuster ton objectif via la surcharge manuelle (Réglages).`
                    : 'Ton estimation théorique est cohérente avec tes résultats réels 👍'}
                </p>
              </>
            ) : (
              <p className="mt-1 text-slate-400">Enregistre tes repas au moins 7 jours et 2 pesées sur 4 semaines pour obtenir une estimation personnalisée de ta dépense.</p>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historique ({logs.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {reversed.length === 0 && <p className="py-4 text-center text-xs text-slate-500">Aucune pesée enregistrée.</p>}
          {reversed.map((l, i) => {
            const prev = reversed[i + 1];
            const diff = prev ? l.weight - prev.weight : 0;
            return (
              <div key={l.id} className="flex items-center gap-3 rounded-xl bg-slate-900/60 px-3 py-2">
                <div className="flex-1">
                  <p className="text-sm font-semibold tabular-nums text-slate-100">{l.weight} kg</p>
                  <p className="text-[11px] text-slate-500">
                    {capitalize(formatDate(l.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}
                    {l.note && ` · ${l.note}`}
                  </p>
                </div>
                {prev && (
                  <span className={`text-xs font-medium tabular-nums ${diff > 0 ? 'text-orange-400' : diff < 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {diff > 0 ? '+' : ''}
                    {round(diff, 1)}
                  </span>
                )}
                <button
                  className="p-1.5 text-slate-400"
                  onClick={() => {
                    setDate(l.date);
                    setWeight(String(l.weight));
                    setNote(l.note ?? '');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  aria-label="Modifier"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  className="p-1.5 text-slate-400 hover:text-rose-400"
                  onClick={async () => {
                    const backup = { ...l };
                    await deleteWeight(l.id!);
                    toast('Pesée supprimée', 'info', { label: 'Annuler', onClick: () => db.weightLogs.put(backup) });
                  }}
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({ label, value, sub, color, icon }: { label: string; value: React.ReactNode; sub?: string; color: string; icon?: React.ReactNode }) {
  return (
    <Card className="p-3">
      <p className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
        {label} <span style={{ color }}>{icon}</span>
      </p>
      <p className="text-lg font-bold tabular-nums" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
    </Card>
  );
}
