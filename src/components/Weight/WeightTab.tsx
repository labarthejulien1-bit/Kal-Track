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
import { COLORS, addDays, daysBetween, formatDate, fromISODate, haptic, round, todayISO, capitalize } from '@/lib/utils';
import { ChartTooltip, axisProps, gridProps } from '@/components/Analytics/chartKit';
import { db } from '@/db/database';
import { decimalSep, locale, t } from '@/i18n';
import { fmtW, wIn, wOut, wStep, wUnit } from '@/lib/units';

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

  const parsed = parseFloat(weight.trim().replace(',', '.'));
  // Valeur saisie dans l'unité d'affichage (kg ou lb) ; stockage en kg.
  const currentValue = weight === '' ? wOut(last?.weight ?? profile.weight) : Number.isFinite(parsed) ? parsed : 0;

  const save = async () => {
    const w = wIn(currentValue);
    if (!w || w < 20 || w > 400) return toast(t('Poids invalide'), 'error');
    await upsertWeight(date, round(w, 1), note || undefined);
    haptic(25);
    toast(t('Poids enregistré pour {d}', { d: date === today ? t("aujourd'hui") : formatDate(date, { day: 'numeric', month: 'long' }) }));
    setWeight('');
    setNote('');
  };

  const bump = (d: number) => setWeight(String(round(currentValue + d, 1)).replace('.', decimalSep()));

  const trend = useMemo(() => trendSeries(logs), [logs]);
  // Plage de temps réelle : l'axe X couvre toute la période choisie (1M, 3M…), pas seulement les pesées.
  const firstDate = logs[0]?.date ?? today;
  const from = range === 'Tout' ? (firstDate < today ? firstDate : addDays(today, -7)) : addDays(today, -RANGE_DAYS[range]);
  const fromTs = fromISODate(from).getTime();
  const toTs = fromISODate(today).getTime();
  const chartData = trend
    .filter((p) => p.date >= from)
    .map((p) => ({ x: fromISODate(p.date).getTime(), label: capitalize(formatDate(p.date, { weekday: 'short', day: 'numeric', month: 'short' })), Poids: wOut(p.weight), Tendance: wOut(p.trend) }));
  const xTicks = Array.from({ length: 5 }, (_, i) => Math.round(fromTs + ((toTs - fromTs) * i) / 4));
  const spanDays = (toTs - fromTs) / 86400000;
  const fmtTick = (v: number) => {
    const d = new Date(v);
    return spanDays > 400
      ? d.toLocaleDateString(locale(), { month: 'short', year: '2-digit' })
      : d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  };

  // Projection par régression linéaire sur la tendance des 30 derniers jours.
  const projection = useMemo(() => {
    const recent = trend.filter((p) => p.date >= addDays(today, -30));
    if (recent.length < 3) return null;
    const xs = recent.map((p) => daysBetween(recent[0].date, p.date));
    const ys = recent.map((p) => p.trend);
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
    const inWin = trend.filter((p) => p.date >= winStart);
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
      <h1 className="pt-1 text-lg font-bold text-slate-50">{t('Poids')}</h1>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Scale className="h-4 w-4 text-sky-400" /> {t('Nouvelle pesée')}
        </div>
        <div className="flex items-center justify-center gap-3">
          <button className="rounded-full bg-slate-700/70 p-3" onClick={() => bump(-wStep())} aria-label={`-${wStep()} ${wUnit()}`}>
            <Minus className="h-5 w-5" />
          </button>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={weight === '' ? String(round(currentValue, 1)).replace('.', decimalSep()) : weight}
              onChange={(e) => setWeight(e.target.value.replace(/[^0-9.,]/g, '') || ' ')}
              onFocus={(e) => e.target.select()}
              className="w-36 bg-transparent text-center text-4xl font-bold tabular-nums text-slate-50 focus:outline-none"
            />
            <span className="absolute -right-4 bottom-2 text-sm text-slate-400">{wUnit()}</span>
          </div>
          <button className="rounded-full bg-slate-700/70 p-3" onClick={() => bump(wStep())} aria-label={`+${wStep()} ${wUnit()}`}>
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <Label>{t('Date')}</Label>
            <Input type="date" max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
          <div>
            <Label>{t('Note (optionnel)')}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('à jeun, après sport…')} />
          </div>
        </div>
        <Button className="mt-3 w-full" onClick={save}>
          {t('Enregistrer')} {logs.some((l) => l.date === date) && t('(remplacer)')}
        </Button>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <MiniStat label={t('Actuel')} value={last ? fmtW(last.weight) : '—'} sub={latestTrend ? t('tendance {n} {u}', { n: wOut(latestTrend), u: wUnit() }) : undefined} color={COLORS.water} />
        <MiniStat
          label={t('Évolution totale')}
          value={`${totalChange > 0 ? '+' : ''}${wOut(totalChange)} ${wUnit()}`}
          sub={first ? t('depuis le {d}', { d: formatDate(first.date, { day: 'numeric', month: 'short', year: '2-digit' }) }) : undefined}
          color={totalChange <= 0 ? COLORS.kcal : COLORS.gain}
          icon={totalChange <= 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
        />
        <MiniStat label={t('IMC')} value={round(bmi, 1)} sub={cat.label} color={cat.color} />
        <MiniStat label={t('Objectif')} value={fmtW(profile.targetWeight)} sub={last ? t('{n} {u} restants', { n: `${toGo > 0 ? '+' : ''}${wOut(toGo)}`, u: wUnit() }) : undefined} color={COLORS.kcal} icon={<Target className="h-4 w-4" />} />
      </div>

      {first && last && Math.abs(first.weight - profile.targetWeight) > 0.1 && (
        <Card className="p-4">
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span>{fmtW(first.weight)}</span>
            <span className="font-semibold text-emerald-400">{t('{n}% du chemin', { n: round(progressPct) })}</span>
            <span>{fmtW(profile.targetWeight)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400" style={{ width: `${progressPct}%` }} />
          </div>
          {projection && (
            <p className="mt-2 text-xs text-slate-400">
              {t('Rythme actuel :')} <b className="text-slate-200">{projection.perWeek > 0 ? '+' : ''}{wOut(projection.perWeek, 2)} {t('{u}/sem', { u: wUnit() })}</b>
              {projection.eta && (
                <>
                  {' '}· {t('objectif estimé le')} <b className="text-emerald-300">{formatDate(projection.eta, { day: 'numeric', month: 'long', year: 'numeric' })}</b>
                </>
              )}
            </p>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('Courbe de poids')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SegmentedTabs value={range} onChange={setRange} options={(['1M', '3M', '6M', '1A', 'Tout'] as Range[]).map((r) => ({ value: r, label: t(r) }))} />
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
                <XAxis dataKey="x" type="number" scale="time" domain={[fromTs, toTs]} ticks={xTicks} tickFormatter={fmtTick} {...axisProps} allowDataOverflow />
                <YAxis
                  {...axisProps}
                  unit={wUnit()}
                  tickCount={7}
                  domain={[(min: number) => Math.floor(Math.min(min, wOut(profile.targetWeight)) - 1), (max: number) => Math.ceil(Math.max(max, wOut(profile.targetWeight)) + 1)]}
                />
                <Tooltip content={(p) => <ChartTooltip active={p.active} payload={p.payload as never} label={(p.payload?.[0]?.payload as { label?: string } | undefined)?.label} unit={` ${wUnit()}`} />} />
                <Area dataKey="Poids" name={t('Poids')} stroke={COLORS.water} strokeWidth={2.5} fill="url(#wFill)" type="linear" baseValue="dataMin" dot={{ r: 3.5, fill: 'var(--c-dot)', stroke: COLORS.water, strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                <Line dataKey="Tendance" name={t('Tendance')} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" type="monotone" dot={false} isAnimationActive={false} />
                <ReferenceLine y={wOut(profile.targetWeight)} stroke={COLORS.kcal} strokeDasharray="6 4" label={{ value: `${t('Objectif')} ${fmtW(profile.targetWeight)}`, fill: COLORS.kcal, fontSize: 10, position: 'insideBottomRight' }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={<Scale className="h-8 w-8" />} title={t('Pas encore de pesée')} text={t('Ajoute ton poids pour voir la courbe.')} />
          )}
          <p className="text-center text-[10px] text-slate-500">{t('Courbe bleue = tes pesées · pointillés gris = tendance lissée')}</p>
        </CardContent>
      </Card>

      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
            <Brain className="h-5 w-5" />
          </span>
          <div className="text-xs text-slate-300">
            <p className="text-sm font-semibold text-slate-100">{t('Dépense adaptative')}</p>
            {adaptive ? (
              <>
                <p className="mt-1">
                  {t("D'après tes apports et ta tendance de poids sur 4 semaines, ta dépense réelle est estimée à")} <b className="text-indigo-300">{adaptive} {t('kcal/j')}</b> ({t('formule théorique : {n} kcal', { n: goals.tdee })}).
                </p>
                <p className="mt-1 text-slate-400">
                  {Math.abs(adaptive - goals.tdee) > 150
                    ? t('Écart de {n} kcal : tu peux ajuster ton objectif via la surcharge manuelle (Réglages).', { n: round(adaptive - goals.tdee) })
                    : t('Ton estimation théorique est cohérente avec tes résultats réels 👍')}
                </p>
              </>
            ) : (
              <p className="mt-1 text-slate-400">{t('Enregistre tes repas au moins 7 jours et 2 pesées sur 4 semaines pour obtenir une estimation personnalisée de ta dépense.')}</p>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('Historique ({n})', { n: logs.length })}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {reversed.length === 0 && <p className="py-4 text-center text-xs text-slate-500">{t('Aucune pesée enregistrée.')}</p>}
          {reversed.map((l, i) => {
            const prev = reversed[i + 1];
            const diff = prev ? l.weight - prev.weight : 0;
            return (
              <div key={l.id} className="flex items-center gap-3 rounded-xl bg-slate-900/60 px-3 py-2">
                <div className="flex-1">
                  <p className="text-sm font-semibold tabular-nums text-slate-100">{fmtW(l.weight)}</p>
                  <p className="text-[11px] text-slate-500">
                    {capitalize(formatDate(l.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}
                    {l.note && ` · ${l.note}`}
                  </p>
                </div>
                {prev && (
                  <span className={`text-xs font-medium tabular-nums ${diff > 0 ? 'text-orange-400' : diff < 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {diff > 0 ? '+' : ''}
                    {wOut(diff)}
                  </span>
                )}
                <button
                  className="p-1.5 text-slate-400"
                  onClick={() => {
                    setDate(l.date);
                    setWeight(String(wOut(l.weight)).replace('.', decimalSep()));
                    setNote(l.note ?? '');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  aria-label={t('Modifier')}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  className="p-1.5 text-slate-400 hover:text-rose-400"
                  onClick={async () => {
                    const backup = { ...l };
                    await deleteWeight(l.id!);
                    toast(t('Pesée supprimée'), 'info', { label: t('Annuler'), onClick: () => db.weightLogs.put(backup) });
                  }}
                  aria-label={t('Supprimer')}
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
