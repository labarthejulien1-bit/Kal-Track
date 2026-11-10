/** Types de sport, estimation des calories (MET) et règle du « bonus sport ». */
import type { Activity, SportIntensity, SportType } from '@/types';
import { startOfWeek } from '@/lib/utils';
import { t } from '@/i18n';

/** MET moyens (intensité modérée) — Compendium of Physical Activities. */
export const SPORTS: Record<SportType, { emoji: string; met: number; label: () => string }> = {
  walk: { emoji: '🚶', met: 4.3, label: () => t('Marche rapide') },
  run: { emoji: '🏃', met: 9.8, label: () => t('Course à pied') },
  bike: { emoji: '🚴', met: 7.5, label: () => t('Vélo') },
  strength: { emoji: '🏋️', met: 5.0, label: () => t('Musculation') },
  swim: { emoji: '🏊', met: 7.0, label: () => t('Natation') },
  team: { emoji: '⚽', met: 7.0, label: () => t('Sport collectif') },
  yoga: { emoji: '🧘', met: 3.0, label: () => t('Yoga / Pilates') },
  hiit: { emoji: '🔥', met: 8.0, label: () => t('HIIT / Cardio') },
  dance: { emoji: '💃', met: 5.5, label: () => t('Danse') },
  other: { emoji: '🏅', met: 5.0, label: () => t('Autre sport') },
};
export const SPORT_TYPES = Object.keys(SPORTS) as SportType[];

const INTENSITY: Record<SportIntensity, number> = { light: 0.75, moderate: 1, intense: 1.3 };

/** Calories actives nettes : (MET − 1) × poids (kg) × durée (h). */
export function estimateKcal(type: SportType, minutes: number, weightKg: number, intensity: SportIntensity = 'moderate') {
  const met = SPORTS[type].met * INTENSITY[intensity];
  return Math.max(0, Math.round((met - 1) * weightKg * (minutes / 60)));
}

/** Correspondance des types d'exercice Santé Android → types Kal-Track. */
export function sportFromHealth(workoutType: string): SportType {
  const w = workoutType.toUpperCase();
  if (w.startsWith('RUNNING')) return 'run';
  if (w === 'WALKING' || w === 'HIKING' || w === 'SNOWSHOEING') return 'walk';
  if (w.startsWith('BIKING')) return 'bike';
  if (['STRENGTH_TRAINING', 'WEIGHTLIFTING', 'CALISTHENICS', 'GYMNASTICS'].includes(w)) return 'strength';
  if (w.startsWith('SWIMMING') || w === 'WATER_POLO') return 'swim';
  if (['SOCCER', 'BASKETBALL', 'VOLLEYBALL', 'HANDBALL', 'RUGBY', 'TENNIS', 'BADMINTON', 'SQUASH', 'TABLE_TENNIS', 'FOOTBALL_AMERICAN', 'FOOTBALL_AUSTRALIAN', 'BASEBALL', 'SOFTBALL', 'ICE_HOCKEY', 'ROLLER_HOCKEY', 'CRICKET', 'RACQUETBALL'].includes(w)) return 'team';
  if (['YOGA', 'PILATES', 'STRETCHING', 'GUIDED_BREATHING'].includes(w)) return 'yoga';
  if (['HIGH_INTENSITY_INTERVAL_TRAINING', 'BOOT_CAMP', 'EXERCISE_CLASS', 'ELLIPTICAL', 'ROWING_MACHINE', 'STAIR_CLIMBING', 'STAIR_CLIMBING_MACHINE', 'BOXING', 'MARTIAL_ARTS'].includes(w)) return 'hiit';
  if (w === 'DANCING') return 'dance';
  return 'other';
}

/**
 * Règle du bonus : les N premières séances de la semaine (N = séances prévues dans le profil)
 * sont déjà incluses dans l'objectif. Les suivantes ajoutent leurs calories au jour où elles ont lieu.
 * Renvoie l'ensemble des séances « bonus » (par id ou extId).
 */
export function bonusSessions(weekActivities: Activity[], plannedPerWeek: number) {
  const sorted = [...weekActivities].sort((a, b) => a.startTime - b.startTime);
  return new Set(sorted.slice(Math.max(0, Math.round(plannedPerWeek))).map(keyOf));
}

export const keyOf = (a: Activity) => a.extId ?? `m${a.id}`;

export const weekRange = (date: string) => {
  const from = startOfWeek(date);
  return { from, to: date };
};
