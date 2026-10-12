import type { Meal, NutritionInfo, NutritionTargets } from '../types/index.js';

/**
 * Helpers for hitting the protein target without losing the calorie deficit: how much protein a
 * day still lacks, how much energy budget is left for it, the protein density the rest of the day
 * therefore needs, and which small protein boosters (scaled to fit) would close the gap.
 */

export type ProteinGap = {
  /** Protein still missing to the day's target (g, ≥ 0). */
  protein: number;
  /** Energy budget left until the day's kcal target (≥ 0). */
  kcal: number;
};

/** Below this the target counts as reached — no suggestions for a few grams. */
const GAP_EPSILON_G = 5;

export function proteinGap(totals: NutritionInfo, targets: NutritionTargets): ProteinGap {
  return {
    protein: Math.max(0, targets.protein - totals.protein),
    kcal: Math.max(0, targets.kcal - totals.kcal),
  };
}

/**
 * Protein density (g / 100 kcal) the rest of the day needs to still reach the target within the
 * kcal budget. `null` = target (practically) reached, `Infinity` = no kcal budget left.
 */
export function requiredDensity(gap: ProteinGap): number | null {
  if (gap.protein < GAP_EPSILON_G) return null;
  if (gap.kcal <= 0) return Infinity;
  return (gap.protein / gap.kcal) * 100;
}

/** Average density a whole day needs to meet both targets (e.g. 180 g in 2766 kcal → 6.5). */
export function targetDensity(targets: NutritionTargets): number {
  return targets.kcal > 0 ? (targets.protein / targets.kcal) * 100 : 0;
}

// "Small boosters": high-protein recipes that fit a snack slot (no main dishes).
const BOOSTER_CATEGORIES = new Set(['snack', 'getraenk', 'dessert', 'fruehstueck']);
const HIGH_PROTEIN_TAG = 'ernährung:high-protein';
const MIN_MULT = 0.25;
const MAX_MULT = 2;

export type BoosterSuggestion = {
  meal: Meal;
  /** Portion per person, scaled to fill the gap. */
  multiplier: number;
  /** Protein / kcal per person at that portion. */
  protein: number;
  kcal: number;
};

/**
 * Small protein boosters, each scaled so it fills the protein gap without exceeding the kcal
 * budget (0.25–2× a portion, rounded down to 0.05). Boosters for which even a quarter portion
 * blows the budget are left out. Boosters that (nearly) close the gap come first, cheapest in kcal
 * first; the rest follow by protein contribution.
 */
export function boosterSuggestions(meals: Meal[], gap: ProteinGap, limit = 4): BoosterSuggestion[] {
  if (gap.protein < GAP_EPSILON_G || gap.kcal <= 0) return [];
  const out: BoosterSuggestion[] = [];
  for (const meal of meals) {
    const n = meal.nutritionPerServing;
    // QuickMeals count too: products moved there from the recipes keep category + tags, while
    // AI-estimated canteen meals have neither and are filtered out by the check below.
    if (!n || !(n.kcal > 0) || !(n.protein > 0)) continue;
    if (!meal.category || !BOOSTER_CATEGORIES.has(meal.category) || !meal.tags?.includes(HIGH_PROTEIN_TAG)) continue;

    const fillProtein = gap.protein / n.protein;
    const fitBudget = gap.kcal / n.kcal;
    const multiplier = Math.floor(Math.min(Math.max(fillProtein, MIN_MULT), fitBudget, MAX_MULT) * 20) / 20;
    if (multiplier < MIN_MULT) continue;

    out.push({
      meal,
      multiplier,
      protein: Math.round(n.protein * multiplier),
      kcal: Math.round(n.kcal * multiplier),
    });
  }
  const closes = (s: BoosterSuggestion) => s.protein >= gap.protein * 0.9;
  return out
    .sort((a, b) => Number(closes(b)) - Number(closes(a))
      || (closes(a) ? a.kcal - b.kcal : b.protein - a.protein || a.kcal - b.kcal))
    .slice(0, limit);
}
