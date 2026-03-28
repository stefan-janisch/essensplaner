import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { format, eachDayOfInterval } from 'date-fns';
import { api } from '../api/client.js';
import type { Meal, MealPlan, MealPlanEntry, MealPlanState, MealType } from '../types/index.js';

interface MealPlanContextType {
  state: MealPlanState;
  activePlan: MealPlan | null;
  isLoading: boolean;
  error: string | null;
  defaultServings: number;
  setDefaultServings: (servings: number) => void;

  // Plan management
  createPlan: (name: string, startDate: Date, endDate: Date) => Promise<void>;
  selectPlan: (planId: number) => void;
  deletePlan: (planId: number) => Promise<void>;
  renamePlan: (planId: number, name: string) => Promise<void>;
  resetMealPlan: () => Promise<void>;

  // Meal CRUD
  addMeal: (meal: Omit<Meal, 'id'>) => Promise<void>;
  updateMeal: (mealId: string, updatedMeal: Omit<Meal, 'id'>) => Promise<void>;
  deleteMeal: (mealId: string) => Promise<void>;
  toggleMealStar: (mealId: string) => void;

  // Slot operations (on active plan)
  assignMealToSlot: (date: string, mealType: MealType, mealId: string) => void;
  removeMealFromSlot: (date: string, mealType: MealType) => void;
  toggleSlotEnabled: (date: string, mealType: MealType) => void;
  updateMealServings: (date: string, mealType: MealType, servings: number) => void;
  moveMealBetweenSlots: (fromDate: string, fromMealType: MealType, toDate: string, toMealType: MealType) => void;
  renameIngredientInAllMeals: (oldName: string, newName: string) => void;
}

const MealPlanContext = createContext<MealPlanContextType | undefined>(undefined);

export const MealPlanProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<MealPlanState>({
    plans: [],
    activePlanId: null,
    meals: [],
  });
  const [defaultServings, setDefaultServingsLocal] = useState(2);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    const load = async () => {
      try {
        const [meals, plans, settings] = await Promise.all([
          api.get<Meal[]>('/api/meals'),
          api.get<MealPlan[]>('/api/plans'),
          api.get<{ defaultServings: number }>('/api/settings'),
        ]);
        setDefaultServingsLocal(settings.defaultServings);
        setState({
          meals,
          plans,
          activePlanId: plans.length > 0 ? plans[0].id : null,
        });

        // If there's an active plan, load its entries
        if (plans.length > 0) {
          const planWithEntries = await api.get<MealPlan>(`/api/plans/${plans[0].id}`);
          setState(prev => ({
            ...prev,
            plans: prev.plans.map(p => p.id === plans[0].id ? planWithEntries : p),
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

  const setDefaultServings = useCallback(async (servings: number) => {
    setDefaultServingsLocal(servings);
    try {
      await api.put('/api/settings', { defaultServings: servings });
    } catch {
      // Revert on failure — but this is a minor setting, so just log
      console.error('Failed to save default servings');
    }
  }, []);

  // --- Plan management ---

  const createPlan = useCallback(async (name: string, startDate: Date, endDate: Date) => {
    const plan = await api.post<MealPlan>('/api/plans', {
      name,
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
    });

    // Generate entries for all dates
    const dates = eachDayOfInterval({ start: startDate, end: endDate });
    const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner'];
    const entryData = dates.flatMap(date =>
      mealTypes.map(mealType => ({
        date: format(date, 'yyyy-MM-dd'),
        mealType,
        mealId: null,
        servings: defaultServings,
        enabled: true,
      }))
    );

    const entries = await api.put<MealPlanEntry[]>(`/api/plans/${plan.id}/entries`, { entries: entryData });

    const fullPlan: MealPlan = { ...plan, entries };
    setState(prev => ({
      ...prev,
      plans: [fullPlan, ...prev.plans],
      activePlanId: plan.id,
    }));
  }, [defaultServings]);

  const selectPlan = useCallback(async (planId: number) => {
    setState(prev => ({ ...prev, activePlanId: planId }));

    // Load entries if not already loaded
    const plan = state.plans.find(p => p.id === planId);
    if (plan && !plan.entries) {
      try {
        const planWithEntries = await api.get<MealPlan>(`/api/plans/${planId}`);
        setState(prev => ({
          ...prev,
          plans: prev.plans.map(p => p.id === planId ? planWithEntries : p),
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Laden des Plans');
      }
    }
  }, [state.plans]);

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

  const resetMealPlan = useCallback(async () => {
    if (!state.activePlanId) return;
    await api.delete(`/api/plans/${state.activePlanId}`);
    setState(prev => ({
      ...prev,
      plans: prev.plans.filter(p => p.id !== prev.activePlanId),
      activePlanId: null,
    }));
  }, [state.activePlanId]);

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

  // --- Meal CRUD ---

  const addMeal = useCallback(async (meal: Omit<Meal, 'id'>) => {
    const newMeal = await api.post<Meal>('/api/meals', meal);
    setState(prev => ({
      ...prev,
      meals: [...prev.meals, newMeal],
    }));
  }, []);

  const updateMeal = useCallback(async (mealId: string, updatedMeal: Omit<Meal, 'id'>) => {
    const prev = state.meals;
    // Optimistic update
    setState(s => ({
      ...s,
      meals: s.meals.map(m => m.id === mealId ? { ...updatedMeal, id: mealId } : m),
    }));
    try {
      await api.put<Meal>(`/api/meals/${mealId}`, updatedMeal);
    } catch {
      setState(s => ({ ...s, meals: prev }));
    }
  }, [state.meals]);

  const deleteMeal = useCallback(async (mealId: string) => {
    await api.delete(`/api/meals/${mealId}`);
    setState(prev => ({
      ...prev,
      meals: prev.meals.filter(m => m.id !== mealId),
      plans: prev.plans.map(p => ({
        ...p,
        entries: (p.entries || []).map(e => e.mealId === mealId ? { ...e, mealId: null } : e),
      })),
    }));
  }, []);

  const toggleMealStar = useCallback((mealId: string) => {
    setState(prev => ({
      ...prev,
      meals: prev.meals.map(m =>
        m.id === mealId ? { ...m, starred: !m.starred } : m
      ),
    }));
    api.patch(`/api/meals/${mealId}/star`).catch(() => {
      // Revert
      setState(prev => ({
        ...prev,
        meals: prev.meals.map(m =>
          m.id === mealId ? { ...m, starred: !m.starred } : m
        ),
      }));
    });
  }, []);

  // --- Slot operations ---

  const slotUpdate = useCallback((date: string, mealType: MealType, updates: Partial<MealPlanEntry>) => {
    if (!state.activePlanId) return;
    updateActivePlanEntries(entries =>
      entries.map(e =>
        e.date === date && e.mealType === mealType ? { ...e, ...updates } : e
      )
    );
    api.put(`/api/plans/${state.activePlanId}/slot`, { date, mealType, ...updates }).catch(err => {
      console.error('Slot update failed:', err);
    });
  }, [state.activePlanId, updateActivePlanEntries]);

  const assignMealToSlot = useCallback((date: string, mealType: MealType, mealId: string) => {
    slotUpdate(date, mealType, { mealId, servings: defaultServings });
  }, [slotUpdate, defaultServings]);

  const removeMealFromSlot = useCallback((date: string, mealType: MealType) => {
    slotUpdate(date, mealType, { mealId: null });
  }, [slotUpdate]);

  const toggleSlotEnabled = useCallback((date: string, mealType: MealType) => {
    const entry = activePlan?.entries?.find(e => e.date === date && e.mealType === mealType);
    if (!entry) return;
    const newEnabled = !entry.enabled;
    slotUpdate(date, mealType, { enabled: newEnabled, ...(newEnabled ? {} : { mealId: null }) });
  }, [activePlan, slotUpdate]);

  const updateMealServings = useCallback((date: string, mealType: MealType, servings: number) => {
    slotUpdate(date, mealType, { servings });
  }, [slotUpdate]);

  const moveMealBetweenSlots = useCallback((fromDate: string, fromMealType: MealType, toDate: string, toMealType: MealType) => {
    if (!state.activePlanId || !activePlan?.entries) return;

    const fromEntry = activePlan.entries.find(e => e.date === fromDate && e.mealType === fromMealType);
    const toEntry = activePlan.entries.find(e => e.date === toDate && e.mealType === toMealType);
    if (!fromEntry || !toEntry || !fromEntry.mealId) return;

    // Optimistic swap
    updateActivePlanEntries(entries =>
      entries.map(entry => {
        if (entry.date === fromDate && entry.mealType === fromMealType) {
          return { ...entry, mealId: toEntry.mealId, servings: toEntry.mealId ? toEntry.servings : defaultServings };
        }
        if (entry.date === toDate && entry.mealType === toMealType) {
          return { ...entry, mealId: fromEntry.mealId, servings: fromEntry.servings };
        }
        return entry;
      })
    );

    api.post(`/api/plans/${state.activePlanId}/swap`, {
      fromDate, fromMealType, toDate, toMealType,
    }).catch(err => {
      console.error('Swap failed:', err);
    });
  }, [state.activePlanId, activePlan, defaultServings, updateActivePlanEntries]);

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
        isLoading,
        error,
        defaultServings,
        setDefaultServings,
        createPlan,
        selectPlan,
        deletePlan,
        renamePlan,
        resetMealPlan,
        addMeal,
        updateMeal,
        deleteMeal,
        toggleMealStar,
        assignMealToSlot,
        removeMealFromSlot,
        toggleSlotEnabled,
        updateMealServings,
        renameIngredientInAllMeals,
        moveMealBetweenSlots,
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
