import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { format } from 'date-fns';
import { api } from '../api/client.js';
import type { Meal, MealPlan, MealPlanEntry, MealPlanState, MealType, ExtraItem, MenuCourse, PlanType, NutritionTargets, NutritionInfo, NutritionProfile, DisabledSlot, SlotNote, QuickMealData, DayPersons, ActivityDay, CoffeeHabitItem, Training } from '../types/index.js';
import { calculateOptimalMultiplier, getPerMealTargets } from '../utils/nutritionColors';
import { personsForDate } from '../utils/dayPersons';
import { DEFAULT_SORT_BY } from '../utils/mealFilters';
import type { SortBy } from '../utils/mealFilters';
import { buildActivityModel } from '../utils/activityModel';
import { resolveDayTargets } from '../utils/nutritionCalculator';
import type { ActivityModel } from '../utils/activityModel';
import { buildSportModel } from '../utils/sportModel';
import type { SportModel } from '../utils/sportModel';

interface MealPlanContextType {
  state: MealPlanState;
  activePlan: MealPlan | null;
  allMealsForActivePlan: Meal[];
  /** QuickMeals: eaten without recipe (newest first). Kept apart from state.meals, which are recipes only. */
  quickMeals: Meal[];
  saveQuickMeal: (data: QuickMealData, photo: File | null, mealId?: string) => Promise<Meal>;
  /** Turn a recipe into a quick meal (true) or back (false); ingredients, tags etc. are kept. */
  setMealQuick: (mealId: string, isQuick: boolean) => Promise<Meal>;

  // ☕ Coffee: drinks are QuickMeals with isDrink; cups are personal entries per day
  /** The user's drink templates (part of quickMeals). */
  drinks: Meal[];
  /** Cups per day that are pre-planned on every day from today on. */
  coffeeHabit: CoffeeHabitItem[];
  setCoffeeHabit: (habit: CoffeeHabitItem[]) => Promise<void>;
  /** Set how many cups of a drink the user has on a day of the active plan (0 removes it). */
  setCoffeeCount: (date: string, mealId: string, count: number) => void;
  isLoading: boolean;
  error: string | null;
  defaultServings: number;
  setDefaultServings: (servings: number) => void;
  nutritionTargets: NutritionTargets | null;
  setNutritionTargets: (targets: NutritionTargets | null) => Promise<void>;
  mealsPerDay: number;
  setMealsPerDay: (n: number) => Promise<void>;
  nutritionProfile: NutritionProfile | null;
  setNutritionProfile: (profile: NutritionProfile | null) => Promise<void>;
  useOptimalPortions: boolean;
  setUseOptimalPortions: (v: boolean) => Promise<void>;
  nutritionLogEnabled: boolean;
  setNutritionLogEnabled: (v: boolean) => Promise<void>;
  /** User's default sort order for recipe lists (Einstellungen). */
  defaultRecipeSort: SortBy;
  setDefaultRecipeSort: (v: SortBy) => Promise<void>;
  pantryStaples: string[];
  setPantryStaples: (items: string[]) => Promise<void>;
  freshIngredients: string[];
  setFreshIngredients: (items: string[]) => Promise<void>;

  // Apple Health (active energy pushed by an iOS Shortcut)
  healthEnabled: boolean;
  setHealthEnabled: (v: boolean) => Promise<void>;
  /** Share of the measured active kcal that counts toward the day's expenditure (0.5–1). */
  healthActiveFactor: number;
  setHealthActiveFactor: (v: number) => Promise<void>;
  healthTokenSet: boolean;
  /** Creates a new ingest token (the old one stops working) and returns it — it is only shown once. */
  createHealthToken: () => Promise<string>;
  revokeHealthToken: () => Promise<void>;
  activityDays: ActivityDay[];
  /** ISO timestamp of the last push from the Shortcut, null if none. */
  activityLastReceivedAt: string | null;
  clearActivity: () => Promise<void>;
  /** Measured activity for day targets; null when Apple Health is off. */
  activity: ActivityModel | null;

  // Flexible sport mode: trainings logged per day replace the weekly training schedule
  flexibleSportEnabled: boolean;
  setFlexibleSportEnabled: (v: boolean) => Promise<void>;
  trainings: Training[];
  addTraining: (training: Omit<Training, 'id'>) => Promise<void>;
  deleteTraining: (id: number) => Promise<void>;
  /** Logged trainings by date for day targets; null when the mode is off. */
  sport: SportModel | null;
  /** The day's nutrition targets (profile per weekday + Apple Health, else the manual ones). */
  targetsForDate: (date: string) => NutritionTargets;
  /** targetsForDate(today) — for views without a date, like recipe lists. */
  todayTargets: NutritionTargets;
  /** Local date (YYYY-MM-DD) the day targets treat as today; rolls over at midnight. */
  today: string;

  // Plan management
  createPlan: (name: string, startDate: Date | null, endDate: Date | null, planType?: PlanType) => Promise<number>;
  selectPlan: (planId: number) => void;
  deletePlan: (planId: number) => Promise<void>;
  renamePlan: (planId: number, name: string) => Promise<void>;
  updatePlanServings: (planId: number, servings: number) => Promise<void>;
  archivePlan: (planId: number, archived: boolean) => Promise<void>;
  resetMealPlan: () => Promise<void>;
  joinSharedPlan: (token: string) => Promise<number>;
  leavePlan: (planId: number) => Promise<void>;
  refreshPlans: () => Promise<void>;
  loadPlanDetails: (planIds: number[]) => Promise<void>;

  // Meal CRUD
  addMeal: (meal: Omit<Meal, 'id'>) => Promise<Meal | null>;
  updateMeal: (mealId: string, updatedMeal: Omit<Meal, 'id'>) => Promise<void>;
  deleteMeal: (mealId: string) => Promise<void>;
  toggleMealStar: (mealId: string) => void;

  // Import/Export
  importMeals: (recipes: Omit<Meal, 'id'>[]) => Promise<{ imported: Meal[]; skipped: string[] }>;
  importSharedMeal: (token: string) => Promise<Meal>;
  /** Copy a recipe (photo included); `overrides` replace fields, e.g. for a protein-upgrade variant. */
  duplicateMeal: (mealId: string, overrides?: Partial<Omit<Meal, 'id'>>) => Promise<Meal | null>;

  // Photo management
  uploadMealPhoto: (mealId: string, file: File) => Promise<string>;
  deleteMealPhoto: (mealId: string) => Promise<void>;
  downloadMealPhotoFromUrl: (mealId: string, url: string) => Promise<void>;

  // Entry operations (multi-meal slots)
  /** `servingsOverride` (total servings for the plan's persons) replaces the default/🎯 portion. */
  addMealToSlot: (date: string, mealType: MealType, mealId: string, servingsOverride?: number) => void;
  removeEntry: (entryId: number) => void;
  toggleEntryEnabled: (entryId: number) => void;
  updateEntryServings: (entryId: number, servings: number) => void;
  moveEntry: (entryId: number, toDate: string, toMealType: MealType) => void;
  toggleSlotDisabled: (date: string, mealType: MealType) => void;
  setSlotNote: (date: string, mealType: MealType, note: string) => void;
  /** Person count for one day; null clears it and the plan's count applies again. */
  setDayPersons: (date: string, persons: number | null) => void;
  toggleIngredientExcluded: (name: string) => void;
  renameIngredientInAllMeals: (oldName: string, newName: string) => void;

  // Extras (free-form items)
  addExtra: (category: ExtraItem['category'], name: string, amount: number, unit: string, courseId?: number) => void;
  updateExtra: (extraId: number, updates: Partial<Pick<ExtraItem, 'name' | 'amount' | 'unit' | 'enabled'>>) => void;
  removeExtra: (extraId: number) => void;

  // Menu courses
  addCourse: () => void;
  updateCourse: (courseId: number, updates: Partial<Pick<MenuCourse, 'label' | 'comment'>>) => void;
  removeCourse: (courseId: number) => void;
}

const MealPlanContext = createContext<MealPlanContextType | undefined>(undefined);

/** Plan with entries. `today` lets the server pre-fill the ☕ habit from the user's today on. */
const planUrl = (planId: number, today: string) => `/api/plans/${planId}?today=${today}`;
const COFFEE_SAVE_DELAY_MS = 400;

export const MealPlanProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<MealPlanState>({
    plans: [],
    activePlanId: null,
    meals: [],
  });
  const [quickMeals, setQuickMeals] = useState<Meal[]>([]);
  const [defaultServings, setDefaultServingsLocal] = useState(2);
  const [nutritionTargets, setNutritionTargetsLocal] = useState<NutritionTargets | null>(null);
  const [mealsPerDay, setMealsPerDayLocal] = useState(3);
  const [nutritionProfile, setNutritionProfileLocal] = useState<NutritionProfile | null>(null);
  const [useOptimalPortions, setUseOptimalPortionsLocal] = useState(false);
  const [nutritionLogEnabled, setNutritionLogEnabledLocal] = useState(false);
  const [defaultRecipeSort, setDefaultRecipeSortLocal] = useState<SortBy>(DEFAULT_SORT_BY);
  const [pantryStaples, setPantryStaplesLocal] = useState<string[]>([]);
  const [freshIngredients, setFreshIngredientsLocal] = useState<string[]>([]);
  const [healthEnabled, setHealthEnabledLocal] = useState(false);
  const [healthActiveFactor, setHealthActiveFactorLocal] = useState(0.8);
  const [healthTokenSet, setHealthTokenSet] = useState(false);
  const [coffeeHabit, setCoffeeHabitLocal] = useState<CoffeeHabitItem[]>([]);
  const [flexibleSportEnabled, setFlexibleSportEnabledLocal] = useState(false);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [activityDays, setActivityDays] = useState<ActivityDay[]>([]);
  const [activityLastReceivedAt, setActivityLastReceivedAt] = useState<string | null>(null);
  const [today, setToday] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    const load = async () => {
      try {
        const [meals, plans, settings] = await Promise.all([
          api.get<Meal[]>('/api/meals'),
          api.get<MealPlan[]>('/api/plans'),
          api.get<{ defaultServings: number; nutritionTargets: NutritionTargets | null; mealsPerDay: number; nutritionProfile: NutritionProfile | null; useOptimalPortions: boolean; pantryStaples?: string[]; freshIngredients?: string[]; nutritionLogEnabled?: boolean; defaultRecipeSort?: SortBy; healthEnabled?: boolean; healthActiveFactor?: number; healthTokenSet?: boolean; coffeeHabit?: CoffeeHabitItem[]; flexibleSportEnabled?: boolean }>('/api/settings'),
        ]);
        setDefaultServingsLocal(settings.defaultServings);
        setNutritionTargetsLocal(settings.nutritionTargets);
        if (settings.mealsPerDay) setMealsPerDayLocal(settings.mealsPerDay);
        if (settings.nutritionProfile) setNutritionProfileLocal(settings.nutritionProfile);
        setUseOptimalPortionsLocal(!!settings.useOptimalPortions);
        setNutritionLogEnabledLocal(!!settings.nutritionLogEnabled);
        if (settings.defaultRecipeSort) setDefaultRecipeSortLocal(settings.defaultRecipeSort);
        if (settings.pantryStaples) setPantryStaplesLocal(settings.pantryStaples);
        if (settings.freshIngredients) setFreshIngredientsLocal(settings.freshIngredients);
        setHealthEnabledLocal(!!settings.healthEnabled);
        if (settings.healthActiveFactor) setHealthActiveFactorLocal(settings.healthActiveFactor);
        setHealthTokenSet(!!settings.healthTokenSet);
        setCoffeeHabitLocal(settings.coffeeHabit ?? []);
        setFlexibleSportEnabledLocal(!!settings.flexibleSportEnabled);

        // Check URL hash for a specific plan ID
        const hashMatch = window.location.hash.match(/^#(?:planer|menuplan)\/(\d+)/);
        const hashPlanId = hashMatch ? parseInt(hashMatch[1]) : null;
        const initialPlanId = (hashPlanId && plans.some(p => p.id === hashPlanId))
          ? hashPlanId
          : (plans.length > 0 ? plans[0].id : null);

        setQuickMeals(meals.filter(m => m.isQuick).sort((a, b) => (b.id > a.id ? 1 : -1)));
        setState({
          meals: meals.filter(m => !m.isQuick),
          plans,
          activePlanId: initialPlanId,
        });

        // Load entries for the active plan
        if (initialPlanId) {
          const planWithEntries = await api.get<MealPlan>(planUrl(initialPlanId, format(new Date(), 'yyyy-MM-dd')));
          setState(prev => ({
            ...prev,
            plans: prev.plans.map(p => p.id === initialPlanId ? planWithEntries : p),
          }));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Laden der Daten');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const activePlan = state.plans.find(p => p.id === state.activePlanId) ?? null;

  // Merge user's own meals with shared meals from active plan for lookups
  const allMealsForActivePlan = React.useMemo(() => {
    const own = quickMeals.length > 0 ? [...state.meals, ...quickMeals] : state.meals;
    const shared = activePlan?.sharedMeals || [];
    if (shared.length === 0) return own;
    const ownIds = new Set(own.map(m => m.id));
    return [...own, ...shared.filter(m => !ownIds.has(m.id))];
  }, [state.meals, quickMeals, activePlan?.sharedMeals]);

  // Create (no mealId) or update a quick meal; the plate photo is optional.
  const saveQuickMeal = useCallback(async (data: QuickMealData, photo: File | null, mealId?: string) => {
    const formData = new FormData();
    formData.append('data', JSON.stringify(data));
    if (photo) formData.append('photo', photo);
    const meal = mealId
      ? await api.upload<Meal>(`/api/meals/quick/${mealId}`, formData, 'PUT')
      : await api.upload<Meal>('/api/meals/quick', formData);
    setQuickMeals(prev => [meal, ...prev.filter(m => m.id !== meal.id)]);
    return meal;
  }, []);

  // Move a meal between the recipe list and the quick meals (nothing else about it changes).
  const setMealQuick = useCallback(async (mealId: string, isQuick: boolean) => {
    const meal = await api.patch<Meal>(`/api/meals/${mealId}/quick`, { isQuick });
    setState(prev => ({
      ...prev,
      meals: isQuick ? prev.meals.filter(m => m.id !== mealId) : [...prev.meals.filter(m => m.id !== mealId), meal],
    }));
    setQuickMeals(prev => isQuick ? [meal, ...prev.filter(m => m.id !== mealId)] : prev.filter(m => m.id !== mealId));
    return meal;
  }, []);

  const setDefaultServings = useCallback(async (servings: number) => {
    setDefaultServingsLocal(servings);
    try {
      await api.put('/api/settings', { defaultServings: servings });
    } catch {
      console.error('Failed to save default servings');
    }
  }, []);

  const setNutritionTargets = useCallback(async (targets: NutritionTargets | null) => {
    setNutritionTargetsLocal(targets);
    try {
      await api.put('/api/settings', { nutritionTargets: targets });
    } catch {
      console.error('Failed to save nutrition targets');
    }
  }, []);

  const setMealsPerDay = useCallback(async (n: number) => {
    setMealsPerDayLocal(n);
    try {
      await api.put('/api/settings', { mealsPerDay: n });
    } catch {
      console.error('Failed to save meals per day');
    }
  }, []);

  const setNutritionProfile = useCallback(async (profile: NutritionProfile | null) => {
    setNutritionProfileLocal(profile);
    try {
      await api.put('/api/settings', { nutritionProfile: profile });
    } catch {
      console.error('Failed to save nutrition profile');
    }
  }, []);

  const setUseOptimalPortions = useCallback(async (v: boolean) => {
    setUseOptimalPortionsLocal(v);
    try {
      await api.put('/api/settings', { useOptimalPortions: v });
    } catch {
      console.error('Failed to save optimal portions setting');
    }
  }, []);

  const setNutritionLogEnabled = useCallback(async (v: boolean) => {
    setNutritionLogEnabledLocal(v);
    try {
      await api.put('/api/settings', { nutritionLogEnabled: v });
    } catch {
      console.error('Failed to save nutrition log setting');
    }
  }, []);

  const setHealthEnabled = useCallback(async (v: boolean) => {
    setHealthEnabledLocal(v);
    try {
      await api.put('/api/settings', { healthEnabled: v });
    } catch {
      console.error('Failed to save Apple Health setting');
    }
  }, []);

  const setHealthActiveFactor = useCallback(async (v: number) => {
    setHealthActiveFactorLocal(v);
    try {
      await api.put('/api/settings', { healthActiveFactor: v });
    } catch {
      console.error('Failed to save Apple Health factor');
    }
  }, []);

  const createHealthToken = useCallback(async () => {
    const { token } = await api.post<{ token: string }>('/api/activity/token', {});
    setHealthTokenSet(true);
    return token;
  }, []);

  const revokeHealthToken = useCallback(async () => {
    await api.delete('/api/activity/token');
    setHealthTokenSet(false);
  }, []);

  const reloadActivity = useCallback(async () => {
    try {
      const data = await api.get<{ days: ActivityDay[]; lastReceivedAt: string | null }>('/api/activity');
      setActivityDays(data.days);
      setActivityLastReceivedAt(data.lastReceivedAt);
    } catch {
      console.error('Failed to load activity data');
    }
  }, []);

  const clearActivity = useCallback(async () => {
    await api.delete('/api/activity');
    setActivityDays([]);
    setActivityLastReceivedAt(null);
  }, []);

  // Day targets depend on the weekday: move "today" forward at midnight, also when the tab stays
  // open (minute check) or was in the background (on becoming visible). Same value = no re-render.
  useEffect(() => {
    const tick = () => setToday(format(new Date(), 'yyyy-MM-dd'));
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    const timer = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Activity arrives from the phone in the background: refetch whenever the app comes back into view.
  useEffect(() => {
    if (!healthEnabled) return;
    reloadActivity();
    const onVisible = () => {
      if (document.visibilityState === 'visible') reloadActivity();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [healthEnabled, reloadActivity]);

  const activity = React.useMemo(
    () => (healthEnabled ? buildActivityModel(activityDays, healthActiveFactor, today) : null),
    [healthEnabled, activityDays, healthActiveFactor, today],
  );

  // --- Flexible sport mode ---

  useEffect(() => {
    if (!flexibleSportEnabled) return;
    api.get<Training[]>('/api/trainings').then(setTrainings).catch(() => setTrainings([]));
  }, [flexibleSportEnabled]);

  const setFlexibleSportEnabled = useCallback(async (v: boolean) => {
    setFlexibleSportEnabledLocal(v);
    try {
      await api.put('/api/settings', { flexibleSportEnabled: v });
    } catch {
      setFlexibleSportEnabledLocal(!v);
    }
  }, []);

  const addTraining = useCallback(async (training: Omit<Training, 'id'>) => {
    const saved = await api.post<Training>('/api/trainings', training);
    setTrainings(prev => [...prev, saved]);
  }, []);

  const deleteTraining = useCallback(async (id: number) => {
    setTrainings(prev => prev.filter(t => t.id !== id));
    try {
      await api.delete(`/api/trainings/${id}`);
    } catch {
      api.get<Training[]>('/api/trainings').then(setTrainings).catch(() => {});
    }
  }, []);

  const sport = React.useMemo(
    () => (flexibleSportEnabled ? buildSportModel(trainings) : null),
    [flexibleSportEnabled, trainings],
  );

  // Menu plans use pseudo dates ("course_3") — those get today's targets.
  const targetsForDate = useCallback(
    (date: string) => resolveDayTargets(/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today, nutritionProfile, nutritionTargets, activity, sport),
    [today, nutritionProfile, nutritionTargets, activity, sport],
  );
  const todayTargets = React.useMemo(() => targetsForDate(today), [targetsForDate, today]);

  const setDefaultRecipeSort = useCallback(async (v: SortBy) => {
    setDefaultRecipeSortLocal(v);
    try {
      await api.put('/api/settings', { defaultRecipeSort: v });
    } catch {
      console.error('Failed to save default recipe sort');
    }
  }, []);

  const setPantryStaples = useCallback(async (items: string[]) => {
    setPantryStaplesLocal(items);
    try {
      await api.put('/api/settings', { pantryStaples: items });
    } catch {
      console.error('Failed to save pantry staples');
    }
  }, []);

  const setFreshIngredients = useCallback(async (items: string[]) => {
    setFreshIngredientsLocal(items);
    try {
      await api.put('/api/settings', { freshIngredients: items });
    } catch {
      console.error('Failed to save fresh ingredients');
    }
  }, []);

  // --- Plan management ---

  const createPlan = useCallback(async (name: string, startDate: Date | null, endDate: Date | null, planType?: PlanType) => {
    const body: Record<string, unknown> = { name };
    if (planType) body.planType = planType;
    if (startDate) body.startDate = format(startDate, 'yyyy-MM-dd');
    if (endDate) body.endDate = format(endDate, 'yyyy-MM-dd');

    const plan = await api.post<MealPlan>('/api/plans', body);

    // Load it like any other plan — that also pre-fills the ☕ habit.
    const loaded = planType === 'menu' ? null : await api.get<MealPlan>(planUrl(plan.id, today)).catch(() => null);
    const fullPlan: MealPlan = loaded ?? { ...plan, entries: [], extras: [], courses: plan.courses || [] };
    setState(prev => ({
      ...prev,
      plans: [fullPlan, ...prev.plans],
      activePlanId: plan.id,
    }));
    return plan.id;
  }, [today]);

  const selectPlan = useCallback(async (planId: number) => {
    setState(prev => ({ ...prev, activePlanId: planId }));

    // Load entries if not already loaded
    const plan = state.plans.find(p => p.id === planId);
    if (plan && !plan.entries) {
      try {
        const planWithEntries = await api.get<MealPlan>(planUrl(planId, today));
        setState(prev => ({
          ...prev,
          plans: prev.plans.map(p => p.id === planId ? planWithEntries : p),
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Laden des Plans');
      }
    }
  }, [state.plans, today]);

  const deletePlan = useCallback(async (planId: number) => {
    await api.delete(`/api/plans/${planId}`);
    setState(prev => {
      const remaining = prev.plans.filter(p => p.id !== planId);
      return {
        ...prev,
        plans: remaining,
        activePlanId: prev.activePlanId === planId
          ? (remaining.length > 0 ? remaining[0].id : null)
          : prev.activePlanId,
      };
    });
  }, []);

  const renamePlan = useCallback(async (planId: number, name: string) => {
    const updated = await api.put<MealPlan>(`/api/plans/${planId}`, { name });
    setState(prev => ({
      ...prev,
      plans: prev.plans.map(p => p.id === planId ? { ...p, name: updated.name } : p),
    }));
  }, []);

  const updatePlanServings = useCallback(async (planId: number, servings: number) => {
    await api.put<MealPlan>(`/api/plans/${planId}`, { defaultServings: servings });
    setState(prev => ({
      ...prev,
      plans: prev.plans.map(p => p.id === planId ? { ...p, defaultServings: servings } : p),
    }));
  }, []);

  const archivePlan = useCallback(async (planId: number, archived: boolean) => {
    await api.put<MealPlan>(`/api/plans/${planId}`, { archived });
    setState(prev => ({
      ...prev,
      plans: prev.plans.map(p => p.id === planId ? { ...p, archived } : p),
      activePlanId: prev.activePlanId === planId && archived ? null : prev.activePlanId,
    }));
  }, []);

  const resetMealPlan = useCallback(async () => {
    if (!state.activePlanId) return;
    await api.delete(`/api/plans/${state.activePlanId}`);
    setState(prev => ({
      ...prev,
      plans: prev.plans.filter(p => p.id !== prev.activePlanId),
      activePlanId: null,
    }));
  }, [state.activePlanId]);

  const joinSharedPlan = useCallback(async (token: string): Promise<number> => {
    const result = await api.post<{ planId: number; planName: string }>(`/api/share/${token}/join`);
    const plans = await api.get<MealPlan[]>('/api/plans');
    const planWithEntries = await api.get<MealPlan>(planUrl(result.planId, today));
    setState(prev => ({
      ...prev,
      plans: plans.map(p => p.id === result.planId ? planWithEntries : p),
      activePlanId: result.planId,
    }));
    return result.planId;
  }, [today]);

  const importSharedMeal = useCallback(async (token: string): Promise<Meal> => {
    const meal = await api.post<Meal>(`/api/meals/public/${token}/import`);
    setState(prev => ({ ...prev, meals: [...prev.meals, meal] }));
    return meal;
  }, []);

  const leavePlan = useCallback(async (planId: number) => {
    await api.delete(`/api/plans/${planId}`);
    setState(prev => {
      const remaining = prev.plans.filter(p => p.id !== planId);
      return {
        ...prev,
        plans: remaining,
        activePlanId: prev.activePlanId === planId
          ? (remaining.length > 0 ? remaining[0].id : null)
          : prev.activePlanId,
      };
    });
  }, []);

  const refreshPlans = useCallback(async () => {
    const plans = await api.get<MealPlan[]>('/api/plans');
    setState(prev => ({
      ...prev,
      plans: plans.map(p => {
        const existing = prev.plans.find(ep => ep.id === p.id);
        return existing ? { ...p, entries: existing.entries, sharedMeals: existing.sharedMeals, collaborators: existing.collaborators } : p;
      }),
    }));
  }, []);

  // Load entries (+ shared meals) for plans that don't have them yet, e.g. for plan scores in the overview.
  const loadingPlanIds = React.useRef(new Set<number>());
  const loadPlanDetails = useCallback(async (planIds: number[]) => {
    const missing = planIds.filter(id => !loadingPlanIds.current.has(id) && !state.plans.find(p => p.id === id)?.entries);
    if (missing.length === 0) return;
    missing.forEach(id => loadingPlanIds.current.add(id));
    const loaded = await Promise.all(missing.map(id => api.get<MealPlan>(planUrl(id, today)).catch(() => null)));
    missing.forEach(id => loadingPlanIds.current.delete(id));
    const byId = new Map(loaded.filter((p): p is MealPlan => !!p).map(p => [p.id, p]));
    setState(prev => ({
      ...prev,
      plans: prev.plans.map(p => (!p.entries && byId.has(p.id) ? byId.get(p.id)! : p)),
    }));
  }, [state.plans, today]);

  // --- Helper to update entries in active plan ---

  const updateActivePlanEntries = useCallback((updater: (entries: MealPlanEntry[]) => MealPlanEntry[]) => {
    setState(prev => ({
      ...prev,
      plans: prev.plans.map(p =>
        p.id === prev.activePlanId
          ? { ...p, entries: updater(p.entries || []) }
          : p
      ),
    }));
  }, []);

  const updateActivePlanExtras = useCallback((updater: (extras: ExtraItem[]) => ExtraItem[]) => {
    setState(prev => ({
      ...prev,
      plans: prev.plans.map(p =>
        p.id === prev.activePlanId
          ? { ...p, extras: updater(p.extras || []) }
          : p
      ),
    }));
  }, []);

  const updateActivePlanDisabledSlots = useCallback((updater: (slots: DisabledSlot[]) => DisabledSlot[]) => {
    setState(prev => ({
      ...prev,
      plans: prev.plans.map(p =>
        p.id === prev.activePlanId
          ? { ...p, disabledSlots: updater(p.disabledSlots || []) }
          : p
      ),
    }));
  }, []);

  const updateActivePlanSlotNotes = useCallback((updater: (notes: SlotNote[]) => SlotNote[]) => {
    setState(prev => ({
      ...prev,
      plans: prev.plans.map(p =>
        p.id === prev.activePlanId
          ? { ...p, slotNotes: updater(p.slotNotes || []) }
          : p
      ),
    }));
  }, []);

  const updateActivePlanDayPersons = useCallback((updater: (days: DayPersons[]) => DayPersons[]) => {
    setState(prev => ({
      ...prev,
      plans: prev.plans.map(p =>
        p.id === prev.activePlanId
          ? { ...p, dayPersons: updater(p.dayPersons || []) }
          : p
      ),
    }));
  }, []);

  const updateActivePlanExcludedIngredients = useCallback((updater: (excluded: string[]) => string[]) => {
    setState(prev => ({
      ...prev,
      plans: prev.plans.map(p =>
        p.id === prev.activePlanId
          ? { ...p, excludedIngredients: updater(p.excludedIngredients || []) }
          : p
      ),
    }));
  }, []);

  // --- Meal CRUD ---

  // Fire-and-forget nutrition estimation, updates meal in state when done
  const estimateNutritionInBackground = useCallback((mealId: string, force?: boolean) => {
    api.post<{ nutritionPerServing: NutritionInfo; portionWeight?: number; tagsUpdated: string[] | null }>('/api/estimate-nutrition', { mealId, force })
      .then(result => {
        setState(prev => ({
          ...prev,
          meals: prev.meals.map(m => m.id === mealId ? {
            ...m,
            nutritionPerServing: result.nutritionPerServing,
            portionWeight: result.portionWeight,
            ...(result.tagsUpdated ? { tags: result.tagsUpdated } : {}),
          } : m),
        }));
      })
      .catch(() => { /* silent — user can trigger manually */ });
  }, []);

  const addMeal = useCallback(async (meal: Omit<Meal, 'id'>): Promise<Meal | null> => {
    try {
      const newMeal = await api.post<Meal>('/api/meals', meal);
      setState(prev => ({
        ...prev,
        meals: [...prev.meals, newMeal],
      }));
      // Auto-estimate nutrition if meal has ingredients
      if (newMeal.ingredients?.length > 0) {
        estimateNutritionInBackground(newMeal.id);
      }
      return newMeal;
    } catch (err) {
      console.error('Add meal failed:', err);
      return null;
    }
  }, [estimateNutritionInBackground]);

  const importMeals = useCallback(async (recipes: Omit<Meal, 'id'>[]): Promise<{ imported: Meal[]; skipped: string[] }> => {
    const result = await api.post<{ imported: Meal[]; skipped: string[] }>('/api/meals/import', { recipes });
    if (result.imported.length > 0) {
      setState(prev => ({
        ...prev,
        meals: [...prev.meals, ...result.imported],
      }));
    }
    return result;
  }, []);

  const updateMeal = useCallback(async (mealId: string, updatedMeal: Omit<Meal, 'id'>) => {
    const prev = state.meals;
    const hadIngredientChange = updatedMeal.ingredients !== undefined;
    // Optimistic update — merge with existing meal, stripping undefined values
    // to preserve fields not in the form (e.g. photoUrl)
    const defined = Object.fromEntries(
      Object.entries(updatedMeal).filter(([, v]) => v !== undefined)
    );
    setState(s => ({
      ...s,
      meals: s.meals.map(m => m.id === mealId ? {
        ...m, ...defined, id: mealId,
        ...(hadIngredientChange ? { nutritionPerServing: undefined, portionWeight: undefined } : {}),
      } : m),
    }));
    try {
      await api.put<Meal>(`/api/meals/${mealId}`, updatedMeal);
      // Re-estimate nutrition if ingredients changed
      if (hadIngredientChange && updatedMeal.ingredients && updatedMeal.ingredients.length > 0) {
        estimateNutritionInBackground(mealId, true);
      }
    } catch {
      setState(s => ({ ...s, meals: prev }));
    }
  }, [state.meals, estimateNutritionInBackground]);

  const deleteMeal = useCallback(async (mealId: string) => {
    await api.delete(`/api/meals/${mealId}`);
    setQuickMeals(prev => prev.filter(m => m.id !== mealId));
    setState(prev => ({
      ...prev,
      meals: prev.meals.filter(m => m.id !== mealId),
      // DB cascades deletes, so remove entries referencing this meal
      plans: prev.plans.map(p => ({
        ...p,
        entries: (p.entries || []).filter(e => e.mealId !== mealId),
      })),
    }));
  }, []);

  const toggleMealStar = useCallback((mealId: string) => {
    const flip = (meals: Meal[]) => meals.map(m => m.id === mealId ? { ...m, starred: !m.starred } : m);
    setState(prev => ({ ...prev, meals: flip(prev.meals) }));
    setQuickMeals(flip);
    api.patch(`/api/meals/${mealId}/star`).catch(() => {
      // Revert
      setState(prev => ({ ...prev, meals: flip(prev.meals) }));
      setQuickMeals(flip);
    });
  }, []);

  // --- Photo management ---

  const updateMealPhotoInState = useCallback((mealId: string, photoUrl: string | undefined) => {
    // Use a short delay to ensure addMeal's setState has flushed first
    // (React 18 batches setState calls in async functions)
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        meals: prev.meals.map(m => m.id === mealId ? { ...m, photoUrl } : m),
      }));
    }, 0);
  }, []);

  const uploadMealPhoto = useCallback(async (mealId: string, file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('photo', file);
    const result = await api.upload<{ photoUrl: string }>(`/api/meals/${mealId}/photo`, formData);
    updateMealPhotoInState(mealId, result.photoUrl);
    return result.photoUrl;
  }, [updateMealPhotoInState]);

  const deleteMealPhoto = useCallback(async (mealId: string): Promise<void> => {
    await api.delete(`/api/meals/${mealId}/photo`);
    setState(prev => ({
      ...prev,
      meals: prev.meals.map(m => m.id === mealId ? { ...m, photoUrl: undefined } : m),
    }));
  }, []);

  const downloadMealPhotoFromUrl = useCallback(async (mealId: string, url: string): Promise<void> => {
    try {
      const result = await api.post<{ photoUrl: string }>(`/api/meals/${mealId}/photo-from-url`, { url });
      updateMealPhotoInState(mealId, result.photoUrl);
    } catch (err) {
      console.error('Download photo from URL failed:', err);
    }
  }, [updateMealPhotoInState]);

  const duplicateMeal = useCallback(async (mealId: string, overrides?: Partial<Omit<Meal, 'id'>>): Promise<Meal | null> => {
    const meal = state.meals.find(m => m.id === mealId);
    if (!meal) return null;
    const { id: _, photoUrl, ...rest } = meal;
    const copy = { ...rest, name: `${meal.name} (Kopie)`, ...overrides };
    const newMeal = await addMeal(copy);
    if (newMeal && photoUrl) {
      const fullUrl = `${window.location.origin}${photoUrl}`;
      await downloadMealPhotoFromUrl(newMeal.id, fullUrl);
    }
    return newMeal;
  }, [state.meals, addMeal, downloadMealPhotoFromUrl]);

  // --- Entry operations (multi-meal slots) ---

  const addMealToSlot = useCallback((date: string, mealType: MealType, mealId: string, servingsOverride?: number) => {
    if (!state.activePlanId) return;

    // Default portions = the people eating on THAT day (plan count, or the day's own).
    const plan = state.plans.find(p => p.id === state.activePlanId);
    let servings = servingsOverride ?? personsForDate(plan, date, defaultServings);

    // Apply optimal multiplier if enabled. Not for snacks: the per-meal target is a full main
    // meal (daily / mealsPerDay), which would blow a snack up to lunch size.
    if (servingsOverride === undefined && useOptimalPortions && mealType !== 'snacks') {
      const meal = state.meals.find(m => m.id === mealId);
      if (meal?.nutritionPerServing) {
        const perMeal = getPerMealTargets(targetsForDate(date), mealsPerDay);
        const M = calculateOptimalMultiplier(meal.nutritionPerServing, perMeal);
        servings = Math.round(servings * M * 10) / 10;
      }
    }

    // Clear disabled slot if present
    const isDisabled = plan?.disabledSlots?.some(s => s.date === date && s.mealType === mealType);
    if (isDisabled) {
      updateActivePlanDisabledSlots(sl => sl.filter(s => !(s.date === date && s.mealType === mealType)));
      api.post(`/api/plans/${state.activePlanId}/disabled-slots`, { date, mealType }).catch(() => {});
    }

    // Optimistic: create temporary entry with negative id
    const tempId = -Date.now();
    const newEntry: MealPlanEntry = {
      id: tempId,
      date,
      mealType,
      mealId,
      servings,
      enabled: true,
    };
    updateActivePlanEntries(entries => [...entries, newEntry]);

    api.post<MealPlanEntry>(`/api/plans/${state.activePlanId}/entries`, {
      date, mealType, mealId, servings,
    }).then(serverEntry => {
      // Replace temp entry with server entry (which has real id)
      updateActivePlanEntries(entries =>
        entries.map(e => e.id === tempId ? serverEntry : e)
      );
    }).catch(err => {
      console.error('Add meal to slot failed:', err);
      updateActivePlanEntries(entries => entries.filter(e => e.id !== tempId));
    });
  }, [state.activePlanId, state.plans, state.meals, defaultServings, useOptimalPortions, targetsForDate, mealsPerDay, updateActivePlanEntries]);

  const removeEntry = useCallback((entryId: number) => {
    if (!state.activePlanId) return;
    // Optimistic
    updateActivePlanEntries(entries => entries.filter(e => e.id !== entryId));
    api.delete(`/api/plans/${state.activePlanId}/entries/${entryId}`).catch(err => {
      console.error('Remove entry failed:', err);
    });
  }, [state.activePlanId, updateActivePlanEntries]);

  const toggleEntryEnabled = useCallback((entryId: number) => {
    if (!state.activePlanId) return;
    const entry = activePlan?.entries?.find(e => e.id === entryId);
    if (!entry) return;
    const newEnabled = !entry.enabled;
    // Optimistic
    updateActivePlanEntries(entries =>
      entries.map(e => e.id === entryId ? { ...e, enabled: newEnabled } : e)
    );
    api.put(`/api/plans/${state.activePlanId}/entries/${entryId}`, { enabled: newEnabled }).catch(err => {
      console.error('Toggle entry enabled failed:', err);
    });
  }, [state.activePlanId, activePlan, updateActivePlanEntries]);

  const updateEntryServings = useCallback((entryId: number, servings: number) => {
    if (!state.activePlanId) return;
    // Optimistic
    updateActivePlanEntries(entries =>
      entries.map(e => e.id === entryId ? { ...e, servings } : e)
    );
    api.put(`/api/plans/${state.activePlanId}/entries/${entryId}`, { servings }).catch(err => {
      console.error('Update entry servings failed:', err);
    });
  }, [state.activePlanId, updateActivePlanEntries]);

  // --- ☕ Coffee ---

  const drinks = React.useMemo(() => quickMeals.filter(m => m.isDrink), [quickMeals]);

  // Taps show at once; saving waits until the user pauses (one request per day + drink).
  const coffeeTimers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const coffeeSeq = React.useRef(new Map<string, number>());
  const setCoffeeCount = useCallback((date: string, mealId: string, count: number) => {
    const planId = state.activePlanId;
    if (!planId) return;
    const cups = Math.max(0, Math.min(20, Math.round(count)));
    const isCup = (e: MealPlanEntry) => !!e.personal && e.mealType === 'drinks' && e.date === date && e.mealId === mealId;

    updateActivePlanEntries(entries => {
      const existing = entries.find(isCup);
      const rest = entries.filter(e => !isCup(e));
      if (cups === 0) return rest;
      return [...rest, existing
        ? { ...existing, servings: cups }
        : { id: -Date.now(), date, mealType: 'drinks', mealId, servings: cups, enabled: true, personal: true }];
    });

    const key = `${planId}|${date}|${mealId}`;
    clearTimeout(coffeeTimers.current.get(key));
    coffeeTimers.current.set(key, setTimeout(() => {
      coffeeTimers.current.delete(key);
      const seq = (coffeeSeq.current.get(key) ?? 0) + 1;
      coffeeSeq.current.set(key, seq);
      api.put<{ entry: MealPlanEntry | null }>(`/api/plans/${planId}/coffee`, { date, mealId, count: cups })
        .then(({ entry }) => {
          // A newer tap is waiting or in flight — its response settles the state.
          if (coffeeSeq.current.get(key) !== seq || coffeeTimers.current.has(key)) return;
          setState(prev => ({
            ...prev,
            plans: prev.plans.map(p => p.id !== planId ? p : {
              ...p,
              entries: [...(p.entries || []).filter(e => !isCup(e)), ...(entry ? [entry] : [])],
            }),
          }));
        })
        .catch(err => console.error('Set coffee failed:', err));
    }, COFFEE_SAVE_DELAY_MS));
  }, [state.activePlanId, updateActivePlanEntries]);

  const setCoffeeHabit = useCallback(async (habit: CoffeeHabitItem[]) => {
    const settings = await api.put<{ coffeeHabit?: CoffeeHabitItem[] }>('/api/settings', { coffeeHabit: habit, today });
    setCoffeeHabitLocal(settings.coffeeHabit ?? []);
    // The server replaced the untouched future habit cups — reload every plan that has entries.
    const loadedIds = state.plans.filter(p => p.entries).map(p => p.id);
    const reloaded = await Promise.all(loadedIds.map(id => api.get<MealPlan>(planUrl(id, today)).catch(() => null)));
    const byId = new Map(reloaded.filter((p): p is MealPlan => !!p).map(p => [p.id, p]));
    setState(prev => ({ ...prev, plans: prev.plans.map(p => byId.get(p.id) ?? p) }));
  }, [today, state.plans]);

  const moveEntry = useCallback((entryId: number, toDate: string, toMealType: MealType) => {
    if (!state.activePlanId) return;
    // Optimistic
    updateActivePlanEntries(entries =>
      entries.map(e => e.id === entryId ? { ...e, date: toDate, mealType: toMealType } : e)
    );
    api.put(`/api/plans/${state.activePlanId}/entries/${entryId}/move`, { toDate, toMealType }).catch(err => {
      console.error('Move entry failed:', err);
    });
  }, [state.activePlanId, updateActivePlanEntries]);

  // --- Disabled slots (empty slot toggle) ---

  const toggleSlotDisabled = useCallback((date: string, mealType: MealType) => {
    if (!state.activePlanId) return;
    const slots = activePlan?.disabledSlots || [];
    const isCurrentlyDisabled = slots.some(s => s.date === date && s.mealType === mealType);

    // Optimistic toggle
    if (isCurrentlyDisabled) {
      updateActivePlanDisabledSlots(sl => sl.filter(s => !(s.date === date && s.mealType === mealType)));
    } else {
      updateActivePlanDisabledSlots(sl => [...sl, { date, mealType }]);
    }

    api.post(`/api/plans/${state.activePlanId}/disabled-slots`, { date, mealType }).catch(err => {
      console.error('Toggle disabled slot failed:', err);
    });
  }, [state.activePlanId, activePlan, updateActivePlanDisabledSlots]);

  // --- Slot notes (per date + mealType comment) ---

  const setSlotNote = useCallback((date: string, mealType: MealType, note: string) => {
    if (!state.activePlanId) return;
    const trimmed = note.trim();

    // Optimistic update: set/replace or remove when empty
    if (!trimmed) {
      updateActivePlanSlotNotes(notes => notes.filter(n => !(n.date === date && n.mealType === mealType)));
    } else {
      updateActivePlanSlotNotes(notes => {
        const others = notes.filter(n => !(n.date === date && n.mealType === mealType));
        return [...others, { date, mealType, note: trimmed }];
      });
    }

    api.post(`/api/plans/${state.activePlanId}/slot-notes`, { date, mealType, note: trimmed }).catch(err => {
      console.error('Set slot note failed:', err);
    });
  }, [state.activePlanId, updateActivePlanSlotNotes]);

  const setDayPersons = useCallback((date: string, persons: number | null) => {
    if (!state.activePlanId) return;
    const value = persons && persons >= 1 ? Math.min(50, Math.round(persons)) : null;

    updateActivePlanDayPersons(days => {
      const others = days.filter(d => d.date !== date);
      return value === null ? others : [...others, { date, persons: value }];
    });

    api.post(`/api/plans/${state.activePlanId}/day-persons`, { date, persons: value }).catch(err => {
      console.error('Set day persons failed:', err);
    });
  }, [state.activePlanId, updateActivePlanDayPersons]);

  // --- Excluded shopping ingredients (per-plan) ---

  const toggleIngredientExcluded = useCallback((name: string) => {
    if (!state.activePlanId) return;
    const normalized = name.toLowerCase().trim();
    if (!normalized) return;

    const current = activePlan?.excludedIngredients || [];
    const isExcluded = current.includes(normalized);

    updateActivePlanExcludedIngredients(excluded =>
      isExcluded ? excluded.filter(n => n !== normalized) : [...excluded, normalized]
    );

    api.post(`/api/plans/${state.activePlanId}/excluded-ingredients`, { name: normalized }).catch(err => {
      console.error('Toggle excluded ingredient failed:', err);
      // Revert
      updateActivePlanExcludedIngredients(excluded =>
        isExcluded ? [...excluded, normalized] : excluded.filter(n => n !== normalized)
      );
    });
  }, [state.activePlanId, activePlan, updateActivePlanExcludedIngredients]);

  // --- Extras (free-form items) ---

  const addExtra = useCallback((category: ExtraItem['category'], name: string, amount: number, unit: string, courseId?: number) => {
    if (!state.activePlanId) return;

    const tempId = -Date.now();
    const newExtra: ExtraItem = { id: tempId, category, name, amount, unit, enabled: true, courseId };
    updateActivePlanExtras(extras => [...extras, newExtra]);

    api.post<ExtraItem>(`/api/plans/${state.activePlanId}/extras`, { category, name, amount, unit, courseId })
      .then(serverExtra => {
        updateActivePlanExtras(extras => extras.map(e => e.id === tempId ? serverExtra : e));
      })
      .catch(err => {
        console.error('Add extra failed:', err);
        updateActivePlanExtras(extras => extras.filter(e => e.id !== tempId));
      });
  }, [state.activePlanId, updateActivePlanExtras]);

  const updateExtra = useCallback((extraId: number, updates: Partial<Pick<ExtraItem, 'name' | 'amount' | 'unit' | 'enabled'>>) => {
    if (!state.activePlanId) return;
    updateActivePlanExtras(extras => extras.map(e => e.id === extraId ? { ...e, ...updates } : e));
    api.put(`/api/plans/${state.activePlanId}/extras/${extraId}`, updates).catch(err => {
      console.error('Update extra failed:', err);
    });
  }, [state.activePlanId, updateActivePlanExtras]);

  const removeExtra = useCallback((extraId: number) => {
    if (!state.activePlanId) return;
    updateActivePlanExtras(extras => extras.filter(e => e.id !== extraId));
    api.delete(`/api/plans/${state.activePlanId}/extras/${extraId}`).catch(err => {
      console.error('Remove extra failed:', err);
    });
  }, [state.activePlanId, updateActivePlanExtras]);

  // --- Menu courses ---

  const updateActivePlanCourses = useCallback((updater: (courses: MenuCourse[]) => MenuCourse[]) => {
    setState(prev => ({
      ...prev,
      plans: prev.plans.map(p =>
        p.id === prev.activePlanId
          ? { ...p, courses: updater(p.courses || []) }
          : p
      ),
    }));
  }, []);

  const addCourse = useCallback(() => {
    if (!state.activePlanId) return;

    const tempId = -Date.now();
    const currentCourses = activePlan?.courses || [];
    const nextOrder = currentCourses.length > 0 ? Math.max(...currentCourses.map(c => c.sortOrder)) + 1 : 1;
    const newCourse: MenuCourse = { id: tempId, sortOrder: nextOrder, label: `Gang ${nextOrder}`, comment: '' };
    updateActivePlanCourses(courses => [...courses, newCourse]);

    api.post<MenuCourse>(`/api/plans/${state.activePlanId}/courses`, {})
      .then(serverCourse => {
        updateActivePlanCourses(courses => courses.map(c => c.id === tempId ? serverCourse : c));
      })
      .catch(err => {
        console.error('Add course failed:', err);
        updateActivePlanCourses(courses => courses.filter(c => c.id !== tempId));
      });
  }, [state.activePlanId, activePlan, updateActivePlanCourses]);

  const updateCourse = useCallback((courseId: number, updates: Partial<Pick<MenuCourse, 'label' | 'comment'>>) => {
    if (!state.activePlanId) return;
    updateActivePlanCourses(courses => courses.map(c => c.id === courseId ? { ...c, ...updates } : c));
    api.put(`/api/plans/${state.activePlanId}/courses/${courseId}`, updates).catch(err => {
      console.error('Update course failed:', err);
    });
  }, [state.activePlanId, updateActivePlanCourses]);

  const removeCourse = useCallback((courseId: number) => {
    if (!state.activePlanId) return;
    updateActivePlanCourses(courses => courses.filter(c => c.id !== courseId));
    // Also remove entries and extras for this course
    const courseDate = `course_${courseId}`;
    updateActivePlanEntries(entries => entries.filter(e => e.date !== courseDate));
    updateActivePlanExtras(extras => extras.filter(e => e.courseId !== courseId));
    api.delete(`/api/plans/${state.activePlanId}/courses/${courseId}`).catch(err => {
      console.error('Remove course failed:', err);
    });
  }, [state.activePlanId, updateActivePlanCourses, updateActivePlanEntries, updateActivePlanExtras]);

  const renameIngredientInAllMeals = useCallback((oldName: string, newName: string) => {
    if (!oldName.trim() || !newName.trim() || oldName === newName) return;

    // Optimistic
    setState(prev => ({
      ...prev,
      meals: prev.meals.map(meal => ({
        ...meal,
        ingredients: meal.ingredients.map(ing =>
          ing.name === oldName ? { ...ing, name: newName } : ing
        ),
        shoppingIngredients: meal.shoppingIngredients?.map(ing =>
          ing.name === oldName ? { ...ing, name: newName } : ing
        ),
      })),
    }));

    api.put<Meal[]>('/api/meals/rename-ingredient', { oldName, newName })
      .then(updatedMeals => {
        setState(prev => ({ ...prev, meals: updatedMeals }));
      })
      .catch(err => {
        console.error('Rename failed:', err);
      });
  }, []);

  // Build a compatibility layer: the old state shape for components that read state.entries etc.
  const compatState: MealPlanState = {
    plans: state.plans,
    activePlanId: state.activePlanId,
    meals: state.meals,
  };

  return (
    <MealPlanContext.Provider
      value={{
        state: compatState,
        activePlan,
        allMealsForActivePlan,
        quickMeals,
        saveQuickMeal,
        setMealQuick,
        drinks,
        coffeeHabit,
        setCoffeeHabit,
        setCoffeeCount,
        loadPlanDetails,
        isLoading,
        error,
        defaultServings,
        setDefaultServings,
        nutritionTargets,
        setNutritionTargets,
        mealsPerDay,
        setMealsPerDay,
        nutritionProfile,
        setNutritionProfile,
        useOptimalPortions,
        setUseOptimalPortions,
        nutritionLogEnabled,
        setNutritionLogEnabled,
        defaultRecipeSort,
        setDefaultRecipeSort,
        pantryStaples,
        setPantryStaples,
        freshIngredients,
        setFreshIngredients,
        healthEnabled,
        setHealthEnabled,
        healthActiveFactor,
        setHealthActiveFactor,
        healthTokenSet,
        createHealthToken,
        revokeHealthToken,
        activityDays,
        activityLastReceivedAt,
        clearActivity,
        activity,
        flexibleSportEnabled,
        setFlexibleSportEnabled,
        trainings,
        addTraining,
        deleteTraining,
        sport,
        targetsForDate,
        todayTargets,
        today,
        createPlan,
        selectPlan,
        deletePlan,
        renamePlan,
        updatePlanServings,
        archivePlan,
        resetMealPlan,
        joinSharedPlan,
        leavePlan,
        refreshPlans,
        addMeal,
        importMeals,
        importSharedMeal,
        duplicateMeal,
        updateMeal,
        deleteMeal,
        toggleMealStar,
        uploadMealPhoto,
        deleteMealPhoto,
        downloadMealPhotoFromUrl,
        addMealToSlot,
        removeEntry,
        toggleEntryEnabled,
        updateEntryServings,
        moveEntry,
        toggleSlotDisabled,
        setSlotNote,
        setDayPersons,
        toggleIngredientExcluded,
        renameIngredientInAllMeals,
        addExtra,
        updateExtra,
        removeExtra,
        addCourse,
        updateCourse,
        removeCourse,
      }}
    >
      {children}
    </MealPlanContext.Provider>
  );
};

export const useMealPlan = () => {
  const context = useContext(MealPlanContext);
  if (!context) {
    throw new Error('useMealPlan must be used within MealPlanProvider');
  }
  return context;
};
