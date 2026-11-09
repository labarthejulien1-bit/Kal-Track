import type { ActivityLevel, Goal, GoalPace, Goals, MacroPreset, Profile } from '@/types';
import { round } from '@/lib/utils';
import { t } from '@/i18n';

export const ACTIVITY_FACTORS: Record<ActivityLevel, { factor: number; label: string; hint: string }> = {
  sedentary: { factor: 1.2, get label() { return t('Sédentaire'); }, get hint() { return t('Travail de bureau, peu de marche (< 5 000 pas)'); } },
  light: { factor: 1.375, get label() { return t('Légèrement actif'); }, get hint() { return t('Marche régulière (5 000 – 8 000 pas)'); } },
  moderate: { factor: 1.55, get label() { return t('Modérément actif'); }, get hint() { return t('Souvent debout (8 000 – 12 000 pas)'); } },
  very: { factor: 1.725, get label() { return t('Très actif'); }, get hint() { return t('Métier physique (> 12 000 pas)'); } },
  extreme: { factor: 1.9, get label() { return t('Extrêmement actif'); }, get hint() { return t('Travail très physique + sport intense'); } },
};

/** Ajustements quotidiens (kcal) selon objectif et rythme. « standard » = règle de base (-500 / +300). */
export const PACE_DELTAS: Record<GoalPace, { lose: number; gain: number; label: string }> = {
  slow: { lose: -250, gain: 150, get label() { return t('Doux'); } },
  standard: { lose: -500, gain: 300, get label() { return t('Standard'); } },
  fast: { lose: -750, gain: 500, get label() { return t('Rapide'); } },
};

export const GOAL_LABELS: Record<Goal, string> = {
  get lose() {
    return t('Perte de poids');
  },
  get maintain() {
    return t('Maintien');
  },
  get gain() {
    return t('Prise de poids');
  },
};

export const MACRO_PRESETS: Record<Exclude<MacroPreset, 'custom'>, { label: string; protein: number; carbs: number; fat: number }> = {
  balanced: { get label() { return t('Équilibré (30/40/30)'); }, protein: 30, carbs: 40, fat: 30 },
  high_protein: { get label() { return t('Riche en protéines (40/30/30)'); }, protein: 40, carbs: 30, fat: 30 },
  low_carb: { get label() { return t('Low-carb (30/20/50)'); }, protein: 30, carbs: 20, fat: 50 },
  endurance: { get label() { return t('Endurance (20/55/25)'); }, protein: 20, carbs: 55, fat: 25 },
};

/** Énergie : 1 kg de masse grasse ≈ 7 700 kcal. */
export const KCAL_PER_KG = 7700;

export function mifflinStJeor(p: Pick<Profile, 'sex' | 'weight' | 'height' | 'age'>) {
  const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
  return p.sex === 'male' ? base + 5 : base - 161;
}

/** Katch-McArdle : plus précis lorsque le % de masse grasse est connu. */
export function katchMcArdle(weight: number, bodyFat: number) {
  const lbm = weight * (1 - bodyFat / 100);
  return 370 + 21.6 * lbm;
}

export function macroSplitFor(p: Profile) {
  if (p.macroPreset === 'custom') return p.macroSplit;
  return MACRO_PRESETS[p.macroPreset];
}

/** Dépense nette liée aux séances de sport (MET ≈ 6, moyenne journalière). */
export function exerciseKcalPerDay(p: Profile) {
  const MET = 6;
  const sessionKcal = (MET - 1) * p.weight * (p.workoutMinutes / 60);
  return (p.workoutsPerWeek * sessionKcal) / 7;
}

export function computeGoals(p: Profile): Goals {
  const mifflin = mifflinStJeor(p);
  const useKatch = !!p.bodyFat && p.bodyFat > 3 && p.bodyFat < 60;
  // Moyenne des deux formules quand la masse grasse est connue (réduit l'erreur individuelle).
  const bmr = useKatch ? (mifflin + katchMcArdle(p.weight, p.bodyFat!)) / 2 : mifflin;
  const factor = ACTIVITY_FACTORS[p.activityLevel]?.factor ?? 1.2;
  const tdee = bmr * factor + exerciseKcalPerDay(p);

  const pace = PACE_DELTAS[p.pace] ?? PACE_DELTAS.standard;
  const minSafe = Math.max(p.sex === 'male' ? 1500 : 1200, bmr);
  const loseRaw = tdee + pace.lose;
  const loseTarget = Math.max(minSafe, loseRaw);
  const gainTarget = tdee + pace.gain;
  const maintenance = tdee;

  let calories = p.goal === 'lose' ? loseTarget : p.goal === 'gain' ? gainTarget : maintenance;
  const clamped = p.goal === 'lose' && loseRaw < minSafe;

  const split = macroSplitFor(p);
  let protein = (calories * split.protein) / 100 / 4;
  let carbs = (calories * split.carbs) / 100 / 4;
  let fat = (calories * split.fat) / 100 / 9;
  let sugar = (calories * 0.1) / 4; // Recommandation OMS : < 10 % de l'énergie
  const fiber = Math.max(25, (calories / 1000) * 14);

  if (p.manualOverride) {
    calories = p.overrides.calories || calories;
    protein = p.overrides.protein || protein;
    carbs = p.overrides.carbs || carbs;
    fat = p.overrides.fat || fat;
    sugar = p.overrides.sugar || sugar;
  }

  const dailyDelta = calories - tdee;
  const weeklyChangeKg = (dailyDelta * 7) / KCAL_PER_KG;
  const diff = p.targetWeight - p.weight;
  let weeksToTarget: number | null = null;
  if (Math.abs(diff) >= 0.1 && Math.abs(weeklyChangeKg) > 0.01 && Math.sign(diff) === Math.sign(weeklyChangeKg)) {
    weeksToTarget = Math.abs(diff / weeklyChangeKg);
  }
  const bmi = p.weight / (p.height / 100) ** 2;
  const water = p.waterGoalMl || round(p.weight * 35 + (p.workoutsPerWeek * p.workoutMinutes * 10) / 7, -1);

  return {
    calories: round(calories),
    protein: round(protein),
    carbs: round(carbs),
    fat: round(fat),
    sugar: round(sugar),
    fiber: round(fiber),
    bmr: round(bmr),
    bmrMethod: useKatch ? 'Mifflin-St Jeor + Katch-McArdle' : 'Mifflin-St Jeor',
    tdee: round(tdee),
    maintenance: round(maintenance),
    loseTarget: round(loseTarget),
    gainTarget: round(gainTarget),
    dailyDelta: round(dailyDelta),
    weeklyChangeKg: round(weeklyChangeKg, 2),
    minSafe: round(minSafe),
    water,
    bmi: round(bmi, 1),
    weeksToTarget: weeksToTarget === null ? null : round(weeksToTarget, 1),
    clamped,
  };
}

export function bmiCategory(bmi: number) {
  if (bmi < 18.5) return { label: t('Insuffisance pondérale'), color: '#38bdf8' };
  if (bmi < 25) return { label: t('Corpulence normale'), color: '#10b981' };
  if (bmi < 30) return { label: t('Surpoids'), color: '#f59e0b' };
  return { label: t('Obésité'), color: '#f43f5e' };
}

/**
 * TDEE adaptatif : estime la dépense réelle à partir des apports enregistrés
 * et de la tendance de poids (approche des applis récentes type « coach adaptatif »).
 */
export function adaptiveTdee(
  dailyIntakes: { date: string; calories: number }[],
  trendStartKg: number,
  trendEndKg: number,
  days: number,
): number | null {
  const logged = dailyIntakes.filter((d) => d.calories > 300);
  if (logged.length < 7 || days < 7) return null;
  const avgIntake = logged.reduce((s, d) => s + d.calories, 0) / logged.length;
  const deltaKcalPerDay = ((trendEndKg - trendStartKg) * KCAL_PER_KG) / days;
  return round(avgIntake - deltaKcalPerDay);
}

export const DEFAULT_PROFILE: Profile = {
  id: 1,
  name: '',
  sex: 'male',
  age: 30,
  height: 175,
  weight: 75,
  targetWeight: 72,
  bodyFat: undefined,
  activityLevel: 'light',
  workoutsPerWeek: 2,
  workoutMinutes: 45,
  goal: 'lose',
  pace: 'standard',
  macroPreset: 'balanced',
  macroSplit: { protein: 30, carbs: 40, fat: 30 },
  manualOverride: false,
  overrides: { calories: 2000, protein: 150, carbs: 200, fat: 67, sugar: 50 },
  mealSplit: { breakfast: 25, lunch: 35, dinner: 30, snack: 10 },
  waterGoalMl: undefined,
  apiKey: '',
  accessCode: '',
  language: 'auto',
  model: 'gemini-3.5-flash-lite',
  aiDetailLevel: 'detailed',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};
