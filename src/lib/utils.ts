import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { MealType, Nutrients } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Date locale -> YYYY-MM-DD (sans décalage UTC). */
export function toISODate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function addDays(iso: string, n: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function todayISO() {
  return toISODate(new Date());
}

export function daysBetween(a: string, b: string) {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86400000);
}

export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Lundi de la semaine contenant `iso`. */
export function startOfWeek(iso: string) {
  const d = fromISODate(iso);
  const dow = (d.getDay() + 6) % 7;
  return addDays(iso, -dow);
}

export function startOfMonth(iso: string) {
  return iso.slice(0, 8) + '01';
}

export function endOfMonth(iso: string) {
  const d = fromISODate(startOfMonth(iso));
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return toISODate(d);
}

export function addMonths(iso: string, n: number) {
  const d = fromISODate(startOfMonth(iso));
  d.setMonth(d.getMonth() + n);
  return toISODate(d);
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('fr-FR', opts);
    fmtCache.set(key, f);
  }
  return f.format(fromISODate(iso));
}

export function relativeDayLabel(iso: string) {
  const t = todayISO();
  if (iso === t) return "Aujourd'hui";
  if (iso === addDays(t, -1)) return 'Hier';
  if (iso === addDays(t, 1)) return 'Demain';
  return capitalize(formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long' }));
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function round(n: number, d = 0) {
  const p = 10 ** d;
  return Math.round((Number.isFinite(n) ? n : 0) * p) / p;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export const EMPTY_NUTRIENTS: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 };

export function sumNutrients(list: Partial<Nutrients>[]): Nutrients {
  return list.reduce<Nutrients>(
    (acc, m) => ({
      calories: acc.calories + (m.calories || 0),
      protein: acc.protein + (m.protein || 0),
      carbs: acc.carbs + (m.carbs || 0),
      fat: acc.fat + (m.fat || 0),
      sugar: acc.sugar + (m.sugar || 0),
      fiber: acc.fiber + (m.fiber || 0),
    }),
    { ...EMPTY_NUTRIENTS },
  );
}

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  dinner: 'Dîner',
  snack: 'En-cas',
};

export const MEAL_EMOJI: Record<MealType, string> = {
  breakfast: '🥐',
  lunch: '🥗',
  dinner: '🍲',
  snack: '🍎',
};

export const MEAL_COLORS: Record<MealType, string> = {
  breakfast: '#38bdf8',
  lunch: '#10b981',
  dinner: '#a78bfa',
  snack: '#fb923c',
};

/** Suggestion du type de repas selon l'heure actuelle. */
export function guessMealType(d = new Date()): MealType {
  const h = d.getHours();
  if (h >= 5 && h < 10.5) return 'breakfast';
  if (h >= 11 && h < 15) return 'lunch';
  if (h >= 18 && h < 23) return 'dinner';
  return 'snack';
}

export const COLORS = {
  kcal: '#10b981',
  protein: '#6366f1',
  carbs: '#f59e0b',
  fat: '#f43f5e',
  sugar: '#d946ef',
  fiber: '#84cc16',
  water: '#0ea5e9',
  target: '#ef4444',
  lose: '#38bdf8',
  gain: '#f97316',
  maintain: '#94a3b8',
};

export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* noop */
  }
}

export function downloadFile(filename: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
