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

export function getPerMealTargets(targets: NutritionTargets, mealsPerDay: number): NutritionInfo {
  const mpd = mealsPerDay || 3;
  return {
    kcal: Math.round(targets.kcal / mpd),
    protein: Math.round(targets.protein / mpd),
    carbs: Math.round(targets.carbs / mpd),
    fat: Math.round(targets.fat / mpd),
    fiber: Math.round(targets.fiber / mpd),
    sugar: Math.round((targets.sugar ?? 25) / mpd),
  };
}

export function calculateOptimalMultiplier(nutrition: NutritionInfo, perMealTargets: NutritionInfo): number {
  const ratios = NUTRITION_KEYS.map(key => {
    const t = perMealTargets[key];
    if (t <= 0) return 0;
    const r = nutrition[key] / t;
    if (MORE_IS_BETTER.has(key)) return Math.min(r, 1);
    if (LESS_IS_BETTER.has(key)) return Math.max(r, 1);
    return r;
  }).filter(r => r > 0);
  if (ratios.length === 0) return 1;
  const sumR = ratios.reduce((a, r) => a + r, 0);
  const sumR2 = ratios.reduce((a, r) => a + r * r, 0);
  return sumR2 > 0 ? sumR / sumR2 : 1;
}

export function getMealNutritionColors(meal: Meal, perMealTargets: NutritionInfo, scale?: number): MealNutritionColors | null {
  if (!meal.nutritionPerServing) return null;
  const n = scale && scale !== 1 ? Object.fromEntries(
    NUTRITION_KEYS.map(k => [k, Math.round(meal.nutritionPerServing![k] * scale)])
  ) as NutritionInfo : meal.nutritionPerServing;
  const statuses = getNutrientStatuses(n, perMealTargets);
  return {
    overall: getOverallColor(statuses),
    dots: statuses.map(s => ({ key: s.key, color: s.color })),
  };
}
