export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very' | 'extreme';
export type Goal = 'lose' | 'maintain' | 'gain';
export type GoalPace = 'slow' | 'standard' | 'fast';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type MealSource = 'photo' | 'barcode' | 'label' | 'text' | 'manual';
export type MacroPreset = 'balanced' | 'high_protein' | 'low_carb' | 'endurance' | 'custom';

export interface Nutrients {
  calories: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
  sugar: number; // g
  fiber: number; // g
}

export interface MealItem extends Nutrients {
  name: string;
  quantity_g: number;
}

export interface Meal extends Nutrients {
  id?: number;
  date: string; // YYYY-MM-DD (jour local)
  timestamp: number; // ms
  mealType: MealType;
  title: string;
  image?: string; // data URL JPEG compressée (< 200 Ko)
  items?: MealItem[];
  source: MealSource;
  confidenceNote?: string;
  confidence?: number; // 0..1
  barcode?: string;
  nutriScore?: string;
  favorite?: boolean;
}

export interface Profile {
  id: number; // toujours 1
  name: string;
  sex: Sex;
  age: number;
  height: number; // cm
  weight: number; // kg (poids de référence)
  targetWeight: number; // kg
  bodyFat?: number; // %
  activityLevel: ActivityLevel;
  workoutsPerWeek: number;
  workoutMinutes: number;
  goal: Goal;
  pace: GoalPace;
  macroPreset: MacroPreset;
  macroSplit: { protein: number; carbs: number; fat: number }; // % (custom)
  manualOverride: boolean;
  overrides: { calories: number; protein: number; carbs: number; fat: number; sugar: number };
  mealSplit: Record<MealType, number>; // % des calories
  waterGoalMl?: number;
  apiKey: string;
  model: string;
  aiDetailLevel: 'standard' | 'detailed';
  createdAt: number;
  updatedAt: number;
}

export interface WeightLog {
  id?: number;
  date: string; // YYYY-MM-DD
  weight: number;
  note?: string;
  timestamp: number;
}

export interface WaterLog {
  date: string; // clé primaire
  ml: number;
}

export interface MealAnalysis {
  title: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  fiber: number;
  confidence_note: string;
  confidence?: number;
  items: MealItem[];
  barcode?: string;
  nutriScore?: string;
  per100g?: Nutrients;
  servingSize_g?: number;
  imageUrl?: string;
}

export interface Goals extends Nutrients {
  bmr: number;
  bmrMethod: string;
  tdee: number;
  maintenance: number;
  loseTarget: number;
  gainTarget: number;
  dailyDelta: number;
  weeklyChangeKg: number;
  minSafe: number;
  water: number;
  bmi: number;
  weeksToTarget: number | null;
  clamped: boolean;
}

export interface BackupFile {
  app: 'kal-track';
  version: number;
  exportedAt: string;
  profile: Profile | null;
  meals: Meal[];
  weightLogs: WeightLog[];
  waterLogs: WaterLog[];
}
