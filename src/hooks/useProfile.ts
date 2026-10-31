import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo } from 'react';
import { db } from '@/db/database';
import { computeGoals, DEFAULT_PROFILE } from '@/services/bmrCalculator';
import type { Goals, Profile } from '@/types';

export async function ensureProfile(): Promise<Profile> {
  const p = await db.userProfile.get(1);
  if (p) return { ...DEFAULT_PROFILE, ...p };
  const fresh = { ...DEFAULT_PROFILE, createdAt: Date.now(), updatedAt: Date.now() };
  await db.userProfile.put(fresh);
  return fresh;
}

export function useProfile() {
  const stored = useLiveQuery(() => db.userProfile.get(1).then((p) => p ?? null), []);
  const loading = stored === undefined;
  const profile: Profile = useMemo(() => ({ ...DEFAULT_PROFILE, ...(stored ?? {}) }), [stored]);
  const goals: Goals = useMemo(() => computeGoals(profile), [profile]);

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    await db.transaction('rw', db.userProfile, async () => {
      const current = (await db.userProfile.get(1)) ?? DEFAULT_PROFILE;
      await db.userProfile.put({ ...DEFAULT_PROFILE, ...current, ...patch, id: 1, updatedAt: Date.now() });
    });
  }, []);

  return { profile, goals, loading, hasProfile: !!stored, updateProfile };
}
