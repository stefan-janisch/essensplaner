import type { NutritionInfo, MicroNutrients } from '../types/index.js';
import { MICRO_REFERENCES } from './microReference';
import type { NutrientColor } from './nutritionColors';

/**
 * Nutritional score (0-100) for a recipe, derived from its per-serving nutrition.
 *
 * It is a transparent weighted sum of five 0..1 components — rewarding micronutrient density,
 * protein, fibre and low added sugar, and gently favouring moderate energy. The score is an
 * intrinsic property of the recipe (gender-neutral reference values) so it stays comparable
 * across users and is stable for sorting.
 *
 * The nutrient components are density-based: values are normalised to a reference portion of
 * REF_KCAL (500 kcal) before comparing against the thresholds, so the score no longer depends on
 * how big a "serving" happens to be. Only the energy component uses the actual serving size.
 *
 *   micro     35   avg daily-reference coverage across the 13 vitamins/minerals per 500 kcal (capped 50%/each, full at 30%)
 *   protein   25   protein per 500 kcal toward ~35 g (= 7 g / 100 kcal)
 *   fibre     18   fibre per 500 kcal toward ~15 g (= 3 g / 100 kcal)
 *   lowSugar  12   less added sugar per 500 kcal is better (0 g → full, 30 g → none)
 *   energy    10   moderate energy per serving (≤500 kcal full, 1000 kcal none)
 *
 * Thresholds are deliberately demanding so the score spreads across the range and stays useful
 * for sorting rather than clustering near 100.
 *
 * If a recipe has no micronutrient data yet, the micro weight is dropped and the remaining
 * weights are renormalised to 100 so macro-only recipes are still scored fairly.
 */

type FullNutrition = NutritionInfo & Partial<MicroNutrients>;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Reference portion the nutrient densities are normalised to. */
const REF_KCAL = 500;

// Gender-neutral daily reference per micro (average the f/m values where they differ).
const NEUTRAL_MICRO_REF: Record<string, number> = Object.fromEntries(
  MICRO_REFERENCES.map(m => [m.key, typeof m.reference === 'number' ? m.reference : (m.reference.f + m.reference.m) / 2]),
);

export function computeNutritionScore(nutrition: FullNutrition | null | undefined): number | null {
  if (!nutrition) return null;
  const kcal = nutrition.kcal || 0;
  if (kcal <= 0) return null;

  // Scale factor from the actual serving to the REF_KCAL reference portion.
  const f = REF_KCAL / kcal;

  const pProtein = clamp01((nutrition.protein || 0) * f / 35);
  const pFibre = clamp01((nutrition.fiber || 0) * f / 15);
  const pLowSugar = clamp01(1 - (nutrition.sugar || 0) * f / 30);
  const pEnergy = clamp01(1 - Math.max(0, kcal - 500) / 500);

  // Micronutrient density: mean over the 13 micros of min(per-500-kcal/ref, 0.5); full at avg 30%.
  let microSum = 0;
  let microPresent = 0;
  for (const m of MICRO_REFERENCES) {
    const val = nutrition[m.key];
    if (val === undefined || val === null) continue;
    microPresent++;
    microSum += Math.min(val * f / NEUTRAL_MICRO_REF[m.key], 0.5);
  }
  const hasMicro = microPresent > 0;
  const avgCoverage = microSum / MICRO_REFERENCES.length;
  const pMicro = clamp01(avgCoverage / 0.30);

  let wMicro = 35, wProtein = 25, wFibre = 18, wSugar = 12, wEnergy = 10;
  if (!hasMicro) {
    // Drop micro weight, renormalise the rest to sum 100.
    const rest = wProtein + wFibre + wSugar + wEnergy;
    const k = 100 / rest;
    wMicro = 0; wProtein *= k; wFibre *= k; wSugar *= k; wEnergy *= k;
  }

  const score = wMicro * pMicro + wProtein * pProtein + wFibre * pFibre + wSugar * pLowSugar + wEnergy * pEnergy;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Traffic-light colour for a score (green ≥ 70, yellow ≥ 40, else red). */
export function getScoreColor(score: number): NutrientColor {
  if (score >= 70) return 'green';
  if (score >= 40) return 'yellow';
  return 'red';
}

/** Protein density in g per 100 kcal, or null without energy data. */
export function computeProteinDensity(nutrition: NutritionInfo | null | undefined): number | null {
  if (!nutrition || !(nutrition.kcal > 0)) return null;
  return ((nutrition.protein || 0) / nutrition.kcal) * 100;
}

/** "7,5" — German one-decimal format for the protein density badge. */
export function formatProteinDensity(density: number): string {
  return density.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
