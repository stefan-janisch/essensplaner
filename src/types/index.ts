export type NutritionInfo = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export type NutritionTargets = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export const DEFAULT_NUTRITION_TARGETS: NutritionTargets = {
  kcal: 2000,
  protein: 50,
  carbs: 260,
  fat: 65,
  fiber: 30,
};

export type Ingredient = {
  name: string;
  amount: number;
  unit: string;
}

export type Meal = {
  id: string;
  name: string;
  ingredients: Ingredient[];
  shoppingIngredients?: Ingredient[];
  defaultServings: number;
  starred: boolean;
  rating?: number;
  category?: string;
  tags?: string[];
  photoUrl?: string;
  recipeUrl?: string;
  comment?: string;
  recipeText?: string;
  prepTime?: number;
  totalTime?: number;
  nutritionPerServing?: NutritionInfo;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'drinks' | 'misc' | 'food';

export type PlanType = 'weekly' | 'menu';

export type MenuCourse = {
  id: number;
  sortOrder: number;
  label: string;
  comment: string;
}

export type MealPlanEntry = {
  id: number;
  date: string; // ISO format YYYY-MM-DD
  mealType: MealType;
  mealId: string;
  servings: number;
  enabled: boolean;
}

export type Collaborator = {
  id: number;
  email: string;
}

export type ExtraItem = {
  id: number;
  category: 'snacks' | 'drinks' | 'misc' | 'food';
  name: string;
  amount: number;
  unit: string;
  enabled: boolean;
  courseId?: number;
}

export type MealPlan = {
  id: number;
  name: string;
  planType?: PlanType;
  startDate: string | null;
  endDate: string | null;
  archived?: boolean;
  entries: MealPlanEntry[];
  extras: ExtraItem[];
  courses?: MenuCourse[];
  createdAt?: string;
  isOwner?: boolean;
  ownerEmail?: string | null;
  collaborators?: Collaborator[];
  sharedMeals?: Meal[];
  entryCount?: number;
}

export type MealPlanState = {
  plans: MealPlan[];
  activePlanId: number | null;
  meals: Meal[];
}

export type User = {
  id: number;
  email: string;
  defaultServings: number;
  isAdmin?: boolean;
  nutritionTargets?: NutritionTargets;
  mealsPerDay?: number;
}
