import { useMealPlan } from '../context/MealPlanContext';
import { getMealNutritionColors, COLOR_HEX, getPerMealTargets, calculateOptimalMultiplier } from '../utils/nutritionColors';
import { computeNutritionScore, getScoreColor } from '../utils/nutritionScore';
import { DEFAULT_NUTRITION_TARGETS } from '../types/index.js';
import type { Meal } from '../types/index.js';

export function useRecipeNutritionColors(meal: Meal) {
  const { nutritionTargets, mealsPerDay } = useMealPlan();
  const targets = nutritionTargets ?? DEFAULT_NUTRITION_TARGETS;
  const perMeal = getPerMealTargets(targets, mealsPerDay);
  if (!meal.nutritionPerServing) return null;
  // The 6 per-macro dots stay a balance signal — evaluated at the optimal portion size, not 1×.
  const M = calculateOptimalMultiplier(meal.nutritionPerServing, perMeal);
  const colors = getMealNutritionColors(meal, perMeal, M);
  if (!colors) return null;
  // The overall colour (used for the card border) now reflects the 0-100 nutritional score,
  // so it agrees with the score badge instead of being the worst-of-6 macro balance.
  const score = computeNutritionScore(meal.nutritionPerServing);
  return score !== null ? { ...colors, overall: getScoreColor(score) } : colors;
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
