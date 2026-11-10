import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { bonusSessions, isWorkout, keyOf } from '@/lib/sport';
import { startOfWeek } from '@/lib/utils';
import type { Activity, HealthDay } from '@/types';

/** Activité d'un jour : pas, calories actives, séances, et bonus calorique (séances en plus de celles prévues). */
export function useActivity(date: string, plannedPerWeek: number, bonusEnabled: boolean) {
  const data = useLiveQuery(
    async () => {
      const [day, week] = await Promise.all([
        db.healthDays.get(date),
        db.activities.where('date').between(startOfWeek(date), date, true, true).toArray(),
      ]);
      return { day, week };
    },
    [date],
  );
  const day: HealthDay | undefined = data?.day;
  const week: Activity[] = data?.week ?? [];
  const sessions = week.filter((a) => a.date === date).sort((a, b) => a.startTime - b.startTime);
  const bonusKeys = bonusSessions(week, plannedPerWeek);
  const bonusKcal = bonusEnabled ? sessions.filter((s) => bonusKeys.has(keyOf(s))).reduce((n, s) => n + s.kcal, 0) : 0;
  const sessionKcal = sessions.reduce((n, s) => n + s.kcal, 0);
  // Séances sportives de la semaine jusqu'à ce jour (pour le compteur « x / N prévues »).
  const weekWorkouts = week.filter(isWorkout).length;
  return { loaded: data !== undefined, steps: day?.steps ?? 0, activeKcal: day?.activeKcal ?? 0, hasHealthDay: !!day, sessions, bonusKeys, bonusKcal, sessionKcal, weekWorkouts };
}
