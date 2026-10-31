import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '@/db/database';
import type { Meal, MealType, Nutrients } from '@/types';
import { MEAL_TYPES, sumNutrients, dateRange, addDays, todayISO } from '@/lib/utils';

export function useMealsForDate(date: string) {
  const meals = useLiveQuery(() => db.meals.where('date').equals(date).sortBy('timestamp'), [date]);
  const list = meals ?? [];
  const totals = useMemo(() => sumNutrients(list), [list]);
  const byType = useMemo(() => {
    const out = {} as Record<MealType, { meals: Meal[]; totals: Nutrients }>;
    for (const t of MEAL_TYPES) {
      const ms = list.filter((m) => m.mealType === t);
      out[t] = { meals: ms, totals: sumNutrients(ms) };
    }
    return out;
  }, [list]);
  return { meals: list, totals, byType, loading: meals === undefined };
}

export interface DaySummary extends Nutrients {
  date: string;
  count: number;
  byType: Record<MealType, number>;
  byTypeNutrients: Record<MealType, Nutrients>;
}

export function useMealsRange(start: string, end: string) {
  const meals = useLiveQuery(() => db.meals.where('date').between(start, end, true, true).toArray(), [start, end]);
  const days: DaySummary[] = useMemo(() => {
    const map = new Map<string, Meal[]>();
    for (const m of meals ?? []) {
      const arr = map.get(m.date) ?? [];
      arr.push(m);
      map.set(m.date, arr);
    }
    return dateRange(start, end).map((date) => {
      const ms = map.get(date) ?? [];
      const byTypeNutrients = {} as Record<MealType, Nutrients>;
      const byType = {} as Record<MealType, number>;
      for (const t of MEAL_TYPES) {
        byTypeNutrients[t] = sumNutrients(ms.filter((m) => m.mealType === t));
        byType[t] = byTypeNutrients[t].calories;
      }
      return { date, count: ms.length, byType, byTypeNutrients, ...sumNutrients(ms) };
    });
  }, [meals, start, end]);
  return { days, meals: meals ?? [], loading: meals === undefined };
}

/** Repas récents uniques (par titre) pour l'ajout rapide. */
export function useRecentMeals(limit = 30) {
  return (
    useLiveQuery(async () => {
      const all = await db.meals.orderBy('timestamp').reverse().limit(300).toArray();
      const seen = new Set<string>();
      const out: Meal[] = [];
      for (const m of all) {
        const k = m.title.trim().toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(m);
      }
      out.sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite));
      return out.slice(0, limit);
    }, [limit]) ?? []
  );
}

/** Série de jours consécutifs avec au moins un repas enregistré. */
export function useStreak() {
  return (
    useLiveQuery(async () => {
      const today = todayISO();
      const from = addDays(today, -365);
      const keys = (await db.meals.where('date').between(from, today, true, true).keys()) as string[];
      const set = new Set(keys);
      let d = set.has(today) ? today : addDays(today, -1);
      let n = 0;
      while (set.has(d)) {
        n++;
        d = addDays(d, -1);
      }
      return n;
    }, []) ?? 0
  );
}

/** Dates ayant au moins un repas (pour les pastilles du calendrier). */
export function useLoggedDates(start: string, end: string) {
  return (
    useLiveQuery(async () => {
      const keys = (await db.meals.where('date').between(start, end, true, true).keys()) as string[];
      return new Set(keys);
    }, [start, end]) ?? new Set<string>()
  );
}

export async function saveMeal(meal: Meal) {
  if (meal.id) {
    await db.meals.put(meal);
    return meal.id;
  }
  return db.meals.add(meal);
}

export async function deleteMeal(id: number) {
  await db.meals.delete(id);
}

export async function duplicateMeal(meal: Meal, date: string, mealType?: MealType) {
  const { id: _id, ...rest } = meal;
  return db.meals.add({ ...rest, date, mealType: mealType ?? meal.mealType, timestamp: Date.now() });
}
