import { useMemo, useState } from 'react';
import { Scale, Trash2, Pencil, TrendingDown, TrendingUp, Minus, Plus, Target, Brain } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Section } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { SegmentedTabs } from '@/components/ui/tabs';
import { EmptyState } from '@/components/common';
import { WEIGHT_RANGES, WeightChart, type WeightRange } from './WeightChart';
import { useToast } from '@/components/ui/toast';
import { useProfile } from '@/hooks/useProfile';
import { deleteWeight, trendSeries, upsertWeight, useWeights } from '@/hooks/useWeights';
import { useMealsRange } from '@/hooks/useMeals';
import { adaptiveTdee, bmiCategory } from '@/services/bmrCalculator';
import { COLORS, addDays, daysBetween, formatDate, haptic, round, todayISO, capitalize } from '@/lib/utils';
import { db } from '@/db/database';
import { decimalSep, t } from '@/i18n';
import { fmtH, fmtW, wIn, wOut, wStep, wUnit } from '@/lib/units';


export function WeightTab() {
  const { profile, goals } = useProfile();
  const { logs } = useWeights();
  const toast = useToast();
  const today = todayISO();
  const last = logs[logs.length - 1];

  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState<string>('');
  const [note, setNote] = useState('');
  const [range, setRange] = useState<WeightRange>('1M');

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
    <div className="space-y-2">
      <h1 className="pt-1 text-lg font-bold text-slate-50">{t('Poids')}</h1>

      <Section id="w.entry" title={t('Nouvelle pesée')} summary={last ? `${t('Dernière')} : ${fmtW(last.weight)}` : undefined}>
      <Card className="p-4">
        <div className="flex items-center justify-center gap-3">
          <button className="rounded-full bg-slate-700/70 p-3" onClick={() => bump(-wStep())} aria-label={`-${wStep()} ${wUnit()}`}>
            <Minus className="h-5 w-5" />
          </button>
          <div className="flex items-baseline gap-1">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={weight === '' ? String(round(currentValue, 1)).replace('.', decimalSep()) : weight}
              onChange={(e) => setWeight(e.target.value.replace(/[^0-9.,]/g, '') || ' ')}
              onFocus={(e) => e.target.select()}
              className="w-28 bg-transparent text-right text-4xl font-bold tabular-nums text-slate-50 focus:outline-none"
            />
            <span className="w-7 text-sm text-slate-400">{wUnit()}</span>
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
      </Section>

      <Section id="w.stats" title={t('Résumé')} summary={last ? `${fmtW(last.weight)} · ${t('IMC')} ${round(bmi, 1)}` : undefined}>
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
      </Section>

      {first && last && Math.abs(first.weight - profile.targetWeight) > 0.1 && (
        <Section id="w.progress" title={t('Progression')} summary={t('{n}% du chemin', { n: round(progressPct) })}>
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
        </Section>
      )}

      <Section
        id={`w.1`}
        title={t('Courbe de poids')}
      >
      <Card>
        <CardContent className="space-y-3">
          <SegmentedTabs value={range} onChange={setRange} options={WEIGHT_RANGES.map((r) => ({ value: r, label: t(r) }))} />
          {logs.length ? (
            <WeightChart logs={logs} range={range} today={today} targetWeight={profile.targetWeight} weeklyChangeKg={goals.weeklyChangeKg} />
          ) : (
            <EmptyState icon={<Scale className="h-8 w-8" />} title={t('Pas encore de pesée')} text={t('Ajoute ton poids pour voir la courbe.')} />
          )}
        </CardContent>
      </Card>
      </Section>

      <Section id="w.adaptive" title={t('Dépense adaptative')} summary={adaptive ? `${adaptive} ${t('kcal/j')}` : undefined}>
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
            <Brain className="h-5 w-5" />
          </span>
          <div className="text-xs text-slate-300">
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
      </Section>

      <Section
        id={`w.2`}
        title={t('Historique ({n})', { n: logs.length })}
        defaultOpen={false}
      >
      <Card>
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
      </Section>

      <Section id="w.bmi" title={t('IMC')} summary={`${round(bmi, 1)} · ${cat.label}`}>
        <BmiCard bmi={bmi} heightCm={profile.height} weightKg={last?.weight ?? profile.weight} />
      </Section>
    </div>
  );
}

/** IMC selon le poids actuel : valeur, catégorie, jauge des zones et poids de forme pour la taille. */
function BmiCard({ bmi, heightCm, weightKg }: { bmi: number; heightCm: number; weightKg: number }) {
  const cat = bmiCategory(bmi);
  const h2 = (heightCm / 100) ** 2;
  const lo = 18.5 * h2;
  const hi = 24.9 * h2;
  const MIN = 15;
  const MAX = 40;
  const pos = (v: number) => `${((Math.min(MAX, Math.max(MIN, v)) - MIN) / (MAX - MIN)) * 100}%`;
  const zones: [number, number, string, string][] = [
    [MIN, 18.5, '#38bdf8', t('Maigreur')],
    [18.5, 25, '#10b981', t('Normal')],
    [25, 30, '#f59e0b', t('Surpoids')],
    [30, MAX, '#f43f5e', t('Obésité')],
  ];
  const toNormal = weightKg > hi ? weightKg - hi : weightKg < lo ? lo - weightKg : 0;
  return (
    <Card className="p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-4xl font-extrabold tabular-nums leading-none" style={{ color: cat.color }}>
            {round(bmi, 1)}
          </div>
          <div className="mt-1 text-sm font-semibold" style={{ color: cat.color }}>
            {cat.label}
          </div>
        </div>
        <div className="text-right text-xs text-slate-400">
          {t('Poids actuel')} : <b className="text-slate-200">{fmtW(weightKg)}</b>
          <br />
          {t('Taille')} : <b className="text-slate-200">{fmtH(heightCm)}</b>
        </div>
      </div>

      {/* Jauge des zones avec la position actuelle */}
      <div className="relative mt-5">
        <div className="flex h-3 overflow-hidden rounded-full">
          {zones.map(([a, b, c]) => (
            <div key={a} style={{ width: `${((b - a) / (MAX - MIN)) * 100}%`, background: c, opacity: 0.85 }} />
          ))}
        </div>
        <div className="absolute -top-1.5 h-6 w-1.5 -translate-x-1/2 rounded-full border-2 border-white bg-slate-900 shadow" style={{ left: pos(bmi) }} />
        <div className="mt-1.5 flex text-[10px] text-slate-500">
          {zones.map(([a, b, , label]) => (
            <span key={a} className="truncate text-center" style={{ width: `${((b - a) / (MAX - MIN)) * 100}%` }}>
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 space-y-1 rounded-xl bg-slate-900/50 p-3 text-xs text-slate-300">
        <p>
          {t('Poids de forme pour ta taille')} : <b className="text-emerald-500">{fmtW(lo, 0)} – {fmtW(hi, 0)}</b>
        </p>
        {toNormal > 0.1 && (
          <p className="text-slate-400">
            {weightKg > hi ? t('{n} à perdre pour un IMC normal', { n: fmtW(toNormal) }) : t('{n} à prendre pour un IMC normal', { n: fmtW(toNormal) })}
          </p>
        )}
        <p className="text-[11px] text-slate-500">{t('L’IMC est un repère général : il ne tient pas compte de la masse musculaire.')}</p>
      </div>
    </Card>
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
