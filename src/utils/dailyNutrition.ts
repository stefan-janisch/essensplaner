import type { MealPlanEntry, Meal, NutritionInfo, NutritionTargets } from '../types/index.js';
import { NUTRITION_KEYS } from './nutritionColors';
import { sumDay, mealsMap } from './dayScore';

/** Calculate remaining nutrition needed for a day (gap = target - current, floored at 0) */
export function calculateNutritionGap(
  date: string,
  entries: MealPlanEntry[],
  meals: Meal[],
  targets: NutritionTargets,
  planDefaultServings: number,
): NutritionInfo {
  const dayEntries = entries.filter(e => e.date === date && e.mealType !== 'food');
  const { totals } = sumDay(dayEntries, mealsMap(meals), planDefaultServings);
  const gap: NutritionInfo = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };
  for (const key of NUTRITION_KEYS) {
    gap[key] = Math.max(0, Math.round(targets[key] - totals[key]));
  }
  return gap;
}
