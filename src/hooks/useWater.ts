import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';

export function useWater(date: string) {
  const log = useLiveQuery(() => db.waterLogs.get(date), [date]);
  const ml = log?.ml ?? 0;
  const add = async (delta: number) => {
    const cur = (await db.waterLogs.get(date))?.ml ?? 0;
    await db.waterLogs.put({ date, ml: Math.max(0, cur + delta) });
  };
  return { ml, add };
}
