import type { ActivityDay, WeekDayTypes } from '../types/index.js';

/** Rolling window for the per-weekday average: the last 6 weeks of completed days. */
export const WINDOW_DAYS = 42;
/** A weekday needs at least this many measured days before its average replaces the profile estimate. */
export const MIN_SAMPLES = 2;
/** Thermic effect of food on top of BMR — not part of Apple's "Active Energy". */
export const TEF = 0.10;
/** Below this a day is taken as "Watch not worn" and ignored — even a lazy day burns more. */
export const MIN_VALID_KCAL = 100;

export type WeekdayKey = keyof WeekDayTypes;

/** Indexed by Date#getDay() (0 = Sunday). */
export const WEEKDAY_KEYS: WeekdayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export type WeekdayAverage = { avg: number; n: number };

export type ActivityModel = {
  byDate: Map<string, number>;
  weekdayAvg: Partial<Record<WeekdayKey, WeekdayAverage>>;
  /** Share of the measured active kcal that counts (Apple Watch tends to overestimate). */
  factor: number;
  today: string;
};

export type ActiveKcal = {
  kcal: number;
  source: 'actual' | 'weekday';
  /** Number of measured days behind a weekday average. */
  n?: number;
};

/** Weekday of a YYYY-MM-DD string (parsed as UTC, so independent of the local timezone). */
export function weekdayOf(date: string): WeekdayKey {
  return WEEKDAY_KEYS[new Date(date).getUTCDay()];
}

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The next date (today included) falling on `key` — what "this weekday from now on" is planned with. */
export function nextDateForWeekday(today: string, key: WeekdayKey): string {
  const offset = (WEEKDAY_KEYS.indexOf(key) - new Date(today).getUTCDay() + 7) % 7;
  return addDays(today, offset);
}

/**
 * Index the measured days and average each weekday over the rolling window. Only completed days
 * count (before `today`): today's value is still growing until the evening push. Days below
 * MIN_VALID_KCAL are treated as missing, not as a day without activity.
 */
export function buildActivityModel(days: ActivityDay[], factor: number, today: string): ActivityModel {
  const valid = days.filter(d => d.activeKcal >= MIN_VALID_KCAL);
  const byDate = new Map(valid.map(d => [d.date, d.activeKcal]));
  const windowStart = addDays(today, -WINDOW_DAYS);

  const sums: Partial<Record<WeekdayKey, { sum: number; n: number }>> = {};
  for (const d of valid) {
    if (d.date < windowStart || d.date >= today) continue;
    const key = weekdayOf(d.date);
    const s = (sums[key] ??= { sum: 0, n: 0 });
    s.sum += d.activeKcal;
    s.n++;
  }

  const weekdayAvg: ActivityModel['weekdayAvg'] = {};
  for (const [key, s] of Object.entries(sums) as [WeekdayKey, { sum: number; n: number }][]) {
    weekdayAvg[key] = { avg: s.sum / s.n, n: s.n };
  }
  return { byDate, weekdayAvg, factor, today };
}

/**
 * Active kcal to plan a date with (before the factor): the measured value for completed past days,
 * otherwise the weekday's rolling average — or null when there is too little data for that weekday.
 */
export function activeKcalForDate(model: ActivityModel, date: string): ActiveKcal | null {
  const actual = date < model.today ? model.byDate.get(date) : undefined;
  if (actual !== undefined) return { kcal: actual, source: 'actual' };
  const avg = model.weekdayAvg[weekdayOf(date)];
  if (avg && avg.n >= MIN_SAMPLES) return { kcal: avg.avg, source: 'weekday', n: avg.n };
  return null;
}
