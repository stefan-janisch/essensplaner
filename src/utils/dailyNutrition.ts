import type { MealPlanEntry, Meal, NutritionInfo, NutritionTargets } from '../types/index.js';
import { NUTRITION_KEYS, getNutrientStatuses, getOverallColor, LESS_IS_BETTER } from './nutritionColors';
import type { NutrientStatus, NutrientColor } from './nutritionColors';

export type { NutrientStatus };

export type DayNutritionResult = {
  totals: NutritionInfo;
  details: NutrientStatus[];
  overallColor: NutrientColor | 'gray';
  filledMeals: number;
  totalSlots: number;
};

export function calculateDailyNutrition(
  date: string,
  entries: MealPlanEntry[],
  meals: Meal[],
  targets: NutritionTargets,
  planDefaultServings: number,
): DayNutritionResult {
  const dayEntries = entries.filter(e => e.date === date && e.enabled);
  const mainMealTypes = new Set(['breakfast', 'lunch', 'dinner']);
  const mainEntries = entries.filter(e => e.date === date && mainMealTypes.has(e.mealType));
  const filledMeals = new Set(mainEntries.map(e => e.mealType)).size;

  const perPerson = Math.max(1, planDefaultServings);
  const totals: NutritionInfo = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };
  let hasAnyNutrition = false;

  for (const entry of dayEntries) {
    const meal = meals.find(m => m.id === entry.mealId);
    if (!meal?.nutritionPerServing) continue;
    hasAnyNutrition = true;
    for (const key of NUTRITION_KEYS) {
      totals[key] += Math.round((meal.nutritionPerServing[key] * entry.servings) / perPerson);
    }
  }

  if (!hasAnyNutrition) {
    return { totals, details: [], overallColor: 'gray', filledMeals, totalSlots: 3 };
  }

  const details = getNutrientStatuses(totals, targets);
  const overallColor = getOverallColor(details);

  return { totals, details, overallColor, filledMeals, totalSlots: 3 };
}

/** Calculate remaining nutrition needed for a day (gap = target - current, floored at 0) */
export function calculateNutritionGap(
  date: string,
  entries: MealPlanEntry[],
  meals: Meal[],
  targets: NutritionTargets,
  planDefaultServings: number,
): NutritionInfo {
  const result = calculateDailyNutrition(date, entries, meals, targets, planDefaultServings);
  const gap: NutritionInfo = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };
  for (const key of NUTRITION_KEYS) {
    if (LESS_IS_BETTER.has(key)) {
      // For sugar: gap = how much room is left (target - actual), floored at 0
      gap[key] = Math.max(0, targets[key] - result.totals[key]);
    } else {
      gap[key] = Math.max(0, targets[key] - result.totals[key]);
    }
  }
  return gap;
}
