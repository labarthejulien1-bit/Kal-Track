/**
 * Ticket « fondateur » : à la première ouverture, le serveur signe la date du jour.
 * Ce ticket est gardé dans le profil (et dans les sauvegardes, donc conservé en changeant de téléphone).
 * Il permettra, le jour où un abonnement existera, de garder les avantages des premiers utilisateurs.
 * Infalsifiable (signature secrète du serveur) et rien n'est enregistré côté serveur.
 */
import { db } from '@/db/database';
import { AI_PROXY_URL } from '@/services/geminiVision';

let pending = false;

export async function ensureFounderTicket() {
  if (pending) return;
  pending = true;
  try {
    const p = await db.userProfile.get(1);
    if (!p || p.founder) return;
    const res = await fetch(`${AI_PROXY_URL}/ticket`);
    if (!res.ok) return;
    const { since, sig } = await res.json();
    if (typeof since === 'string' && typeof sig === 'string') await db.userProfile.update(1, { founder: { since, sig } });
  } catch {
    /* hors connexion : nouvel essai à la prochaine ouverture */
  } finally {
    pending = false;
  }
}
