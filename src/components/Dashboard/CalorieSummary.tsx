import { Candy, Wheat } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { COLORS, MEAL_COLORS, cn, MEAL_LABELS, MEAL_SHORT, MEAL_TYPES, round } from '@/lib/utils';
import type { Goals, MealType, Nutrients, Profile } from '@/types';
import { t } from '@/i18n';

/** Créneaux habituels des repas (heures) pour le repère « où tu devrais en être ». */
const MEAL_WINDOWS: Record<MealType, [number, number]> = { breakfast: [7, 9.5], lunch: [12, 14], snack: [16, 17.5], dinner: [19, 21] };

/** Calories attendues à l'heure h selon la répartition des repas (montée progressive pendant chaque créneau). */
function expectedAt(h: number, targets: Record<MealType, number>) {
  return MEAL_TYPES.reduce((n, m) => {
    const [s, e] = MEAL_WINDOWS[m];
    return n + targets[m] * Math.min(1, Math.max(0, (h - s) / (e - s)));
  }, 0);
}

/**
 * Anneau « coach » des calories : consommé / objectif, bonus sport en orange, repère horaire (aujourd'hui),
 * message du jour, et à droite l'avancement de chaque repas.
 */
export function CalorieSummary({
  totals,
  goals,
  bonus = 0,
  byType,
  split,
  isToday,
}: {
  totals: Nutrients;
  goals: Goals;
  bonus?: number;
  byType: Record<MealType, { totals: Nutrients }>;
  split: Profile['mealSplit'];
  isToday: boolean;
}) {
  const goal = Math.max(1, goals.calories);
  const eaten = totals.calories;
  const remaining = goal - eaten;
  const over = remaining < 0;
  const targets = Object.fromEntries(MEAL_TYPES.map((m) => [m, (goal * split[m]) / 100])) as Record<MealType, number>;

  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const expected = expectedAt(hour, targets);
  const pace = isToday && hour >= 6 ? Math.min(1, expected / goal) : null;
  const hLabel = `${now.getHours()}h`;

  // Conseil du jour (uniquement aujourd'hui) : prochain repas à prévoir.
  let hint: string | null = null;
  if (isToday && !over) {
    const next = MEAL_TYPES.filter((m) => MEAL_WINDOWS[m][1] > hour && byType[m].totals.calories < targets[m] * 0.5).sort((x, y) => MEAL_WINDOWS[x][0] - MEAL_WINDOWS[y][0])[0];
    if (next) hint = t('Prochain repas : {meal} (≈ {m} kcal)', { m: round(targets[next]), meal: MEAL_LABELS[next] });
  }
  const protLeft = round(goals.protein - totals.protein);

  // Géométrie de l'anneau
  const size = 172;
  const stroke = 15;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const C = 2 * Math.PI * r;
  const frac = Math.min(eaten / goal, 1);
  const overFrac = Math.max(0, Math.min((eaten - goal) / goal, 1));
  const bonusStart = bonus > 0 ? (goal - bonus) / goal : 1;
  const ang = (f: number) => (f * 360 - 90) * (Math.PI / 180);
  const mx = pace !== null ? cx + r * Math.cos(ang(pace)) : 0;
  const my = pace !== null ? cx + r * Math.sin(ang(pace)) : 0;

  return (
    <Card className="overflow-hidden p-4">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size}>
            <g transform={`rotate(-90 ${cx} ${cx})`}>
              <circle cx={cx} cy={cx} r={r} stroke="var(--c-track)" strokeWidth={stroke} fill="none" />
              {/* Bonus sport : fin de l'anneau en orange clair */}
              {bonus > 0 && (
                <circle cx={cx} cy={cx} r={r} stroke="#f97316" strokeOpacity={0.3} strokeWidth={stroke} fill="none" strokeDasharray={`${C * (1 - bonusStart)} ${C}`} strokeDashoffset={-C * bonusStart} />
              )}
              <circle
                cx={cx}
                cy={cx}
                r={r}
                stroke={COLORS.kcal}
                strokeWidth={stroke}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - frac)}
                style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)' }}
              />
              {overFrac > 0 && (
                <>
                  <circle cx={cx} cy={cx} r={r} stroke="var(--c-card-solid)" strokeWidth={stroke + 4} fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - overFrac)} />
                  <circle cx={cx} cy={cx} r={r} stroke="#ef4444" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - overFrac)} />
                </>
              )}
            </g>
            {/* Repère : où tu devrais en être à cette heure-ci */}
            {pace !== null && !over && (
              <g>
                <circle cx={mx} cy={my} r={11} fill="var(--c-strong)" stroke="var(--c-card-solid)" strokeWidth={2.5} />
                <text x={mx} y={my + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--c-card-solid)">
                  {hLabel}
                </text>
              </g>
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[34px] font-extrabold leading-none tabular-nums text-slate-50">{round(eaten)}</span>
            <span className="mt-1 text-[11px] tabular-nums text-slate-400">/ {round(goal)} kcal</span>
            {/* Calories restantes (vert) ou en trop (rouge) */}
            <span className={cn('mt-1.5 flex flex-col text-xs font-bold leading-tight', over ? 'text-red-500' : 'text-emerald-500')}>
              <span className="tabular-nums">{round(Math.abs(remaining))} kcal</span>
              <span>{over ? t('en trop|calories') : t('restantes|calories')}</span>
            </span>
            {!over && bonus > 0 && <span className="mt-0.5 max-w-[120px] text-[10px] font-semibold leading-tight text-orange-500">{t('dont +{n} grâce au sport', { n: bonus })}</span>}
          </div>
        </div>

        {/* Avancement de chaque repas */}
        <div className="min-w-0 flex-1 space-y-2.5">
          {MEAL_TYPES.map((m) => {
            const v = byType[m].totals.calories;
            const tg = targets[m];
            const mOver = v > tg;
            return (
              <div key={m}>
                <div className="mb-1 flex items-baseline justify-between gap-1 text-xs">
                  <span className="flex min-w-0 items-center gap-1 truncate text-slate-300">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: MEAL_COLORS[m] }} />
                    <span className="truncate">{MEAL_SHORT[m]}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <b className={mOver ? 'text-red-500' : 'text-slate-100'}>{round(v)}</b>
                    <span className="text-slate-500">/{round(tg)}</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (v / Math.max(1, tg)) * 100)}%`, background: mOver ? '#ef4444' : MEAL_COLORS[m] }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Prochain repas · protéines (l'emoji reste collé à son texte) */}
      {(hint || protLeft > 15) && (
        <p className="mt-3 px-1 text-xs leading-snug text-slate-400">
          {hint}
          {hint && protLeft > 15 && ' · '}
          {protLeft > 15 && <span className="whitespace-nowrap">{t('Protéines : encore {n} g 🍗', { n: protLeft })}</span>}
        </p>
      )}
    </Card>
  );
}

const MACROS = [
  { key: 'protein', label: 'Protéines', color: COLORS.protein, kcalPerG: 4 },
  { key: 'carbs', label: 'Glucides', color: COLORS.carbs, kcalPerG: 4 },
  { key: 'fat', label: 'Lipides', color: COLORS.fat, kcalPerG: 9 },
] as const;

/** Bilan du jour en barres : protéines, glucides, lipides, sucres et fibres. */
export function MacroCircles({ totals, goals }: { totals: Nutrients; goals: Goals }) {
  return (
    <Card className="p-4">
      <div className="space-y-3">
        {MACROS.map((m) => (
          <BarRow key={m.key} label={t(m.label)} value={totals[m.key]} max={goals[m.key]} color={m.color} unit="g" />
        ))}
        <BarRow label={t('Sucres')} icon={<Candy className="h-3.5 w-3.5" />} value={totals.sugar} max={goals.sugar} color={COLORS.sugar} unit="g" limit />
        <BarRow label={t('Fibres')} icon={<Wheat className="h-3.5 w-3.5" />} value={totals.fiber} max={goals.fiber} color={COLORS.fiber} unit="g" />
      </div>
    </Card>
  );
}

export function BarRow({ label, value, max, color, unit, limit, icon }: { label: string; value: number; max: number; color: string; unit: string; limit?: boolean; icon?: React.ReactNode }) {
  const over = value > max;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium" style={{ color }}>
          {icon ?? <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
          {label}
          {limit && <span className="text-[10px] text-slate-500">({t('limite')})</span>}
        </span>
        <span className="flex items-center gap-1.5 text-slate-300">
          {over && (
            <span className="rounded-full bg-red-600/90 px-1.5 py-px text-[10px] font-bold tabular-nums text-white">
              +{round(value - max, 1)} {unit}
            </span>
          )}
          <span className={over ? 'font-semibold tabular-nums text-red-400' : 'tabular-nums'}>{round(value, 1)}</span>
          <span className="text-slate-500"> / {max} {unit}</span>
        </span>
      </div>
      <Progress value={value} max={max} color={color} showTicks />
    </div>
  );
}
