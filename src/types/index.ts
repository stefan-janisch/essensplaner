export type Ingredient = {
  name: string;
  amount: number;
  unit: string;
}

export type Meal = {
  id: string;
  name: string;
  ingredients: Ingredient[];
  defaultServings: number;
  starred: boolean;
  recipeUrl?: string;
  comment?: string;
  recipeText?: string;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner';

export type MealPlanEntry = {
  date: string; // ISO format YYYY-MM-DD
  mealType: MealType;
  mealId: string | null;
  servings: number;
  enabled: boolean;
}

export type MealPlanState = {
  startDate: string | null;
  endDate: string | null;
  entries: MealPlanEntry[];
  meals: Meal[];
}
