import { useMealPlan } from '../context/MealPlanContext';
import { getMealNutritionColors, COLOR_HEX } from '../utils/nutritionColors';
import { DEFAULT_NUTRITION_TARGETS } from '../types/index.js';
import type { Meal, NutritionInfo } from '../types/index.js';

export function useRecipeNutritionColors(meal: Meal) {
  const { nutritionTargets, mealsPerDay } = useMealPlan();
  const targets = nutritionTargets ?? DEFAULT_NUTRITION_TARGETS;
  const mpd = mealsPerDay || 3;
  const perMealTargets: NutritionInfo = {
    kcal: Math.round(targets.kcal / mpd),
    protein: Math.round(targets.protein / mpd),
    carbs: Math.round(targets.carbs / mpd),
    fat: Math.round(targets.fat / mpd),
    fiber: Math.round(targets.fiber / mpd),
    sugar: Math.round((targets.sugar ?? 25) / mpd),
  };
  return getMealNutritionColors(meal, perMealTargets);
}

export function RecipeNutritionDots({ meal }: { meal: Meal }) {
  const colors = useRecipeNutritionColors(meal);
  if (!colors) return null;

  return (
    <div className="recipe-nutrition-dots">
      {colors.dots.map(d => (
        <span key={d.key} className="recipe-nutrition-dot" style={{ background: COLOR_HEX[d.color] }} title={d.key} />
      ))}
    </div>
  );
}
