import { useRef, useState } from 'react';
import { Flame, Copy, Sparkles } from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import { duplicateMeal, useMealsForDate, useStreak } from '@/hooks/useMeals';
import { useApp } from '@/components/AppContext';
import { DateNavigator } from './DateNavigator';
import { CalorieSummary, MacroCircles } from './CalorieSummary';
import { MealDistribution } from './MealDistribution';
import { MealSection } from './MealSection';
import { WaterTracker } from './WaterTracker';
import { SectionTitle } from '@/components/common';
import { addDays, cn, haptic, MEAL_TYPES, round, todayISO } from '@/lib/utils';
import { db } from '@/db/database';
import { useToast } from '@/components/ui/toast';

export function Dashboard() {
  const { selectedDate, setSelectedDate, setTab } = useApp();
  const { profile, goals } = useProfile();
  const { meals, totals, byType } = useMealsForDate(selectedDate);
  const streak = useStreak();
  const toast = useToast();

  const copyPreviousDay = async () => {
    const prev = await db.meals.where('date').equals(addDays(selectedDate, -1)).toArray();
    if (!prev.length) return toast('Aucun repas la veille', 'info');
    for (const m of prev) await duplicateMeal(m, selectedDate);
    toast(`${prev.length} repas copiés`);
  };

  // ---- Navigation par balayage horizontal (swipe) ----
  const [dir, setDir] = useState<'next' | 'prev' | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; lock: 'h' | 'v' | null; dx: number } | null>(null);

  const changeDate = (d: string) => {
    if (d === selectedDate) return;
    setDir(d > selectedDate ? 'next' : 'prev');
    setSelectedDate(d);
  };

  const goDay = (delta: number) => {
    const d = addDays(selectedDate, delta);
    if (d > todayISO()) return;
    haptic(8);
    changeDate(d);
  };

  const resetDrag = () => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = 'transform .2s ease-out, opacity .2s ease-out';
    el.style.transform = '';
    el.style.opacity = '';
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const edge = 24; // laisse libres les gestes « retour » d'Android sur les bords
    if (e.touches.length > 1 || t.clientX < edge || t.clientX > window.innerWidth - edge || (e.target as HTMLElement).closest('input, textarea, select, [data-no-swipe]')) {
      touch.current = null;
      return;
    }
    touch.current = { x: t.clientX, y: t.clientY, lock: null, dx: 0 };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const s = touch.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (!s.lock && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) s.lock = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'h' : 'v';
    if (s.lock !== 'h') return;
    s.dx = dx;
    const blocked = dx < 0 && selectedDate >= todayISO(); // pas de jour futur : effet élastique
    const shown = dx * (blocked ? 0.12 : 0.4);
    const el = contentRef.current;
    if (el) {
      el.style.transition = 'none';
      el.style.transform = `translateX(${shown}px)`;
      el.style.opacity = String(1 - Math.min(Math.abs(shown) / 400, 0.3));
    }
  };

  const onTouchEnd = () => {
    const s = touch.current;
    touch.current = null;
    resetDrag();
    if (!s || s.lock !== 'h') return;
    if (s.dx < -60) goDay(1);
    else if (s.dx > 60) goDay(-1);
  };

  return (
    <div className="space-y-3 [touch-action:pan-y]" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <header className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <img src="./logo.svg" alt="" className="h-9 w-9 rounded-xl" />
          <div className="leading-tight">
            <h1 className="text-lg font-bold text-slate-50">Kal-Track</h1>
            <p className="text-[11px] text-slate-400">{profile.name ? `Bonjour ${profile.name} 👋` : 'Ton journal nutritionnel'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-orange-500/15 px-3 py-1 text-sm font-semibold text-orange-400" title="Jours consécutifs">
          <Flame className="h-4 w-4" /> {streak}
        </div>
      </header>

      {!profile.apiKey && (
        <button onClick={() => setTab('settings')} className="flex w-full items-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3 text-left text-xs text-indigo-200">
          <Sparkles className="h-4 w-4 shrink-0" />
          Ajoute ta clé API Gemini dans les Réglages pour activer l'analyse IA des photos.
        </button>
      )}

      <DateNavigator date={selectedDate} onChange={changeDate} />
      <div ref={contentRef} key={selectedDate} className={cn('space-y-3', dir === 'next' && 'animate-day-next', dir === 'prev' && 'animate-day-prev')}>
      <CalorieSummary totals={totals} goals={goals} goal={profile.goal} />
      <MealDistribution byType={byType} total={totals.calories} goal={goals.calories} split={profile.mealSplit} />
      <MacroCircles totals={totals} goals={goals} />

      <SectionTitle
        right={
          meals.length === 0 ? (
            <button onClick={copyPreviousDay} className="flex items-center gap-1 text-xs text-emerald-400">
              <Copy className="h-3.5 w-3.5" /> Copier la veille
            </button>
          ) : (
            <span className="text-xs text-slate-500">{meals.length} élément{meals.length > 1 ? 's' : ''} · {round(totals.calories)} kcal</span>
          )
        }
      >
        Repas
      </SectionTitle>
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

      <WaterTracker date={selectedDate} goal={goals.water} />

      {totals.calories > 0 && <DayInsight totals={totals} goals={goals} />}
      <div className="h-2" />
      </div>
    </div>
  );
}

function DayInsight({ totals, goals }: { totals: ReturnType<typeof useMealsForDate>['totals']; goals: ReturnType<typeof useProfile>['goals'] }) {
  const tips: string[] = [];
  const pPct = totals.protein / Math.max(1, goals.protein);
  if (pPct < 0.6) tips.push(`Il te manque ${round(goals.protein - totals.protein)} g de protéines : pense aux œufs, skyr, poulet ou légumineuses.`);
  if (totals.sugar > goals.sugar) tips.push(`Sucres au-dessus de la limite (+${round(totals.sugar - goals.sugar)} g). Privilégie les fruits entiers aux produits sucrés.`);
  if (totals.fiber < goals.fiber * 0.5) tips.push('Fibres faibles aujourd’hui : ajoute légumes, fruits ou céréales complètes.');
  if (totals.calories > goals.calories * 1.1) tips.push('Objectif calorique dépassé de plus de 10 %. Une marche de 30 min brûle ≈ 150 kcal.');
  if (!tips.length) tips.push('Belle journée équilibrée, continue comme ça ! 💪');
  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-indigo-500/10 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
        <Sparkles className="h-3.5 w-3.5" /> Bilan du jour
      </div>
      <ul className="space-y-1 text-xs text-slate-300">
        {tips.map((t, i) => (
          <li key={i}>• {t}</li>
        ))}
      </ul>
    </div>
  );
}
