import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import type { WeightLog } from '@/types';
import { ensureProfile } from './useProfile';

export function useWeights() {
  const logs = useLiveQuery(() => db.weightLogs.orderBy('date').toArray(), []);
  return { logs: logs ?? [], loading: logs === undefined };
}

/** Enregistre (ou remplace) le poids d'une date donnée et met à jour le profil si c'est la plus récente. */
export async function upsertWeight(date: string, weight: number, note?: string) {
  await db.transaction('rw', db.weightLogs, db.userProfile, async () => {
    const existing = await db.weightLogs.where('date').equals(date).first();
    const entry: WeightLog = { ...(existing ?? {}), date, weight, note, timestamp: Date.now() };
    await db.weightLogs.put(entry);
    const latest = await db.weightLogs.orderBy('date').last();
    if (latest && latest.date === date) {
      const p = await ensureProfile();
      await db.userProfile.put({ ...p, weight, updatedAt: Date.now() });
    }
  });
}

export async function deleteWeight(id: number) {
  await db.weightLogs.delete(id);
}

/** Moyenne mobile exponentielle (tendance lissée, type « Happy Scale »). */
export function trendSeries(logs: WeightLog[], alpha = 0.25) {
  let ema: number | null = null;
  return logs.map((l) => {
    ema = ema === null ? l.weight : ema + alpha * (l.weight - ema);
    return { ...l, trend: Math.round(ema * 10) / 10 };
  });
}
