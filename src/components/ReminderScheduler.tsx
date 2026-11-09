import { useEffect, useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { useMealsForDate } from '@/hooks/useMeals';
import { cancelDailyReminders, notificationsSupported, scheduleDailyReminders } from '@/lib/notifications';
import { todayISO } from '@/lib/utils';
import { getLang } from '@/i18n';

/** Tient à jour le rappel quotidien selon le journal du jour (application Android uniquement). */
export function ReminderScheduler() {
  const { profile, goals, loading } = useProfile();
  const [today, setToday] = useState(todayISO());
  const { meals, totals } = useMealsForDate(today);
  const enabled = !!profile.reminder?.enabled;
  const time = profile.reminder?.time ?? '19:30';
  const lang = getLang();

  // Nouveau jour : reprogramme quand l'appli revient au premier plan.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && setToday(todayISO());
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    if (!notificationsSupported || loading) return;
    const id = setTimeout(() => {
      (enabled
        ? scheduleDailyReminders({ time, today: { calories: totals.calories, meals: meals.length, goal: goals.calories } })
        : cancelDailyReminders()
      ).catch(() => {});
    }, 1500);
    return () => clearTimeout(id);
  }, [enabled, time, totals.calories, meals.length, goals.calories, lang, today, loading]);

  return null;
}
