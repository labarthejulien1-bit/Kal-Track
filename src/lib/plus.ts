/**
 * Kal-Track Plus : abonnement Google Play (mensuel / annuel) qui augmente le nombre d'analyses IA par jour.
 *
 * - L'achat passe par la facturation Google Play (fenêtre de paiement de Google).
 * - Le jeton d'achat est gardé dans le profil et envoyé au serveur IA, qui le vérifie auprès de Google :
 *   la limite d'analyses est donc appliquée côté serveur (impossible à contourner dans l'appli).
 * - Les fondateurs (ticket fondateur) ont les avantages Plus sans abonnement.
 */
import { db } from '@/db/database';
import { isNative } from '@/lib/native';

/** Identifiants créés dans la Play Console (Monétiser → Abonnements). */
export const PLUS_PRODUCT = 'kaltrack_plus';
export type PlusPlan = 'monthly' | 'yearly';
export const PLUS_PLANS: PlusPlan[] = ['monthly', 'yearly'];

/** Analyses IA par jour (affichage ; la valeur qui fait foi est celle du serveur). */
export const FREE_DAILY = 2;
export const PLUS_DAILY = 20;

export interface PlusOffer {
  plan: PlusPlan;
  price: string;
}

/** ⚠️ Ne pas renvoyer l'objet plugin depuis une fonction async (Capacitor le prendrait pour une promesse). */
function plugin() {
  return import('@capgo/native-purchases');
}

/** L'achat n'est possible que dans l'appli Android installée depuis Google Play. */
export const plusPurchasable = isNative;

/** Prix affichés par Google Play (dans la devise et la langue du téléphone). */
export async function plusOffers(): Promise<PlusOffer[]> {
  if (!plusPurchasable) return [];
  const { NativePurchases, PURCHASE_TYPE } = await plugin();
  const { products } = await NativePurchases.getProducts({ productIdentifiers: [PLUS_PRODUCT], productType: PURCHASE_TYPE.SUBS });
  // Android : `identifier` = formule (base plan), `planIdentifier` = produit.
  return PLUS_PLANS.flatMap((plan) => {
    const p = products.find((x) => x.identifier === plan);
    return p ? [{ plan, price: p.priceString }] : [];
  });
}

async function saveToken(token: string | null, plan?: PlusPlan) {
  const p = await db.userProfile.get(1);
  if (!p) return;
  await db.userProfile.update(1, { plus: token ? { token, plan, since: p.plus?.token === token ? p.plus.since : new Date().toISOString().slice(0, 10) } : undefined });
}

/** Lance l'achat ; renvoie true si l'abonnement est pris. Une annulation renvoie false sans erreur. */
export async function buyPlus(plan: PlusPlan): Promise<boolean> {
  const { NativePurchases, PURCHASE_TYPE } = await plugin();
  try {
    const tx = await NativePurchases.purchaseProduct({ productIdentifier: PLUS_PRODUCT, planIdentifier: plan, productType: PURCHASE_TYPE.SUBS, quantity: 1 });
    if (!tx.purchaseToken) return false;
    await saveToken(tx.purchaseToken, plan);
    return true;
  } catch (e) {
    if (/cancel/i.test(String((e as Error)?.message ?? e))) return false;
    throw e;
  }
}

/**
 * Relit les abonnements du compte Google (nouveau téléphone, réinstallation, renouvellement, résiliation).
 * Renvoie true si un abonnement Plus est en cours.
 */
export async function restorePlus(): Promise<boolean> {
  if (!plusPurchasable) return false;
  const { NativePurchases, PURCHASE_TYPE } = await plugin();
  const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS });
  const sub = purchases.find((x) => x.productIdentifier === PLUS_PRODUCT && x.purchaseToken && x.purchaseState === '1');
  await saveToken(sub?.purchaseToken ?? null);
  return !!sub;
}

/** Page Google Play « Abonnements » (changer de formule, résilier). */
export async function managePlus() {
  const { NativePurchases } = await plugin();
  await NativePurchases.manageSubscriptions();
}

/** En-têtes envoyés au serveur IA pour appliquer la bonne formule. */
export async function tierHeaders(): Promise<Record<string, string>> {
  const p = await db.userProfile.get(1).catch(() => undefined);
  const h: Record<string, string> = {};
  if (p?.founder) h['X-Kal-Founder'] = `${p.founder.since}.${p.founder.sig}`;
  if (p?.plus?.token) h['X-Kal-Plus'] = p.plus.token;
  return h;
}
