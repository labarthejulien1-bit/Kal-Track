import Dexie, { type Table } from 'dexie';
import type { Activity, Meal, Profile, WeightLog, WaterLog, BackupFile, HealthDay } from '@/types';
import { t } from '@/i18n';

export class CalorieTrackerDB extends Dexie {
  userProfile!: Table<Profile, number>;
  meals!: Table<Meal, number>;
  weightLogs!: Table<WeightLog, number>;
  waterLogs!: Table<WaterLog, string>;
  uiState!: Table<{ key: string; open: boolean }, string>;
  activities!: Table<Activity, number>;
  healthDays!: Table<HealthDay, string>;

  constructor() {
    super('CalorieTrackerDB');
    this.version(1).stores({
      userProfile: 'id',
      meals: '++id, date, timestamp, mealType, [date+mealType], favorite',
      weightLogs: '++id, &date, timestamp',
    });
    this.version(2).stores({
      waterLogs: 'date',
    });
    // Sections repliées / ouvertes (préférences d'affichage).
    this.version(3).stores({
      uiState: 'key',
    });
    // Activité : séances (manuelles + Santé Android) et pas / calories actives par jour.
    this.version(4).stores({
      activities: '++id, date, startTime, &extId',
      healthDays: 'date',
    });
  }
}

export const db = new CalorieTrackerDB();

/**
 * Demande au navigateur un stockage persistant afin qu'Android/Chrome
 * ne purge jamais IndexedDB (même en cas de faible espace disque).
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function getStorageInfo() {
  const persisted = (await navigator.storage?.persisted?.()) ?? false;
  const est = (await navigator.storage?.estimate?.()) ?? {};
  return { persisted, usage: est.usage ?? 0, quota: est.quota ?? 0 };
}

export async function exportBackup(): Promise<BackupFile> {
  const [profile, meals, weightLogs, waterLogs, activities] = await Promise.all([
    db.userProfile.get(1),
    db.meals.toArray(),
    db.weightLogs.toArray(),
    db.waterLogs.toArray(),
    db.activities.filter((a) => a.source === 'manual').toArray(),
  ]);
  return {
    app: 'kal-track',
    version: 2,
    exportedAt: new Date().toISOString(),
    profile: profile ?? null,
    meals,
    weightLogs,
    waterLogs,
    activities,
  };
}

export async function importBackup(data: BackupFile, opts: { includeApiKey: boolean }) {
  if (!data || data.app !== 'kal-track' || !Array.isArray(data.meals)) {
    throw new Error(t('Fichier de sauvegarde invalide.'));
  }
  await db.transaction('rw', [db.userProfile, db.meals, db.weightLogs, db.waterLogs, db.activities], async () => {
    const current = await db.userProfile.get(1);
    await Promise.all([db.meals.clear(), db.weightLogs.clear(), db.waterLogs.clear()]);
    if (data.profile) {
      const p = { ...data.profile, id: 1 };
      if (!opts.includeApiKey && current) {
        p.apiKey = current.apiKey;
        p.accessCode = current.accessCode ?? '';
      }
      await db.userProfile.put(p);
    }
    await db.meals.bulkAdd(data.meals.map(({ id: _id, ...m }) => m as Meal));
    // Les dates de poids sont uniques : on garde la dernière occurrence.
    const byDate = new Map<string, WeightLog>();
    for (const w of data.weightLogs ?? []) byDate.set(w.date, w);
    await db.weightLogs.bulkAdd([...byDate.values()].map(({ id: _id, ...w }) => w as WeightLog));
    if (data.waterLogs?.length) await db.waterLogs.bulkPut(data.waterLogs);
    if (data.activities?.length) {
      await db.activities.filter((a) => a.source === 'manual').delete();
      await db.activities.bulkAdd(data.activities.filter((a) => a.source === 'manual').map(({ id: _id, extId: _e, ...a }) => a as Activity));
    }
  });
}
