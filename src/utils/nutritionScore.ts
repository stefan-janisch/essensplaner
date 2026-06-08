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
 *   micro     35   avg daily-reference coverage across the 13 vitamins/minerals (capped 50%/each, full at 30%)
 *   protein   25   protein per serving toward ~35 g
 *   fibre     18   fibre per serving toward ~15 g
 *   lowSugar  12   less added sugar is better (0 g → full, 30 g → none)
 *   energy    10   moderate energy (≤500 kcal full, 1000 kcal none)
 *
 * Thresholds are deliberately demanding so the score spreads across the range and stays useful
 * for sorting rather than clustering near 100.
 *
 * If a recipe has no micronutrient data yet, the micro weight is dropped and the remaining
 * weights are renormalised to 100 so macro-only recipes are still scored fairly.
 */

type FullNutrition = NutritionInfo & Partial<MicroNutrients>;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// Gender-neutral daily reference per micro (average the f/m values where they differ).
const NEUTRAL_MICRO_REF: Record<string, number> = Object.fromEntries(
  MICRO_REFERENCES.map(m => [m.key, typeof m.reference === 'number' ? m.reference : (m.reference.f + m.reference.m) / 2]),
);

export function computeNutritionScore(nutrition: FullNutrition | null | undefined): number | null {
  if (!nutrition) return null;
  const kcal = nutrition.kcal || 0;
  if (kcal <= 0) return null;

  const pProtein = clamp01((nutrition.protein || 0) / 35);
  const pFibre = clamp01((nutrition.fiber || 0) / 15);
  const pLowSugar = clamp01(1 - (nutrition.sugar || 0) / 30);
  const pEnergy = clamp01(1 - Math.max(0, kcal - 500) / 500);

  // Micronutrient density: mean over the 13 micros of min(serving/ref, 0.5); full at avg 20%.
  let microSum = 0;
  let microPresent = 0;
  for (const m of MICRO_REFERENCES) {
    const val = nutrition[m.key];
    if (val === undefined || val === null) continue;
    microPresent++;
    microSum += Math.min(val / NEUTRAL_MICRO_REF[m.key], 0.5);
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
