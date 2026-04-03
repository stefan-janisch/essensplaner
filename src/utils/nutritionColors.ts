import type { NutritionInfo, NutritionTargets, Meal } from '../types/index.js';

export type NutrientColor = 'green' | 'yellow' | 'red';

export const COLOR_HEX: Record<NutrientColor | 'gray', string> = {
  green: '#51cf66',
  yellow: '#ffa94d',
  red: '#ff6b6b',
  gray: '#ced4da',
};

export const NUTRITION_KEYS: (keyof NutritionInfo)[] = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar'];

export const NUTRITION_LABELS: Record<keyof NutritionInfo, string> = {
  kcal: 'Kalorien',
  protein: 'Protein',
  carbs: 'Kohlenh.',
  fat: 'Fett',
  fiber: 'Ballast.',
  sugar: 'Zug. Zucker',
};

export const MORE_IS_BETTER = new Set<keyof NutritionInfo>(['protein', 'fiber']);
export const LESS_IS_BETTER = new Set<keyof NutritionInfo>(['sugar']);

export function getNutrientColor(percent: number, key: keyof NutritionInfo): NutrientColor {
  if (MORE_IS_BETTER.has(key)) {
    if (percent < 50) return 'red';
    if (percent < 80) return 'yellow';
    return 'green';
  }
  if (LESS_IS_BETTER.has(key)) {
    if (percent <= 80) return 'green';
    if (percent <= 100) return 'yellow';
    return 'red';
  }
  if (percent < 50 || percent > 150) return 'red';
  if (percent < 80 || percent > 120) return 'yellow';
  return 'green';
}

export type NutrientStatus = {
  key: keyof NutritionInfo;
  label: string;
  actual: number;
  target: number;
  percent: number;
  color: NutrientColor;
};

export function getNutrientStatuses(actual: NutritionInfo, targets: NutritionTargets): NutrientStatus[] {
  return NUTRITION_KEYS.map(key => {
    const target = targets[key] || 1;
    const percent = Math.round((actual[key] / target) * 100);
    return {
      key,
      label: NUTRITION_LABELS[key],
      actual: actual[key],
      target,
      percent,
      color: getNutrientColor(percent, key),
    };
  });
}

const COLOR_PRIORITY: Record<NutrientColor, number> = { red: 0, yellow: 1, green: 2 };

export function getOverallColor(statuses: NutrientStatus[]): NutrientColor {
  return statuses.reduce<NutrientColor>((worst, s) => {
    return COLOR_PRIORITY[s.color] < COLOR_PRIORITY[worst] ? s.color : worst;
  }, 'green');
}

export type MealNutritionColors = {
  overall: NutrientColor;
  dots: { key: keyof NutritionInfo; color: NutrientColor }[];
};

export function getMealNutritionColors(meal: Meal, perMealTargets: NutritionInfo): MealNutritionColors | null {
  if (!meal.nutritionPerServing) return null;
  const statuses = getNutrientStatuses(meal.nutritionPerServing, perMealTargets);
  return {
    overall: getOverallColor(statuses),
    dots: statuses.map(s => ({ key: s.key, color: s.color })),
  };
}
