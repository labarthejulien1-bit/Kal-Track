import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';

/** Eau bue par jour (ml) sur une période, indexée par date ISO. */
export function useWaterRange(start: string, end: string): Record<string, number> {
  const logs = useLiveQuery(() => db.waterLogs.where('date').between(start, end, true, true).toArray(), [start, end]);
  return Object.fromEntries((logs ?? []).map((l) => [l.date, l.ml]));
}

export function useWater(date: string) {
  const log = useLiveQuery(() => db.waterLogs.get(date), [date]);
  const ml = log?.ml ?? 0;
  const add = async (delta: number) => {
    const cur = (await db.waterLogs.get(date))?.ml ?? 0;
    await db.waterLogs.put({ date, ml: Math.max(0, cur + delta) });
  };
  return { ml, add };
}
