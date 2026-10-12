import { useEffect, useState } from 'react';
import type { User } from '../types/index.js';
import { CANTEEN_KEYS, CANTEENS, loadCanteenDays, type CanteenKey } from '../utils/canteens';

/** Canteens of the user with a published menu on `date` (parsed pages, cached on the server — no AI). */
export function useCanteensOnDate(user: User | null, date: string): { key: CanteenKey; weekday: string }[] {
  const [available, setAvailable] = useState<{ key: CanteenKey; weekday: string }[]>([]);
  const enabled = CANTEEN_KEYS.filter(k => CANTEENS[k].enabled(user)).join(',');

  useEffect(() => {
    let cancelled = false;
    const keys = enabled ? (enabled.split(',') as CanteenKey[]) : [];
    Promise.all(keys.map(key => loadCanteenDays(key)
      .then(days => days.find(d => d.date === date && d.dishes.length > 0))
      .then(day => (day ? { key, weekday: day.weekday } : null))
      .catch(() => null))) // no shortcut then
      .then(list => { if (!cancelled) setAvailable(list.filter(x => x !== null)); });
    return () => { cancelled = true; };
  }, [enabled, date]);

  return available;
}
