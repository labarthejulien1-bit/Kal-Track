import { useMemo } from 'react';
import { useSwipe } from '@/components/SwipeArea';
import { Flame, Copy } from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import { duplicateMeal, useMealsForDate, useStreak } from '@/hooks/useMeals';
import { useApp } from '@/components/AppContext';
import { DateNavigator } from './DateNavigator';
import { CalorieSummary, MacroCircles } from './CalorieSummary';
import { MealSection } from './MealSection';
import { WaterTracker } from './WaterTracker';
import { ActivityCard } from './ActivityCard';
import { useActivity } from '@/hooks/useActivity';
import { healthSupported } from '@/lib/health';
import { Section } from '@/components/ui/collapsible';
import { useWater } from '@/hooks/useWater';
import { fmtWater } from '@/lib/units';
import { addDays, MEAL_TYPES, round, todayISO } from '@/lib/utils';
import { db } from '@/db/database';
import { useToast } from '@/components/ui/toast';
import { t } from '@/i18n';

export function Dashboard() {
  const { selectedDate, setSelectedDate } = useApp();
  const { profile, goals: baseGoals } = useProfile();
  const activity = useActivity(selectedDate, profile.workoutsPerWeek, profile.sportBonus !== false);
  // Séances en plus de celles prévues : calories ajoutées à l'objectif du jour (principalement en glucides).
  const goals = useMemo(
    () => (activity.bonusKcal > 0 ? { ...baseGoals, calories: baseGoals.calories + activity.bonusKcal, carbs: baseGoals.carbs + Math.round(activity.bonusKcal / 4) } : baseGoals),
    [baseGoals, activity.bonusKcal],
  );
  const { meals, totals, byType } = useMealsForDate(selectedDate);
  const streak = useStreak();
  const water = useWater(selectedDate);
  const toast = useToast();

  const copyPreviousDay = async () => {
    const prev = await db.meals.where('date').equals(addDays(selectedDate, -1)).toArray();
    if (!prev.length) return toast(t('Aucun repas la veille'), 'info');
    for (const m of prev) await duplicateMeal(m, selectedDate);
    toast(t('{n} repas copiés', { n: prev.length }));
  };

  // ---- Navigation par balayage horizontal (swipe) ----
  const today = todayISO();
  const { ref: contentRef, handlers, prepare } = useSwipe({
    animKey: selectedDate,
    canNext: selectedDate < today,
    onNext: () => setSelectedDate(addDays(selectedDate, 1)),
    onPrev: () => setSelectedDate(addDays(selectedDate, -1)),
  });

  const changeDate = (d: string) => {
    if (d === selectedDate) return;
    prepare(d > selectedDate ? 'next' : 'prev');
    setSelectedDate(d);
  };

  return (
    <div className="space-y-3 [touch-action:pan-y]" {...handlers}>
      <header className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <img src="./logo.svg" alt="" className="h-9 w-9 rounded-xl" />
          <div className="leading-tight">
            <h1 className="text-lg font-bold text-slate-50">Kal-Track</h1>
            <p className="text-[11px] text-slate-400">{profile.name ? t('Bonjour {name} 👋', { name: profile.name }) : t('Ton journal nutritionnel')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-orange-500/15 px-3 py-1 text-sm font-semibold text-orange-400" title={t('Jours consécutifs')}>
          <Flame className="h-4 w-4" /> {streak}
        </div>
      </header>


      <DateNavigator date={selectedDate} onChange={changeDate} />
      <div ref={contentRef} className="space-y-1">
      <Section id="j.calories" title={t('Calories')} summary={`${round(totals.calories)} / ${goals.calories} kcal`}>
        <CalorieSummary totals={totals} goals={goals} bonus={activity.bonusKcal} byType={byType} split={profile.mealSplit} isToday={selectedDate === todayISO()} />
      </Section>
      <Section
        id="j.macros"
        title={t('Macronutriments')}
        summary={`${t('P')} ${round(totals.protein)} · ${t('G')} ${round(totals.carbs)} · ${t('L')} ${round(totals.fat)} g`}
      >
        <MacroCircles totals={totals} goals={goals} />
      </Section>

      <Section
        id="j.meals"
        title={t('Repas')}
        summary={meals.length > 0 ? `${t(meals.length > 1 ? '{n} éléments' : '{n} élément', { n: meals.length })} · ${round(totals.calories)} kcal` : undefined}
        right={
          meals.length === 0 ? (
            <button onClick={copyPreviousDay} className="flex items-center gap-1 text-xs text-emerald-400">
              <Copy className="h-3.5 w-3.5" /> {t('Copier la veille')}
            </button>
          ) : undefined
        }
      >
        <div className="space-y-2">
          {MEAL_TYPES.map((t) => (
            <MealSection
              key={t}
              type={t}
              date={selectedDate}
              meals={byType[t].meals}
              totals={byType[t].totals}
              target={(goals.calories * profile.mealSplit[t]) / 100}
            />
          ))}
        </div>
      </Section>

      <Section
        id="j.activity"
        title={t('Activité')}
        summary={[
          healthSupported && profile.health?.connected ? `${activity.steps.toLocaleString()} ${t('pas')}` : null,
          activity.sessions.length ? t(activity.sessions.length > 1 ? '{n} séances' : '{n} séance', { n: activity.sessions.length }) : null,
          activity.bonusKcal ? `+${activity.bonusKcal} kcal` : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined}
      >
        <ActivityCard date={selectedDate} activity={activity} />
      </Section>

      <Section id="j.water" title={t('Hydratation')} summary={`${fmtWater(water.ml)} / ${fmtWater(goals.water)}`}>
        <WaterTracker date={selectedDate} goal={goals.water} />
      </Section>

      {totals.calories > 0 && (
        <Section id="j.insight" title={t('Bilan du jour')}>
          <DayInsight totals={totals} goals={goals} />
        </Section>
      )}
      <div className="h-2" />
      </div>
    </div>
  );
}

function DayInsight({ totals, goals }: { totals: ReturnType<typeof useMealsForDate>['totals']; goals: ReturnType<typeof useProfile>['goals'] }) {
  const tips: string[] = [];
  const pPct = totals.protein / Math.max(1, goals.protein);
  if (pPct < 0.6) tips.push(t('Il te manque {n} g de protéines : pense aux œufs, skyr, poulet ou légumineuses.', { n: round(goals.protein - totals.protein) }));
  if (totals.sugar > goals.sugar) tips.push(t('Sucres au-dessus de la limite (+{n} g). Privilégie les fruits entiers aux produits sucrés.', { n: round(totals.sugar - goals.sugar) }));
  if (totals.fiber < goals.fiber * 0.5) tips.push(t('Fibres faibles aujourd’hui : ajoute légumes, fruits ou céréales complètes.'));
  if (totals.calories > goals.calories * 1.1) tips.push(t('Objectif calorique dépassé de plus de 10 %. Une marche de 30 min brûle ≈ 150 kcal.'));
  if (!tips.length) tips.push(t('Belle journée équilibrée, continue comme ça ! 💪'));
  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-indigo-500/10 p-3">
      <ul className="space-y-1 text-xs text-slate-300">
        {tips.map((t, i) => (
          <li key={i}>• {t}</li>
        ))}
      </ul>
    </div>
  );
}
