import { useMealPlan } from '../context/MealPlanContext';
import { getMealNutritionColors, COLOR_HEX, getPerMealTargets, calculateOptimalMultiplier } from '../utils/nutritionColors';
import { DEFAULT_NUTRITION_TARGETS } from '../types/index.js';
import type { Meal } from '../types/index.js';

export function useRecipeNutritionColors(meal: Meal) {
  const { nutritionTargets, mealsPerDay } = useMealPlan();
  const targets = nutritionTargets ?? DEFAULT_NUTRITION_TARGETS;
  const perMeal = getPerMealTargets(targets, mealsPerDay);
  if (!meal.nutritionPerServing) return null;
  // Evaluate at optimal portion size, not 1×
  const M = calculateOptimalMultiplier(meal.nutritionPerServing, perMeal);
  return getMealNutritionColors(meal, perMeal, M);
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
