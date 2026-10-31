import { ReferenceLine } from 'recharts';
import { COLORS, round } from '@/lib/utils';
import type { Goals } from '@/types';
import { Card } from '@/components/ui/card';

export const axisProps = {
  stroke: '#475569',
  tick: { fill: '#94a3b8', fontSize: 10 },
  tickLine: { stroke: '#475569' },
  axisLine: { stroke: '#334155' },
};

export const gridProps = { stroke: '#1e293b', strokeDasharray: '3 3' };

export function ChartTooltip({ active, payload, label, unit = '' }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string; dataKey: string }>; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-slate-200">{label}</p>
      {payload
        .filter((p) => p.value !== undefined && p.value !== null)
        .map((p) => (
          <p key={p.dataKey} className="flex items-center gap-1.5" style={{ color: p.color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name} : <span className="font-semibold tabular-nums">{round(p.value, 1)}</span>
            {unit}
          </p>
        ))}
    </div>
  );
}

/** Lignes de référence : objectif + limites perte / maintien / prise. */
export function calorieReferenceLines(goals: Goals, opts: { showZones?: boolean } = {}) {
  const lines: React.ReactNode[] = [
    <ReferenceLine key="target" y={goals.calories} stroke={COLORS.target} strokeWidth={2} label={{ value: `Objectif ${goals.calories}`, fill: COLORS.target, fontSize: 10, position: 'insideTopRight' }} ifOverflow="extendDomain" />,
  ];
  if (opts.showZones !== false) {
    const z = (v: number) => Math.abs(v - goals.calories) > 1;
    lines.push(
      z(goals.loseTarget) && <ReferenceLine key="lose" y={goals.loseTarget} stroke={COLORS.lose} strokeDasharray="6 4" label={{ value: `Perte ${goals.loseTarget}`, fill: COLORS.lose, fontSize: 9, position: 'insideBottomLeft' }} ifOverflow="extendDomain" />,
      z(goals.maintenance) && <ReferenceLine key="maintain" y={goals.maintenance} stroke={COLORS.maintain} strokeDasharray="2 4" label={{ value: `Maintien ${goals.maintenance}`, fill: COLORS.maintain, fontSize: 9, position: 'insideTopLeft' }} ifOverflow="extendDomain" />,
      z(goals.gainTarget) && <ReferenceLine key="gain" y={goals.gainTarget} stroke={COLORS.gain} strokeDasharray="6 4" label={{ value: `Prise ${goals.gainTarget}`, fill: COLORS.gain, fontSize: 9, position: 'insideTopLeft' }} ifOverflow="extendDomain" />,
    );
  }
  return lines;
}

export function ZoneLegend() {
  const items = [
    { c: COLORS.target, l: 'Objectif', dash: false },
    { c: COLORS.lose, l: 'Limite perte', dash: true },
    { c: COLORS.maintain, l: 'Maintien', dash: true },
    { c: COLORS.gain, l: 'Limite prise', dash: true },
  ];
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
      {items.map((i) => (
        <span key={i.l} className="flex items-center gap-1">
          <span className="inline-block w-4 border-t-2" style={{ borderColor: i.c, borderStyle: i.dash ? 'dashed' : 'solid' }} />
          {i.l}
        </span>
      ))}
    </div>
  );
}

/** Jauge horizontale graduée (0 → 150 %) avec marqueurs. */
export function GraduatedGauge({
  label,
  value,
  goal,
  unit,
  color,
  markers = [],
  isLimit,
}: {
  label: string;
  value: number;
  goal: number;
  unit: string;
  color: string;
  markers?: { value: number; color: string; label: string }[];
  isLimit?: boolean;
}) {
  const scaleMax = Math.max(goal * 1.5, value * 1.05, ...markers.map((m) => m.value * 1.05));
  const pos = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;
  const ticks = Array.from({ length: 7 }, (_, i) => (scaleMax * i) / 6);
  const pct = goal > 0 ? (value / goal) * 100 : 0;
  const status = isLimit ? (pct > 100 ? 'Limite dépassée' : 'Sous la limite') : pct < 80 ? 'Insuffisant' : pct <= 110 ? 'Dans la cible' : 'Excédent';
  const statusColor = isLimit ? (pct > 100 ? '#f43f5e' : '#10b981') : pct < 80 ? '#f59e0b' : pct <= 110 ? '#10b981' : '#f43f5e';
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold" style={{ color }}>{label}</span>
        <span className="text-slate-300">
          <span className="text-sm font-bold tabular-nums">{round(value, 1)}</span> / {round(goal)} {unit}
          <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: `${statusColor}22`, color: statusColor }}>
            {round(pct)}% · {status}
          </span>
        </span>
      </div>
      <div className="relative h-4 rounded-md bg-slate-800">
        <div className="absolute inset-y-0 left-0 rounded-md opacity-90 transition-all" style={{ width: pos(value), background: color }} />
        {ticks.map((t, i) => (
          <span key={i} className="absolute top-0 h-full w-px bg-slate-950/50" style={{ left: pos(t) }} />
        ))}
        <span className="absolute -top-1 h-6 w-0.5 rounded bg-red-500" style={{ left: pos(goal) }} title="Objectif" />
        {markers.map((m) => (
          <span key={m.label} className="absolute -top-0.5 h-5 w-0.5 border-l-2 border-dashed" style={{ left: pos(m.value), borderColor: m.color }} title={m.label} />
        ))}
      </div>
      <div className="relative h-3 text-[9px] text-slate-500">
        {ticks.map((t, i) => (
          <span key={i} className="absolute -translate-x-1/2 tabular-nums" style={{ left: pos(t) }}>
            {round(t)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatGrid({ items }: { items: { label: string; value: React.ReactNode; color?: string; sub?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((i) => (
        <Card key={i.label} className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">{i.label}</p>
          <p className="text-lg font-bold tabular-nums" style={{ color: i.color ?? '#f1f5f9' }}>{i.value}</p>
          {i.sub && <p className="text-[10px] text-slate-500">{i.sub}</p>}
        </Card>
      ))}
    </div>
  );
}

export function seriesStats(values: number[], goal: number, tolerance = 0.1) {
  const logged = values.filter((v) => v > 0);
  if (!logged.length) return { avg: 0, min: 0, max: 0, onTarget: 0, logged: 0, pctGoal: 0 };
  const avg = logged.reduce((s, v) => s + v, 0) / logged.length;
  const onTarget = logged.filter((v) => Math.abs(v - goal) <= goal * tolerance).length;
  return { avg, min: Math.min(...logged), max: Math.max(...logged), onTarget, logged: logged.length, pctGoal: goal ? (avg / goal) * 100 : 0 };
}
