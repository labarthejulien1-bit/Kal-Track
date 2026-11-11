import { useEffect, useState } from 'react';
import { CheckCircle2, Crown, Loader2 } from 'lucide-react';
import { CollapsibleCard } from '@/components/ui/collapsible';
import { useToast } from '@/components/ui/toast';
import { FREE_DAILY, PLUS_DAILY, buyPlus, managePlus, plusOffers, plusPurchasable, restorePlus, type PlusOffer, type PlusPlan } from '@/lib/plus';
import type { AiTier } from '@/services/geminiVision';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

/**
 * Carte « Kal-Track Plus » des réglages : discrète, sans publicité ailleurs dans l'appli.
 * La formule affichée (gratuit / Plus / fondateur) vient du serveur, qui fait foi.
 */
export function PlusCard({ tier, onChanged }: { tier?: AiTier; onChanged: () => void }) {
  const toast = useToast();
  const [offers, setOffers] = useState<PlusOffer[] | null>(null);
  const [busy, setBusy] = useState<PlusPlan | 'restore' | null>(null);

  useEffect(() => {
    if (!plusPurchasable) return;
    plusOffers()
      .then(setOffers)
      .catch(() => setOffers([]));
  }, []);

  const buy = async (plan: PlusPlan) => {
    setBusy(plan);
    try {
      if (await buyPlus(plan)) {
        toast(t('Merci ! Kal-Track Plus est activé 🎉'));
        onChanged();
      }
    } catch {
      toast(t("L'achat n'a pas pu aboutir. Réessaie plus tard."), 'error');
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setBusy('restore');
    try {
      const ok = await restorePlus();
      toast(ok ? t('Abonnement Kal-Track Plus retrouvé ✔') : t('Aucun abonnement trouvé sur ce compte Google.'), ok ? 'success' : 'info');
      onChanged();
    } catch {
      toast(t('Google Play est injoignable. Réessaie plus tard.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const isPlus = tier === 'plus';
  const isFounder = tier === 'founder';
  const summary = isPlus
    ? t('Abonné ✔ · {n} analyses IA par jour', { n: PLUS_DAILY })
    : isFounder
      ? t('Fondateur ✔ · avantages Plus offerts')
      : t('{a} → {b} analyses IA par jour', { a: FREE_DAILY, b: PLUS_DAILY });

  return (
    <CollapsibleCard id="s.plus" icon={<Crown className="h-4 w-4 text-amber-400" />} title={t('Kal-Track Plus')} summary={summary}>
      <div className="space-y-3 text-sm">
        <ul className="space-y-1.5 text-xs text-slate-300">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <span>{t('{b} analyses IA par jour (photo, description, étiquette) au lieu de {a}', { a: FREE_DAILY, b: PLUS_DAILY })}</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <span>{t('Tu soutiens le développement de Kal-Track, sans publicité')}</span>
          </li>
        </ul>

        {isFounder && (
          <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-200">
            {t('Merci d’être là depuis le début ! En tant que fondateur, tu profites des avantages Plus gratuitement, à vie.')}
          </p>
        )}

        {isPlus && (
          <button type="button" onClick={() => managePlus().catch(() => undefined)} className="w-full rounded-xl border border-slate-700 py-2.5 text-xs font-semibold text-slate-200 active:scale-[0.98]">
            {t('Gérer ou résilier mon abonnement')}
          </button>
        )}

        {!isPlus && !isFounder && plusPurchasable && (
          <div className="grid grid-cols-2 gap-2">
            {offers === null ? (
              <p className="col-span-2 flex items-center justify-center gap-2 py-3 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('Chargement des offres…')}
              </p>
            ) : offers.length === 0 ? (
              <p className="col-span-2 py-2 text-center text-xs text-slate-400">{t('L’abonnement sera bientôt disponible.')}</p>
            ) : (
              offers.map((o) => (
                <button
                  key={o.plan}
                  type="button"
                  disabled={!!busy}
                  onClick={() => buy(o.plan)}
                  className={cn(
                    'relative flex flex-col items-center rounded-xl border px-2 py-3 transition active:scale-95 disabled:opacity-60',
                    o.plan === 'yearly' ? 'border-amber-400/70 bg-amber-500/10' : 'border-slate-700',
                  )}
                >
                  {o.plan === 'yearly' && <span className="absolute -top-2 rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-bold text-slate-900">{t('Le plus avantageux')}</span>}
                  <span className="text-[11px] text-slate-400">{o.plan === 'yearly' ? t('Annuel') : t('Mensuel')}</span>
                  <span className="text-base font-bold text-slate-50">{busy === o.plan ? <Loader2 className="h-4 w-4 animate-spin" /> : o.price}</span>
                  <span className="text-[10px] text-slate-500">{o.plan === 'yearly' ? t('par an') : t('par mois')}</span>
                </button>
              ))
            )}
          </div>
        )}

        {!plusPurchasable && !isPlus && !isFounder && (
          <p className="text-xs text-slate-400">{t('L’abonnement se prend dans l’appli Android Kal-Track (Google Play).')}</p>
        )}

        {plusPurchasable && !isFounder && (
          <button type="button" onClick={restore} disabled={!!busy} className="flex items-center gap-1.5 text-[11px] text-slate-400 underline">
            {busy === 'restore' && <Loader2 className="h-3 w-3 animate-spin" />}
            {t('Restaurer mon achat')}
          </button>
        )}

        {!isFounder && <p className="text-[10px] leading-snug text-slate-500">{t('Paiement et renouvellement automatique via Google Play. Résiliable à tout moment dans Google Play → Abonnements.')}</p>}
      </div>
    </CollapsibleCard>
  );
}
