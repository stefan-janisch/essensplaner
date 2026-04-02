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

export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderate' | 'very_active';
export type TrainingIntensity = 'light' | 'moderate' | 'intense';
export type FitnessGoal = 'bulk' | 'maintain' | 'cut';
export type DayType = 'strength' | 'cardio' | 'rest';

export type WeekDayTypes = {
  mon: DayType; tue: DayType; wed: DayType; thu: DayType;
  fri: DayType; sat: DayType; sun: DayType;
};

export type MicroKey = 'magnesiumMg' | 'zincMg' | 'ironMg' | 'vitaminDIu' | 'omega3G' | 'calciumMg';

export type NutritionProfile = {
  age: number;
  gender: 'm' | 'f';
  heightCm: number;
  weightKg: number;
  bodyFatPercent?: number;
  activityLevel: ActivityLevel;
  strengthIntensity: TrainingIntensity;
  cardioIntensity: TrainingIntensity;
  goal: FitnessGoal;
  aggressiveness: number; // 0-100
  weekDayTypes: WeekDayTypes;
  supplementedMicros?: MicroKey[]; // micros covered by supplements
};

export const DEFAULT_NUTRITION_PROFILE: NutritionProfile = {
  age: 30,
  gender: 'm',
  heightCm: 178,
  weightKg: 80,
  activityLevel: 'lightly_active',
  strengthIntensity: 'moderate',
  cardioIntensity: 'moderate',
  goal: 'maintain',
  aggressiveness: 50,
  weekDayTypes: { mon: 'strength', tue: 'rest', wed: 'strength', thu: 'cardio', fri: 'strength', sat: 'rest', sun: 'rest' },
};

export type WeightEntry = {
  id: number;
  date: string;
  weight: number;
  bodyFat?: number;
};

export type MicroTargets = {
  magnesiumMg: number;
  zincMg: number;
  ironMg: number;
  vitaminDIu: number;
  omega3G: number;
  calciumMg: number;
};

export type CalculatedNutrition = {
  bmr: number;
  tdee: number;
  targetKcal: number;
  proteinG: number;
  proteinKcal: number;
  fatG: number;
  fatKcal: number;
  carbsG: number;
  carbsKcal: number;
  fiberG: number;
  waterL: number;
  micros: MicroTargets;
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
  defaultServings?: number;
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
