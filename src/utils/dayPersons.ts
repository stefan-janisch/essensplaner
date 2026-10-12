import type { MealPlan } from '../types/index.js';

/**
 * How many people eat on a given day.
 *
 * A plan has one person count ("Personen" in the plan header), but real weeks are not that
 * tidy — guests on Saturday, alone on Wednesday. `plan.dayPersons` holds the exceptions;
 * everything else falls back to the plan's count and then to the user's default.
 *
 * This is the number day totals are divided by to get per-person values (day score, traffic
 * light, optimizer bounds, monthly report), and the default portion count for meals added
 * to that day.
 */
export function personsForDate(
  plan: Pick<MealPlan, 'dayPersons' | 'defaultServings'> | null | undefined,
  date: string,
  fallback: number,
): number {
  const override = plan?.dayPersons?.find(d => d.date === date)?.persons;
  return Math.max(1, override ?? plan?.defaultServings ?? fallback);
}

/** True when this day deviates from the plan's person count — the UI highlights those. */
export function hasDayPersonsOverride(
  plan: Pick<MealPlan, 'dayPersons'> | null | undefined,
  date: string,
): boolean {
  return !!plan?.dayPersons?.some(d => d.date === date);
}
