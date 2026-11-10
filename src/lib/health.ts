/**
 * Santé Android (Health Connect) — lecture seule, 100 % sur le téléphone.
 * Pas, calories actives, séances de sport et poids d'une balance connectée.
 * Les données lues sont mises en cache dans IndexedDB : le Journal s'affiche instantanément,
 * la synchronisation se fait en arrière-plan (ouverture / retour dans l'appli, au plus toutes les 5 min).
 */
import { db } from '@/db/database';
import { isNative } from '@/lib/native';
import { estimateKcal, sportFromHealth } from '@/lib/sport';
import { addDays, round, toISODate, todayISO } from '@/lib/utils';
import type { Activity, HealthDay, Profile } from '@/types';

export const healthSupported = isNative;
const PERMISSIONS = ['READ_STEPS', 'READ_ACTIVE_CALORIES', 'READ_WORKOUTS', 'READ_WEIGHT'] as const;
const THROTTLE_MS = 5 * 60_000;
let lastRun = 0;
let running: Promise<SyncResult> | null = null;

/** ⚠️ Ne pas renvoyer l'objet plugin depuis une fonction async (Capacitor le prendrait pour une promesse). */
function plugin() {
  return import('capacitor-health');
}

export async function healthAvailable(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const { Health } = await plugin();
    return (await Health.isHealthAvailable()).available;
  } catch {
    return false;
  }
}

/** Ouvre Santé Android dans le Play Store (anciens téléphones sans Health Connect intégré). */
export async function installHealthConnect() {
  const { Health } = await plugin();
  await Health.showHealthConnectInPlayStore();
}

export async function openHealthSettings() {
  const { Health } = await plugin();
  await Health.openHealthConnectSettings();
}

/** Demande les autorisations. Renvoie true si au moins une donnée est accessible. */
export async function connectHealth(): Promise<boolean> {
  const { Health } = await plugin();
  const res = await Health.requestHealthPermissions({ permissions: [...PERMISSIONS] });
  return grantedFrom(res.permissions).length > 0;
}

function grantedFrom(list: { [k: string]: boolean }[]) {
  return list.flatMap((o) => Object.entries(o).filter(([, v]) => v).map(([k]) => k));
}

export interface SyncResult {
  ok: boolean;
  steps?: number;
  workouts?: number;
  weights?: number;
}

/** Synchronise les `days` derniers jours (7 par défaut). Sans effet si appelée trop souvent, sauf `force`. */
export function syncHealth(profile: Pick<Profile, 'weight'>, opts: { force?: boolean; days?: number } = {}): Promise<SyncResult> {
  if (!isNative) return Promise.resolve({ ok: false });
  if (running) return running;
  if (!opts.force && Date.now() - lastRun < THROTTLE_MS) return Promise.resolve({ ok: true });
  running = doSync(profile, opts.days ?? 7).finally(() => {
    running = null;
    lastRun = Date.now();
  });
  return running;
}

async function doSync(profile: Pick<Profile, 'weight'>, days: number): Promise<SyncResult> {
  const { Health } = await plugin();
  const check = await Health.checkHealthPermissions({ permissions: [...PERMISSIONS] });
  const granted = new Set(grantedFrom(check.permissions));
  if (!granted.size) return { ok: false };

  const today = todayISO();
  const fromDate = addDays(today, -(days - 1));
  const start = new Date(`${fromDate}T00:00:00`).toISOString();
  const end = new Date().toISOString();
  const localDate = (iso: string) => toISODate(new Date(iso));

  // Requêtes en parallèle : une par type de donnée, sur toute la période (rapide).
  const [steps, kcal, workouts, weights] = await Promise.all([
    granted.has('READ_STEPS') ? Health.queryAggregated({ startDate: start, endDate: end, dataType: 'steps', bucket: 'day' }).catch(() => null) : null,
    granted.has('READ_ACTIVE_CALORIES') ? Health.queryAggregated({ startDate: start, endDate: end, dataType: 'active-calories', bucket: 'day' }).catch(() => null) : null,
    granted.has('READ_WORKOUTS') ? Health.queryWorkouts({ startDate: start, endDate: end, includeHeartRate: false, includeRoute: false, includeSteps: false }).catch(() => null) : null,
    granted.has('READ_WEIGHT') ? Health.queryRecords({ startDate: new Date(`${addDays(today, -29)}T00:00:00`).toISOString(), endDate: end, dataType: 'weight' }).catch(() => null) : null,
  ]);

  // Résumé quotidien
  const dayMap = new Map<string, HealthDay>();
  for (let d = fromDate; d <= today; d = addDays(d, 1)) dayMap.set(d, { date: d, steps: 0, activeKcal: 0, syncedAt: Date.now() });
  for (const s of steps?.aggregatedData ?? []) {
    const d = dayMap.get(localDate(s.startDate));
    if (d) d.steps += Math.round(s.value);
  }
  for (const s of kcal?.aggregatedData ?? []) {
    const d = dayMap.get(localDate(s.startDate));
    if (d) d.activeKcal += Math.round(s.value);
  }

  // Séances
  const acts: Activity[] = (workouts?.workouts ?? [])
    .filter((w) => w.duration >= 5 * 60)
    .map((w) => {
      const type = sportFromHealth(w.workoutType);
      const minutes = Math.round(w.duration / 60);
      return {
        date: localDate(w.startDate),
        startTime: new Date(w.startDate).getTime(),
        type,
        minutes,
        kcal: w.calories > 0 ? Math.round(w.calories) : estimateKcal(type, minutes, profile.weight),
        source: 'health' as const,
        extId: w.id || `${w.startDate}|${w.workoutType}`,
        appName: w.sourceName || undefined,
      };
    });

  // Poids : 1 par jour (la première pesée du jour), sans écraser une pesée saisie dans Kal-Track.
  const firstByDay = new Map<string, number>();
  for (const r of [...(weights?.records ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const d = localDate(r.startDate);
    if (!firstByDay.has(d) && r.value > 20 && r.value < 400) firstByDay.set(d, r.value);
  }

  let newWeights = 0;
  await db.transaction('rw', [db.healthDays, db.activities, db.weightLogs, db.userProfile], async () => {
    if (steps || kcal) await db.healthDays.bulkPut([...dayMap.values()]);
    if (workouts) {
      // Remplace les séances Santé Android de la période (suppressions côté montre prises en compte).
      await db.activities.where('date').between(fromDate, today, true, true).filter((a) => a.source === 'health').delete();
      if (acts.length) {
        await db.activities.where('extId').anyOf(acts.map((a) => a.extId!)).delete();
        await db.activities.bulkAdd(acts);
      }
    }
    for (const [date, kg] of firstByDay) {
      if (await db.weightLogs.where('date').equals(date).count()) continue;
      await db.weightLogs.add({ date, weight: round(kg, 1), note: 'Santé Android', timestamp: Date.now() });
      newWeights++;
    }
    // La pesée la plus récente met à jour le poids du profil (calcul des besoins).
    if (newWeights) {
      const latest = await db.weightLogs.orderBy('date').last();
      const p = await db.userProfile.get(1);
      if (latest && p && latest.note === 'Santé Android') await db.userProfile.put({ ...p, weight: latest.weight, updatedAt: Date.now() });
    }
  });
  return { ok: true, steps: dayMap.get(today)?.steps, workouts: acts.length, weights: newWeights };
}
