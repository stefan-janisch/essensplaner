import type { Meal, MealPlanEntry } from '../types/index.js';

interface AggregatedIngredient {
  name: string;
  amounts: { amount: number; unit: string }[];
}

const normalizeIngredientName = (name: string): string => {
  return name.toLowerCase().trim();
};

export const generateShoppingList = (
  entries: MealPlanEntry[],
  meals: Meal[]
): AggregatedIngredient[] => {
  const ingredientMap = new Map<string, Map<string, number>>();

  // Process all enabled entries
  entries.forEach(entry => {
    if (!entry.enabled || !entry.mealId) return;

    const meal = meals.find(m => m.id === entry.mealId);
    if (!meal) return;

    const scaleFactor = entry.servings / meal.defaultServings;

    meal.ingredients.forEach(ingredient => {
      const normalizedName = normalizeIngredientName(ingredient.name);
      const scaledAmount = ingredient.amount * scaleFactor;

      if (!ingredientMap.has(normalizedName)) {
        ingredientMap.set(normalizedName, new Map());
      }

      const unitMap = ingredientMap.get(normalizedName)!;
      const currentAmount = unitMap.get(ingredient.unit) || 0;
      unitMap.set(ingredient.unit, currentAmount + scaledAmount);
    });
  });

  // Convert to array and preserve original capitalization from first occurrence
  const result: AggregatedIngredient[] = [];
  const originalNames = new Map<string, string>();

  entries.forEach(entry => {
    if (!entry.enabled || !entry.mealId) return;
    const meal = meals.find(m => m.id === entry.mealId);
    if (!meal) return;

    meal.ingredients.forEach(ing => {
      const normalized = normalizeIngredientName(ing.name);
      if (!originalNames.has(normalized)) {
        originalNames.set(normalized, ing.name);
      }
    });
  });

  ingredientMap.forEach((unitMap, normalizedName) => {
    const amounts: { amount: number; unit: string }[] = [];
    unitMap.forEach((amount, unit) => {
      amounts.push({ amount: Math.round(amount * 100) / 100, unit });
    });

    result.push({
      name: originalNames.get(normalizedName) || normalizedName,
      amounts,
    });
  });

  // Sort alphabetically
  result.sort((a, b) => a.name.localeCompare(b.name));

  return result;
};
