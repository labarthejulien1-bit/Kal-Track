/**
 * Rappel quotidien (1 notification maximum par jour), uniquement dans l'application Android.
 * Notifications locales programmées sur le téléphone : aucun serveur, aucune donnée envoyée.
 */
import { isNative } from '@/lib/native';
import { t } from '@/i18n';

export const notificationsSupported = isNative;
const DAYS_AHEAD = 7; // programmé sur une semaine, reprogrammé à chaque ouverture de l'appli
const BASE_ID = 7100;

async function plugin() {
  return (await import('@capacitor/local-notifications')).LocalNotifications;
}

/** Demande l'autorisation d'afficher des notifications (Android 13+). */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative) return false;
  const LN = await plugin();
  let p = await LN.checkPermissions();
  if (p.display === 'prompt' || p.display === 'prompt-with-rationale') p = await LN.requestPermissions();
  return p.display === 'granted';
}

export async function cancelDailyReminders() {
  if (!isNative) return;
  const LN = await plugin();
  await LN.cancel({ notifications: Array.from({ length: DAYS_AHEAD }, (_, i) => ({ id: BASE_ID + i })) });
}

/** Messages bienveillants pour les jours suivants (texte français = clé de traduction). */
function genericMessages() {
  return [
    t('Petit rappel bienveillant : on fait attention aux calories aujourd’hui 😊'),
    t('Pense à noter tes repas : une photo et c’est fait 📸'),
    t('Un grand verre d’eau ? Ton corps te dira merci 💧'),
    t('Des légumes au prochain repas ? Ta journée n’en sera que plus équilibrée 🥦'),
    t('Chaque repas noté te rapproche de ton objectif. Continue comme ça ! 💪'),
    t('Pense aux protéines aujourd’hui : œufs, skyr, poulet ou légumineuses 🥚'),
    t('Prends le temps de savourer : la satiété arrive au bout de 20 minutes ⏳'),
  ];
}

/** Message du jour selon ce qui est déjà noté (calculé à chaque modification du journal). */
function todayMessage(day: { calories: number; meals: number; goal: number }) {
  if (day.meals === 0) return t('Tu n’as encore rien noté aujourd’hui. Un petit point sur tes repas ? 🍽️');
  const left = Math.round(day.goal - day.calories);
  if (left > 150) return t('Il te reste environ {n} kcal pour aujourd’hui 🥗', { n: left });
  if (left >= -150) return t('Objectif du jour quasiment atteint, bravo ! 🎯');
  return t('Un peu au-dessus de l’objectif aujourd’hui ? Pas grave, demain on repart du bon pied 💪');
}

/**
 * (Re)programme le rappel : aujourd'hui (si l'heure n'est pas passée) puis les jours suivants.
 * Une seule notification par jour, à l'heure choisie.
 */
export async function scheduleDailyReminders(opts: { time: string; today: { calories: number; meals: number; goal: number } }) {
  if (!isNative) return;
  const LN = await plugin();
  const perm = await LN.checkPermissions();
  if (perm.display !== 'granted') return;
  await cancelDailyReminders();

  const [h, m] = opts.time.split(':').map(Number);
  const now = new Date();
  const generic = genericMessages();
  const notifications = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, h || 0, m || 0, 0);
    if (at.getTime() <= now.getTime() + 60_000) continue;
    const dayOfYear = Math.floor((at.getTime() - new Date(at.getFullYear(), 0, 0).getTime()) / 86_400_000);
    notifications.push({
      id: BASE_ID + i,
      title: 'Kal-Track',
      body: i === 0 ? todayMessage(opts.today) : generic[dayOfYear % generic.length],
      schedule: { at },
      isExactNotification: false,
      smallIcon: 'ic_stat_kaltrack',
      iconColor: '#059669',
    });
  }
  if (notifications.length) await LN.schedule({ notifications });
}

/** Notification d'essai dans 5 secondes (pour vérifier que tout fonctionne). */
export async function sendTestReminder() {
  if (!(await requestNotificationPermission())) return false;
  const LN = await plugin();
  await LN.schedule({
    notifications: [
      {
        id: BASE_ID + 99,
        title: 'Kal-Track',
        body: t('Petit rappel bienveillant : on fait attention aux calories aujourd’hui 😊'),
        schedule: { at: new Date(Date.now() + 5000) },
        isExactNotification: false,
        smallIcon: 'ic_stat_kaltrack',
        iconColor: '#059669',
      },
    ],
  });
  return true;
}
