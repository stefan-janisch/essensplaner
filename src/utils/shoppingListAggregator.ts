import type { Meal, MealPlanEntry, ExtraItem } from '../types/index.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface IngredientSource {
  mealName: string;
  mealId: string;
  amount: number;
  unit: string;
}

export interface AggregatedIngredient {
  name: string;
  amounts: { amount: number; unit: string }[];
  sources: IngredientSource[];
}

const normalizeIngredientName = (name: string): string => {
  return name.toLowerCase().trim();
};

export const generateShoppingList = (
  entries: MealPlanEntry[],
  meals: Meal[],
  extras?: ExtraItem[]
): AggregatedIngredient[] => {
  const ingredientMap = new Map<string, Map<string, number>>();
  const sourcesMap = new Map<string, IngredientSource[]>();

  // Process all enabled entries
  entries.forEach(entry => {
    if (!entry.enabled || !entry.mealId) return;

    const meal = meals.find(m => m.id === entry.mealId);
    if (!meal) return;

    const scaleFactor = entry.servings / meal.defaultServings;

    // Use shoppingIngredients when available, fall back to ingredients for legacy meals
    const ingredientsForShopping = meal.shoppingIngredients?.length
      ? meal.shoppingIngredients
      : meal.ingredients;

    ingredientsForShopping.forEach(ingredient => {
      const normalizedName = normalizeIngredientName(ingredient.name);
      const scaledAmount = ingredient.amount * scaleFactor;

      if (!ingredientMap.has(normalizedName)) {
        ingredientMap.set(normalizedName, new Map());
      }

      const unitMap = ingredientMap.get(normalizedName)!;
      const currentAmount = unitMap.get(ingredient.unit) || 0;
      unitMap.set(ingredient.unit, currentAmount + scaledAmount);

      // Track sources
      if (!sourcesMap.has(normalizedName)) {
        sourcesMap.set(normalizedName, []);
      }
      sourcesMap.get(normalizedName)!.push({
        mealName: meal.name,
        mealId: meal.id,
        amount: scaledAmount,
        unit: ingredient.unit,
      });
    });
  });

  // Process extra items
  if (extras) {
    extras.forEach(extra => {
      if (!extra.enabled) return;

      const normalizedName = normalizeIngredientName(extra.name);

      if (!ingredientMap.has(normalizedName)) {
        ingredientMap.set(normalizedName, new Map());
      }

      const unitMap = ingredientMap.get(normalizedName)!;
      const currentAmount = unitMap.get(extra.unit) || 0;
      unitMap.set(extra.unit, currentAmount + extra.amount);

      if (!sourcesMap.has(normalizedName)) {
        sourcesMap.set(normalizedName, []);
      }
      sourcesMap.get(normalizedName)!.push({
        mealName: extra.name,
        mealId: `extra:${extra.id}`,
        amount: extra.amount,
        unit: extra.unit,
      });
    });
  }

  // Convert to array and preserve original capitalization from first occurrence
  const result: AggregatedIngredient[] = [];
  const originalNames = new Map<string, string>();

  entries.forEach(entry => {
    if (!entry.enabled || !entry.mealId) return;
    const meal = meals.find(m => m.id === entry.mealId);
    if (!meal) return;

    const ingredientsForShopping = meal.shoppingIngredients?.length
      ? meal.shoppingIngredients
      : meal.ingredients;

    ingredientsForShopping.forEach(ing => {
      const normalized = normalizeIngredientName(ing.name);
      if (!originalNames.has(normalized)) {
        originalNames.set(normalized, ing.name);
      }
    });
  });

  if (extras) {
    extras.forEach(extra => {
      if (!extra.enabled) return;
      const normalized = normalizeIngredientName(extra.name);
      if (!originalNames.has(normalized)) {
        originalNames.set(normalized, extra.name);
      }
    });
  }

  ingredientMap.forEach((unitMap, normalizedName) => {
    const amounts: { amount: number; unit: string }[] = [];
    unitMap.forEach((amount, unit) => {
      amounts.push({ amount: Math.round(amount * 100) / 100, unit });
    });

    result.push({
      name: originalNames.get(normalizedName) || normalizedName,
      amounts,
      sources: sourcesMap.get(normalizedName) || [],
    });
  });

  // Sort alphabetically
  result.sort((a, b) => a.name.localeCompare(b.name));

  return result;
};

/**
 * Merges ingredients with multiple units into a single preferred unit
 * by calling the convert-units API (which caches results in the DB).
 */
export const mergeUnitsInShoppingList = async (
  list: AggregatedIngredient[]
): Promise<AggregatedIngredient[]> => {
  // Find items that need unit merging (have more than 1 unit)
  const needsMerging = list.filter(item =>
    item.amounts.length > 1 && !item.amounts.some(a => a.unit === 'NB' || a.unit === 'Nach Belieben')
  );

  if (needsMerging.length === 0) return list;

  // Build batch of conversions needed
  const conversions: { ingredient: string; fromUnit: string; toUnit: string }[] = [];

  for (const item of needsMerging) {
    // Use the first unit as the preferred target unit
    const preferredUnit = item.amounts[0].unit;
    for (let i = 1; i < item.amounts.length; i++) {
      if (item.amounts[i].unit !== preferredUnit) {
        conversions.push({
          ingredient: item.name,
          fromUnit: item.amounts[i].unit,
          toUnit: preferredUnit,
        });
      }
    }
  }

  if (conversions.length === 0) return list;

  // Call the batch conversion API
  let conversionResults: { ingredient: string; fromUnit: string; toUnit: string; factor: number }[] = [];
  try {
    const response = await fetch(`${API_URL}/api/convert-units`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversions }),
    });
    if (response.ok) {
      const data = await response.json();
      conversionResults = data.results || [];
    }
  } catch {
    // If conversion fails, return the unmerged list
    return list;
  }

  // Build a lookup map for conversion factors
  const factorMap = new Map<string, number>();
  for (const r of conversionResults) {
    if (r.factor > 0) {
      factorMap.set(`${r.ingredient.toLowerCase()}|${r.fromUnit}|${r.toUnit}`, r.factor);
    }
  }

  // Apply conversions
  return list.map(item => {
    if (item.amounts.length <= 1) return item;
    if (item.amounts.some(a => a.unit === 'NB' || a.unit === 'Nach Belieben')) return item;

    const preferredUnit = item.amounts[0].unit;
    let mergedAmount = item.amounts[0].amount;
    const unmerged: { amount: number; unit: string }[] = [];

    for (let i = 1; i < item.amounts.length; i++) {
      const a = item.amounts[i];
      const key = `${item.name.toLowerCase()}|${a.unit}|${preferredUnit}`;
      const factor = factorMap.get(key);

      if (factor && factor > 0) {
        mergedAmount += a.amount * factor;
      } else {
        // Could not convert — keep as separate entry
        unmerged.push(a);
      }
    }

    return {
      ...item,
      amounts: [
        { amount: Math.round(mergedAmount * 100) / 100, unit: preferredUnit },
        ...unmerged,
      ],
    };
  });
};
