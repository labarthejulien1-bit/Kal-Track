/** Avis et contact : demande d'avis Google Play intégrée + e-mail de retour. */
import { db } from '@/db/database';
import { isNative } from '@/lib/native';
import { getLang } from '@/i18n';
import { addDays, todayISO } from '@/lib/utils';

/** Adresse de contact (retours utilisateurs, politique de confidentialité). */
export const CONTACT_EMAIL = 'kalapps.contact@gmail.com';
export const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.kaltrack.app';
export const APP_VERSION = '1.0';

const DAY = 86_400_000;

/**
 * Demande d'avis au bon moment : application Android, au moins 7 jours d'utilisation,
 * au moins 5 jours avec des repas notés, et pas de demande depuis 90 jours.
 * Google limite en plus lui-même la fréquence d'affichage.
 */
export async function maybeAskReview() {
  if (!isNative) return;
  try {
    const p = await db.userProfile.get(1);
    if (!p) return;
    if (Date.now() - (p.createdAt ?? Date.now()) < 7 * DAY) return;
    if (p.reviewAskedAt && Date.now() - p.reviewAskedAt < 90 * DAY) return;
    const dates = new Set((await db.meals.where('date').above(addDays(todayISO(), -30)).toArray()).map((m) => m.date));
    if (dates.size < 5) return;
    await db.userProfile.update(1, { reviewAskedAt: Date.now() });
    const { InAppReview } = await import('@capacitor-community/in-app-review');
    setTimeout(() => InAppReview.requestReview().catch(() => {}), 1200); // après la confirmation d'enregistrement
  } catch {
    /* jamais bloquant */
  }
}

/** Ouvre l'e-mail de retour, avec version et langue pour aider au diagnostic. */
export function feedbackMailto(subject: string) {
  const body = `\n\n—\nKal-Track ${APP_VERSION} · ${isNative ? 'Android' : 'Web'} · ${getLang()} · ${navigator.userAgent}`;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
