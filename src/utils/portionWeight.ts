import type { Meal } from '../types/index.js';

/**
 * Display helpers for `Meal.portionWeight` — the AI-estimated weight of ONE ready-to-eat
 * serving in grams (server/portionWeight.js).
 *
 * Point of the whole thing: "1,3 Portionen" says nothing about how much food that is.
 * Wherever a portion count is shown, the matching weight is shown next to it — always for
 * exactly the number displayed there, so the two never have to be mentally multiplied.
 */

/** Grams for `servings` servings of this meal, or null when the weight is unknown. */
export function scaledPortionWeight(meal: Pick<Meal, 'portionWeight'> | undefined, servings = 1): number | null {
  const base = meal?.portionWeight;
  if (!base || !Number.isFinite(servings) || servings <= 0) return null;
  return base * servings;
}

/** "420 g" / "1,2 kg". Rounded to 5 g — the estimate is nowhere near gram-exact. */
export function formatWeight(grams: number): string {
  if (grams >= 1000) {
    const kg = grams / 1000;
    return `${kg.toLocaleString('de-DE', { maximumFractionDigits: kg < 10 ? 1 : 0 })} kg`;
  }
  return `${Math.round(grams / 5) * 5} g`;
}

/** "ca. 420 g" for `servings` servings, or null when the weight is unknown. */
export function formatPortionWeight(meal: Pick<Meal, 'portionWeight'> | undefined, servings = 1): string | null {
  const grams = scaledPortionWeight(meal, servings);
  return grams === null ? null : `ca. ${formatWeight(grams)}`;
}

/** Tooltip explaining what the number means — the estimate is not obvious from "ca. 420 g". */
export const PORTION_WEIGHT_TITLE =
  'Geschätztes Gewicht, fertig zubereitet und verzehrfertig (KI-Schätzung aus den Zutaten inkl. Garverlusten)';

/**
 * Tooltip next to a portion count. The label itself shows the weight of exactly that many
 * portions; for a plan entry ("2,6 Portionen" for two people) the tooltip adds what ONE
 * portion weighs, so the pot total and the plate never have to be told apart by arithmetic.
 */
export function portionWeightTitle(meal: Pick<Meal, 'portionWeight'> | undefined, servings = 1): string | undefined {
  const total = scaledPortionWeight(meal, servings);
  if (total === null) return undefined;
  const one = formatWeight(meal!.portionWeight!);
  const amount = Math.abs(servings - 1) < 0.01
    ? `ca. ${one}`
    : `ca. ${formatWeight(total)} gesamt, ca. ${one} pro Portion`;
  return `${amount} — ${PORTION_WEIGHT_TITLE}`;
}
