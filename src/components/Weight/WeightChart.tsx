import { useId, useMemo } from 'react';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Area } from 'recharts';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { COLORS, addDays, capitalize, formatDate, fromISODate, round, toISODate } from '@/lib/utils';
import { axisProps, gridProps } from '@/components/Analytics/chartKit';
import { locale, t } from '@/i18n';
import { fmtW, wOut, wUnit } from '@/lib/units';
import type { WeightLog } from '@/types';

export type WeightRange = '1S' | '1M' | '3M' | '6M' | '1A' | 'Tout';
export const WEIGHT_RANGES: WeightRange[] = ['1S', '1M', '3M', '6M', '1A', 'Tout'];
const RANGE_DAYS: Record<WeightRange, number> = { '1S': 7, '1M': 30, '3M': 91, '6M': 182, '1A': 365, Tout: 100000 };
const DAY = 86_400_000;
const BLUE = COLORS.water;
const RED = '#f43f5e';
const PLAN = '#10b981';

interface Row {
  x: number;
  label: string;
  Poids?: number;
  Plan?: number;
  above?: boolean;
  last?: boolean;
}

/**
 * Courbe de poids : pesées (bleu), trajectoire vers l'objectif (pointillés verts, pente du plan),
 * zone sous la courbe rouge là où le poids est au-dessus de la trajectoire.
 */
export function WeightChart({
  logs,
  range,
  today,
  targetWeight,
  weeklyChangeKg,
}: {
  logs: WeightLog[];
  range: WeightRange;
  today: string;
  targetWeight: number;
  weeklyChangeKg: number;
}) {
  const uid = useId().replace(/:/g, '');

  const model = useMemo(() => {
    const toTs = fromISODate(today).getTime();
    const from = addDays(today, -RANGE_DAYS[range]);
    const visible = logs.filter((l) => l.date >= from && l.date <= today);
    if (!visible.length) return null;

    // Trajectoire du plan : part de la première pesée, avance au rythme prévu, puis reste sur l'objectif.
    const start = logs[0];
    const startTs = fromISODate(start.date).getTime();
    const rate = weeklyChangeKg / 7; // kg / jour
    const flat = Math.abs(rate) < 0.001 || Math.sign(targetWeight - start.weight) !== Math.sign(rate);
    const planAt = (ts: number) => {
      if (flat) return targetWeight;
      const v = start.weight + rate * Math.max(0, (ts - startTs) / DAY);
      return rate < 0 ? Math.max(v, targetWeight) : Math.min(v, targetWeight);
    };

    // Le graphique commence à la première pesée de la période (pas de vide à gauche).
    const firstTs = fromISODate(visible[0].date).getTime();
    const domainStart = Math.min(firstTs, toTs - DAY);
    const label = (ts: number) => capitalize(formatDate(toISODate(new Date(ts)), { weekday: 'short', day: 'numeric', month: 'short' }));

    const rows: Row[] = visible.map((l, i) => {
      const x = fromISODate(l.date).getTime();
      const plan = planAt(x);
      return { x, label: label(x), Poids: wOut(l.weight), Plan: wOut(plan), above: l.weight > plan + 0.05, last: i === visible.length - 1 };
    });
    // Points du plan seuls : début d'axe, coude où l'objectif est atteint, aujourd'hui.
    const extra: number[] = [domainStart, toTs];
    if (!flat) {
      const knee = startTs + ((targetWeight - start.weight) / rate) * DAY;
      if (knee > domainStart && knee < toTs) extra.push(knee);
    }
    for (const x of extra) if (!rows.some((r) => Math.abs(r.x - x) < DAY / 2)) rows.push({ x, label: label(x), Plan: wOut(planAt(x)) });
    rows.sort((a, b) => a.x - b.x);

    // Dégradé horizontal bleu / rouge, avec bascule exacte aux croisements de la trajectoire.
    const pts = rows.filter((r) => r.Poids !== undefined) as Required<Pick<Row, 'x' | 'Poids' | 'Plan'>>[];
    const x0 = pts[0].x;
    const span = Math.max(1, pts[pts.length - 1].x - x0);
    const stops: { o: number; c: string }[] = [];
    pts.forEach((p, i) => {
      const d = p.Poids - p.Plan;
      const c = d > 0.05 ? RED : BLUE;
      if (i > 0) {
        const q = pts[i - 1];
        const dq = q.Poids - q.Plan;
        if (Math.sign(dq) !== Math.sign(d) && dq !== d) {
          const o = (q.x + ((p.x - q.x) * dq) / (dq - d) - x0) / span;
          stops.push({ o: o - 0.012, c: dq > 0.05 ? RED : BLUE }, { o: o + 0.012, c }); // fondu doux au croisement
        }
      }
      stops.push({ o: (p.x - x0) / span, c });
    });

    const values = rows.flatMap((r) => [r.Poids, r.Plan]).filter((v): v is number => v !== undefined);
    const pad = wUnit() === 'lb' ? 1.5 : 0.6;
    const yMin = Math.floor(Math.min(...values) - pad);
    const yMax = Math.ceil(Math.max(...values) + pad);

    const spanDays = (toTs - domainStart) / DAY;
    const nTicks = spanDays <= 8 ? Math.round(spanDays) + 1 : 5;
    const ticks = Array.from({ length: nTicks }, (_, i) => Math.round(domainStart + ((toTs - domainStart) * i) / (nTicks - 1)));

    const firstW = visible[0].weight;
    const lastW = visible[visible.length - 1].weight;
    const lastPlan = planAt(fromISODate(visible[visible.length - 1].date).getTime());
    return { rows, stops, domain: [domainStart, toTs] as [number, number], yMin, yMax, ticks, spanDays, delta: lastW - firstW, vsPlan: lastW - lastPlan };
  }, [logs, range, today, targetWeight, weeklyChangeKg]);

  if (!model) return <p className="py-10 text-center text-xs text-slate-500">{t('Aucune pesée sur cette période.')}</p>;

  const fmtTick = (v: number) => {
    const d = new Date(v);
    if (model.spanDays <= 8) return d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric' });
    if (model.spanDays > 400) return d.toLocaleDateString(locale(), { month: 'short', year: '2-digit' });
    return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  };

  const DeltaIcon = model.delta < -0.05 ? TrendingDown : model.delta > 0.05 ? TrendingUp : Minus;
  const ahead = model.vsPlan <= 0.05;
  // Évolution dans le sens de l'objectif (perte si objectif plus bas, prise sinon).
  const goodDir = Math.abs(model.delta) >= 0.05 && Math.sign(model.delta) === Math.sign(targetWeight - (logs[logs.length - 1]?.weight ?? targetWeight) || -1);

  return (
    <div>
      {/* Résumé de la période */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span
          className="flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold tabular-nums"
          style={{ color: goodDir ? PLAN : model.delta === 0 ? BLUE : RED, background: `${goodDir ? PLAN : model.delta === 0 ? BLUE : RED}1f` }}
        >
          <DeltaIcon className="h-3.5 w-3.5" />
          {model.delta > 0 ? '+' : ''}
          {fmtW(model.delta)} {t('sur la période')}
        </span>
        <span
          className="rounded-full px-2.5 py-1 font-semibold tabular-nums"
          style={{ color: ahead ? PLAN : RED, background: `${ahead ? PLAN : RED}1f` }}
        >
          {ahead ? t('Dans la trajectoire') : t('{n} au-dessus de la trajectoire', { n: `+${fmtW(model.vsPlan)}` })}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={model.rows} margin={{ top: 22, right: 12, left: -14, bottom: 0 }}>
          <defs>
            <linearGradient id={`seg-${uid}`} x1="0" y1="0" x2="1" y2="0">
              {model.stops.map((s, i) => (
                <stop key={i} offset={Math.min(1, Math.max(0, s.o))} stopColor={s.c} />
              ))}
            </linearGradient>
            <linearGradient id={`fade-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#fff" stopOpacity={0.02} />
            </linearGradient>
            <mask id={`mask-${uid}`} maskContentUnits="objectBoundingBox">
              <rect x="0" y="0" width="1" height="1" fill={`url(#fade-${uid})`} />
            </mask>
            <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>
          <CartesianGrid {...gridProps} vertical={false} />
          <XAxis dataKey="x" type="number" scale="time" domain={model.domain} ticks={model.ticks} tickFormatter={fmtTick} {...axisProps} allowDataOverflow />
          <YAxis {...axisProps} unit={wUnit()} domain={[model.yMin, model.yMax]} tickCount={6} allowDecimals={false} />
          <Tooltip content={(p) => <WeightTooltip active={p.active} row={p.payload?.[0]?.payload as Row | undefined} />} cursor={{ stroke: 'var(--c-axis)', strokeDasharray: '3 3' }} />

          {/* Zone sous la courbe : bleue, rouge au-dessus de la trajectoire */}
          <Area dataKey="Poids" stroke="none" fill={`url(#seg-${uid})`} fillOpacity={1} mask={`url(#mask-${uid})`} baseValue={model.yMin} type="monotone" isAnimationActive={false} activeDot={false} />
          {/* Trajectoire vers l'objectif */}
          <Line dataKey="Plan" stroke={PLAN} strokeWidth={2} strokeDasharray="6 5" dot={false} activeDot={false} type="linear" connectNulls isAnimationActive={false} />
          {/* Pesées */}
          <Line
            dataKey="Poids"
            stroke={BLUE}
            strokeWidth={2.75}
            type="monotone"
            connectNulls
            isAnimationActive
            animationDuration={700}
            dot={(props: { cx?: number; cy?: number; payload?: Row; index?: number }) => <WeightDot key={props.index} {...props} glow={`glow-${uid}`} />}
            activeDot={{ r: 6, fill: BLUE, stroke: 'var(--c-dot)', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Légende */}
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: BLUE }} /> {t('Tes pesées')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed" style={{ borderColor: PLAN }} /> {t('Trajectoire vers {w}', { w: fmtW(targetWeight) })}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `${RED}66` }} /> {t('Au-dessus')}
        </span>
      </div>
    </div>
  );
}

function WeightDot({ cx, cy, payload, glow }: { cx?: number; cy?: number; payload?: Row; glow: string }) {
  if (cx == null || cy == null || payload?.Poids === undefined) return <g />;
  const c = payload.above ? RED : BLUE;
  if (!payload.last) return <circle cx={cx} cy={cy} r={3.5} fill="var(--c-dot)" stroke={c} strokeWidth={2} />;
  // Dernière pesée : halo lumineux + étiquette de valeur.
  const text = `${round(payload.Poids, 1)} ${wUnit()}`;
  const w = text.length * 6.2 + 14;
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill={c} opacity={0.45} filter={`url(#${glow})`} />
      <circle cx={cx} cy={cy} r={5.5} fill={c} stroke="var(--c-dot)" strokeWidth={2.5} />
      <g transform={`translate(${cx - w - 2}, ${cy - 31})`}>
        <rect width={w} height={19} rx={9.5} fill={c} />
        <text x={w / 2} y={13} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
          {text}
        </text>
      </g>
    </g>
  );
}

function WeightTooltip({ active, row }: { active?: boolean; row?: Row }) {
  if (!active || !row) return null;
  const diff = row.Poids !== undefined && row.Plan !== undefined ? row.Poids - row.Plan : null;
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-slate-200">{row.label}</p>
      {row.Poids !== undefined && (
        <p className="flex items-center gap-1.5" style={{ color: BLUE }}>
          <span className="h-2 w-2 rounded-full" style={{ background: BLUE }} /> {t('Poids')} : <b className="tabular-nums">{round(row.Poids, 1)} {wUnit()}</b>
        </p>
      )}
      {row.Plan !== undefined && (
        <p className="flex items-center gap-1.5" style={{ color: PLAN }}>
          <span className="h-2 w-2 rounded-full" style={{ background: PLAN }} /> {t('Trajectoire')} : <b className="tabular-nums">{round(row.Plan, 1)} {wUnit()}</b>
        </p>
      )}
      {diff !== null && Math.abs(diff) >= 0.05 && (
        <p className="mt-0.5 font-semibold tabular-nums" style={{ color: diff > 0 ? RED : PLAN }}>
          {diff > 0 ? '+' : ''}
          {round(diff, 1)} {wUnit()} {t('vs trajectoire')}
        </p>
      )}
    </div>
  );
}
