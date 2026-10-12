export type NutritionInfo = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
}

// Background-only micronutrients (vitamins + trace elements). Kept SEPARATE from
// NutritionInfo on purpose: the UI iterates over `keyof NutritionInfo` (DISPLAY_KEYS,
// NUTRITION_KEYS, NUTRITION_LABELS), so keeping these out of that type ensures they
// are logged but never rendered. All optional — meals estimated before this feature,
// or fields the AI couldn't estimate, simply lack them. Units encoded in the key
// suffix (_ug = µg, _mg = mg, _g = g); vitaminD_ug is µg (not IU).
export type MicroNutrients = {
  vitaminA_ug: number;
  vitaminC_mg: number;
  vitaminD_ug: number;
  vitaminE_mg: number;
  vitaminB12_ug: number;
  folate_ug: number;
  calcium_mg: number;
  magnesium_mg: number;
  iron_mg: number;
  zinc_mg: number;
  selenium_ug: number;
  potassium_mg: number;
  omega3_g: number;
}

export type NutritionTargets = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
}

export const DEFAULT_NUTRITION_TARGETS: NutritionTargets = {
  kcal: 2000,
  protein: 50,
  carbs: 260,
  fat: 65,
  fiber: 30,
  sugar: 25,
};

export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderate' | 'very_active';
export type TrainingIntensity = 'light' | 'moderate' | 'intense';
export type FitnessGoal = 'bulk' | 'maintain' | 'cut';
export type DayType = 'strength' | 'cardio' | 'rest';

export type WeekDayTypes = {
  mon: DayType; tue: DayType; wed: DayType; thu: DayType;
  fri: DayType; sat: DayType; sun: DayType;
};

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
  /** Micros covered by supplements (keys of MicroNutrients); older profiles may still hold
   *  calculator keys like 'vitaminDIu' — read via normalizeSupplementedMicros(). */
  supplementedMicros?: string[];
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

/** Flexible sport mode: a training logged for one day in the plan. */
export type TrainingType = 'cardio' | 'strength' | 'sport' | 'mobility';
export type Training = {
  id: number;
  date: string;
  type: TrainingType;
  intensity: TrainingIntensity;
  minutes: number;
};

/** One day of Apple Health "Active Energy" (kcal), pushed by the iOS Shortcut. */
export type ActivityDay = {
  date: string;
  activeKcal: number;
};

export type WeightEntry = {
  id: number;
  date: string;
  weight: number;
  bodyFat?: number;
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
};

export type Ingredient = {
  name: string;
  amount: number;
  amountMax?: number;
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
  nutritionPerServing?: NutritionInfo & Partial<MicroNutrients>;
  /**
   * AI-estimated weight of ONE ready-to-eat serving in grams — ingredients plus the water
   * a dish soaks up or boils off (server/portionWeight.js). Makes fractional portion counts
   * ("1,3 Portionen") judgeable. Undefined until estimated.
   */
  portionWeight?: number;
  /** Meal eaten without recipe (canteen etc.): nutrition only, hidden from recipe lists. */
  isQuick?: boolean;
  /** ☕ Drink template (a QuickMeal) for the per-day coffee counter — not in the QuickMeal picker. */
  isDrink?: boolean;
}

/** Payload for creating/updating a quick meal. */
export type QuickMealData = {
  name: string;
  description?: string;
  breakdown?: string;
  nutritionPerServing: NutritionInfo & Partial<MicroNutrients>;
  removePhoto?: boolean;
  /** Create a ☕ drink instead of a QuickMeal (only read on create). */
  isDrink?: boolean;
}

/** ☕ Daily coffee habit: these drinks are pre-planned on every day from today on. */
export type CoffeeHabitItem = {
  mealId: string;
  count: number;
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
  /**
   * ☕ Personal entry (coffee, meal type 'drinks' on a plan day): only visible to its user and
   * counted fully for them — not divided by the day's persons. `servings` = cups.
   */
  personal?: boolean;
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

export type DisabledSlot = {
  date: string;
  mealType: MealType;
}

export type SlotNote = {
  date: string;
  mealType: MealType;
  note: string;
}

/**
 * Person count for one day of a plan. Overrides `MealPlan.defaultServings` for that day:
 * it is what the day's totals are divided by for per-person values, and the default portion
 * count when a meal is added to that day. No entry = the plan's count applies.
 */
export type DayPersons = {
  date: string;
  persons: number;
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
  disabledSlots?: DisabledSlot[];
  slotNotes?: SlotNote[];
  dayPersons?: DayPersons[];
  excludedIngredients?: string[];
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
  /** Personal feature: NAPO campus lunch menu in the quick meal dialog. */
  napoMenu?: boolean;
  /** Personal feature: Mensa Inffeldgasse menu in the quick meal dialog. */
  mensaMenu?: boolean;
  nutritionTargets?: NutritionTargets;
  mealsPerDay?: number;
}
