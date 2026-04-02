import type { MealPlanEntry, Meal, NutritionInfo, NutritionTargets } from '../types/index.js';

const NUTRITION_KEYS: (keyof NutritionInfo)[] = ['kcal', 'protein', 'carbs', 'fat', 'fiber'];
const MORE_IS_BETTER = new Set<keyof NutritionInfo>(['protein', 'fiber']);

export type NutrientStatus = {
  key: keyof NutritionInfo;
  label: string;
  actual: number;
  target: number;
  percent: number;
  color: 'green' | 'yellow' | 'red';
};

export type DayNutritionResult = {
  totals: NutritionInfo;
  details: NutrientStatus[];
  overallColor: 'green' | 'yellow' | 'red' | 'gray';
  filledMeals: number;
  totalSlots: number; // breakfast + lunch + dinner
};

const LABELS: Record<keyof NutritionInfo, string> = {
  kcal: 'Kalorien',
  protein: 'Protein',
  carbs: 'Kohlenh.',
  fat: 'Fett',
  fiber: 'Ballast.',
};

function getNutrientColor(percent: number, key: keyof NutritionInfo): 'green' | 'yellow' | 'red' {
  if (MORE_IS_BETTER.has(key)) {
    if (percent < 50) return 'red';
    if (percent < 80) return 'yellow';
    return 'green'; // >=80% is good, more is fine
  }
  if (percent < 50 || percent > 150) return 'red';
  if (percent < 80 || percent > 120) return 'yellow';
  return 'green';
}

const COLOR_PRIORITY: Record<string, number> = { red: 0, yellow: 1, green: 2 };

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

  // Sum nutrition per person:
  // entry.servings × nutritionPerServing = total for this entry
  // divided by planDefaultServings = per person
  const perPerson = Math.max(1, planDefaultServings);
  const totals: NutritionInfo = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
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
    return {
      totals,
      details: [],
      overallColor: 'gray',
      filledMeals,
      totalSlots: 3,
    };
  }

  const details: NutrientStatus[] = NUTRITION_KEYS.map(key => {
    const target = targets[key] || 1;
    const actual = totals[key];
    const percent = Math.round((actual / target) * 100);
    return {
      key,
      label: LABELS[key],
      actual,
      target,
      percent,
      color: getNutrientColor(percent, key),
    };
  });

  const overallColor = details.reduce<'green' | 'yellow' | 'red'>((worst, d) => {
    return COLOR_PRIORITY[d.color] < COLOR_PRIORITY[worst] ? d.color : worst;
  }, 'green');

  return { totals, details, overallColor, filledMeals, totalSlots: 3 };
}
