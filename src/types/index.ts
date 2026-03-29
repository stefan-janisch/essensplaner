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
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'drinks' | 'misc';

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
  category: 'snacks' | 'drinks' | 'misc';
  name: string;
  amount: number;
  unit: string;
  enabled: boolean;
}

export type MealPlan = {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  archived?: boolean;
  entries: MealPlanEntry[];
  extras: ExtraItem[];
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
}
