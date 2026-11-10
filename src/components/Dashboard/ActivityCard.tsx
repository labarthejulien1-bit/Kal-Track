import { useEffect, useState } from 'react';
import { Footprints, Flame, Plus, RefreshCw, Trash2, HeartPulse, Loader2, HelpCircle } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { db } from '@/db/database';
import { useProfile } from '@/hooks/useProfile';
import { SPORTS, isWorkout, keyOf } from '@/lib/sport';
import { Sheet } from '@/components/ui/dialog';
import { connectHealth, healthAvailable, healthSupported, installHealthConnect, syncHealth } from '@/lib/health';
import { addDays, haptic, round, todayISO } from '@/lib/utils';
import type { ActivityLevel } from '@/types';
import type { useActivity } from '@/hooks/useActivity';
import { AddSessionSheet } from './AddSessionSheet';
import { t } from '@/i18n';

const STEPS_COLOR = '#84cc16';
/** Plages de pas (hors sport) correspondant à chaque niveau d'activité du profil. */
const LEVEL_BY_STEPS: [number, ActivityLevel][] = [
  [5000, 'sedentary'],
  [8000, 'light'],
  [12000, 'moderate'],
  [Infinity, 'very'],
];

export function ActivityCard({ date, activity }: { date: string; activity: ReturnType<typeof useActivity> }) {
  const { profile, updateProfile } = useProfile();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [help, setHelp] = useState(false);
  const bonusOn = profile.sportBonus !== false;
  const planned = profile.workoutsPerWeek;
  const connected = healthSupported && !!profile.health?.connected;
  const stepsGoal = profile.stepsGoal ?? 8000;
  const pct = Math.min(100, (activity.steps / stepsGoal) * 100);

  // Suggestion de niveau d'activité d'après la moyenne de pas (14 derniers jours, ≥ 7 jours mesurés).
  const avgSteps = useLiveQuery(async () => {
    if (!connected) return null;
    const days = (await db.healthDays.where('date').between(addDays(todayISO(), -14), addDays(todayISO(), -1), true, true).toArray()).filter((d) => d.steps > 300);
    return days.length >= 7 ? Math.round(days.reduce((n, d) => n + d.steps, 0) / days.length) : null;
  }, [connected]);
  const suggested = avgSteps ? LEVEL_BY_STEPS.find(([max]) => avgSteps < max)![1] : null;
  const showSuggestion = suggested && suggested !== profile.activityLevel && profile.activityLevel !== 'extreme';

  const connect = async () => {
    if (!(await healthAvailable())) {
      toast(t('Santé Android n’est pas disponible : installe « Health Connect » depuis le Play Store.'), 'info');
      await installHealthConnect().catch(() => {});
      return;
    }
    const ok = await connectHealth().catch(() => false);
    if (!ok) return toast(t('Aucune autorisation accordée.'), 'error');
    await updateProfile({ health: { connected: true } });
    setSyncing(true);
    await syncHealth(profile, { force: true, days: 14 }).catch(() => null);
    setSyncing(false);
    toast(t('Santé Android connectée ✔'));
  };

  const refresh = async () => {
    haptic(8);
    setSyncing(true);
    const r = await syncHealth(profile, { force: true }).catch(() => null);
    setSyncing(false);
    if (r && !r.ok) toast(t('Autorisations Santé Android retirées : reconnecte-toi dans Réglages.'), 'error');
  };

  // Synchronisation silencieuse en affichant un jour récent.
  useEffect(() => {
    if (connected && date >= addDays(todayISO(), -6)) syncHealth(profile).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, date]);

  return (
    <Card className="space-y-3 p-4">
      {/* Pas et calories actives (Santé Android) */}
      {connected ? (
        <div>
          <div className="flex items-end justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${STEPS_COLOR}22`, color: STEPS_COLOR }}>
                <Footprints className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <div className="text-lg font-bold tabular-nums text-slate-100">
                  {activity.steps.toLocaleString()} <span className="text-xs font-normal text-slate-400">/ {stepsGoal.toLocaleString()} {t('pas')}</span>
                </div>
                {activity.activeKcal > 0 && (
                  <div className="flex items-center gap-1 text-xs text-orange-400">
                    <Flame className="h-3 w-3" /> {round(activity.activeKcal)} {t('kcal actives')}
                  </div>
                )}
              </div>
            </div>
            <button onClick={refresh} className="rounded-full p-2 text-slate-400 hover:bg-slate-700/50" aria-label={t('Synchroniser')}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: STEPS_COLOR }} />
          </div>
          <p className="mt-1 text-[11px] text-slate-500">{t('Pas et calories actives : déjà inclus dans ton objectif via ton niveau d’activité au quotidien.')}</p>
          {showSuggestion && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-sky-500/10 p-2 text-xs text-sky-300">
              <span>{t('Tu fais {n} pas par jour en moyenne : ton niveau d’activité semble être « {l} ».', { n: avgSteps!.toLocaleString(), l: levelLabel(suggested!) })}</span>
              <Button size="sm" variant="secondary" className="shrink-0" onClick={() => updateProfile({ activityLevel: suggested! }).then(() => toast(t('Objectif mis à jour')))}>
                {t('Appliquer')}
              </Button>
            </div>
          )}
        </div>
      ) : (
        healthSupported && (
          <button onClick={connect} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-emerald-500/40 bg-emerald-500/5 p-3 text-left">
            <HeartPulse className="h-5 w-5 shrink-0 text-emerald-400" />
            <span className="flex-1 text-xs text-slate-300">
              <b className="block text-sm text-slate-100">{t('Connecter Santé Android')}</b>
              {t('Pas, séances de sport et poids de ta balance, automatiquement.')}
            </span>
            {syncing && <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />}
          </button>
        )
      )}

      {/* Séances du jour */}
      {activity.sessions.length > 0 && (
        <ul className="space-y-1.5">
          {activity.sessions.map((s) => {
            const bonus = activity.bonusKeys.has(keyOf(s));
            return (
              <li key={keyOf(s)} className="flex items-center gap-3 rounded-xl bg-slate-900/50 p-2.5">
                <span className="text-2xl leading-none">{SPORTS[s.type].emoji}</span>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-sm font-semibold text-slate-100">{SPORTS[s.type].label()}</div>
                  <div className="truncate text-xs text-slate-400">
                    {s.minutes} min · {s.kcal} kcal · {s.source === 'health' ? `⌚ ${s.appName || t('Santé Android')}` : '✍️'}
                  </div>
                </div>
                {!isWorkout(s) ? (
                  <span className="shrink-0 rounded-full bg-lime-500/10 px-2 py-0.5 text-[10px] text-lime-500">{t('activité quotidienne')}</span>
                ) : bonusOn && bonus ? (
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-400">+{s.kcal} kcal</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-400">{t('prévue')}</span>
                )}
                {s.source === 'manual' && (
                  <button onClick={() => s.id && db.activities.delete(s.id)} className="p-1 text-slate-500 hover:text-rose-400" aria-label={t('Supprimer')}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-900/50 px-3 py-2 text-xs">
        <span className="text-slate-300">
          {t('Séances cette semaine')} :{' '}
          <b className={activity.weekWorkouts >= planned ? 'text-emerald-400' : 'text-slate-100'}>
            {Math.min(activity.weekWorkouts, planned)}/{planned} {t('prévues')}
            {activity.weekWorkouts >= planned && ' ✓'}
          </b>
          {activity.weekWorkouts > planned ? (
            <span className="font-semibold text-emerald-400"> · {t('+{n} en plus', { n: activity.weekWorkouts - planned })}</span>
          ) : (
            activity.weekWorkouts === planned && bonusOn && <span className="text-slate-400"> · {t('les suivantes ajoutent leurs calories')}</span>
          )}
        </span>
        <button onClick={() => setHelp(true)} className="shrink-0 rounded-full p-1 text-slate-400 hover:text-emerald-400" aria-label={t('Comment est calculé mon objectif ?')}>
          <HelpCircle className="h-4 w-4" />
        </button>
      </div>

      <Button variant="secondary" className="w-full" onClick={() => setAdding(true)}>
        <Plus /> {t('Ajouter une séance')}
      </Button>
      {activity.bonusKcal > 0 && (
        <p className="text-center text-xs text-emerald-400">{t('+{n} kcal ajoutées à ton objectif du jour grâce au sport 💪', { n: activity.bonusKcal })}</p>
      )}

      <AddSessionSheet open={adding} onClose={() => setAdding(false)} date={date} />
      <GoalHelp open={help} onClose={() => setHelp(false)} planned={planned} />
    </Card>
  );
}

function levelLabel(l: ActivityLevel) {
  return { sedentary: t('Sédentaire'), light: t('Légèrement actif'), moderate: t('Modérément actif'), very: t('Très actif'), extreme: t('Extrêmement actif') }[l];
}

/** Fiche d'explication : comment l'objectif calorique est construit (sans double comptage). */
function GoalHelp({ open, onClose, planned }: { open: boolean; onClose: () => void; planned: number }) {
  const rows: [string, string, string][] = [
    ['🛌', t('Ton corps au repos'), t('Calculé avec ton âge, ta taille, ton poids et ton sexe.')],
    ['🚶', t('Ta vie quotidienne'), t('Travail, déplacements, pas : c’est ton niveau d’activité au quotidien (profil). Les pas de ta montre servent seulement à vérifier ce niveau, ils ne s’ajoutent pas.')],
    ['🏋️', t('Ton sport prévu'), t('Tes {n} séances prévues par semaine (profil) sont déjà comptées dans ton objectif, en moyenne chaque jour.', { n: planned })],
    ['💪', t('Le bonus'), t('Uniquement les séances en plus de celles prévues : leurs calories s’ajoutent à l’objectif du jour. Les marches détectées par la montre et les séances de moins de 15 min n’en font pas partie.')],
  ];
  return (
    <Sheet open={open} onClose={onClose} title={t('Comment est calculé mon objectif ?')}>
      <div className="space-y-2 pb-4">
        {rows.map(([e, title, text], i) => (
          <div key={i} className="flex gap-3 rounded-xl bg-slate-800/50 p-3">
            <span className="text-2xl leading-none">{e}</span>
            <div className="text-xs text-slate-400">
              <b className="block text-sm text-slate-100">{i + 1}. {title}</b>
              {text}
            </div>
          </div>
        ))}
        <p className="pt-1 text-center text-xs font-semibold text-emerald-400">{t('Rien n’est compté deux fois 👍')}</p>
      </div>
    </Sheet>
  );
}
