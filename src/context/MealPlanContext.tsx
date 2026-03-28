import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { format } from 'date-fns';
import { api } from '../api/client.js';
import type { Meal, MealPlan, MealPlanEntry, MealPlanState, MealType } from '../types/index.js';

interface MealPlanContextType {
  state: MealPlanState;
  activePlan: MealPlan | null;
  allMealsForActivePlan: Meal[];
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
  joinSharedPlan: (token: string) => Promise<number>;
  leavePlan: (planId: number) => Promise<void>;
  refreshPlans: () => Promise<void>;

  // Meal CRUD
  addMeal: (meal: Omit<Meal, 'id'>) => Promise<Meal | null>;
  updateMeal: (mealId: string, updatedMeal: Omit<Meal, 'id'>) => Promise<void>;
  deleteMeal: (mealId: string) => Promise<void>;
  toggleMealStar: (mealId: string) => void;

  // Import/Export
  importMeals: (recipes: Omit<Meal, 'id'>[]) => Promise<{ imported: Meal[]; skipped: string[] }>;

  // Photo management
  uploadMealPhoto: (mealId: string, file: File) => Promise<string>;
  deleteMealPhoto: (mealId: string) => Promise<void>;
  downloadMealPhotoFromUrl: (mealId: string, url: string) => Promise<void>;

  // Entry operations (multi-meal slots)
  addMealToSlot: (date: string, mealType: MealType, mealId: string) => void;
  removeEntry: (entryId: number) => void;
  toggleEntryEnabled: (entryId: number) => void;
  updateEntryServings: (entryId: number, servings: number) => void;
  moveEntry: (entryId: number, toDate: string, toMealType: MealType) => void;
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

        // Check URL hash for a specific plan ID
        const hashMatch = window.location.hash.match(/^#planer\/(\d+)/);
        const hashPlanId = hashMatch ? parseInt(hashMatch[1]) : null;
        const initialPlanId = (hashPlanId && plans.some(p => p.id === hashPlanId))
          ? hashPlanId
          : (plans.length > 0 ? plans[0].id : null);

        setState({
          meals,
          plans,
          activePlanId: initialPlanId,
        });

        // Load entries for the active plan
        if (initialPlanId) {
          const planWithEntries = await api.get<MealPlan>(`/api/plans/${initialPlanId}`);
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
    const shared = activePlan?.sharedMeals || [];
    if (shared.length === 0) return state.meals;
    const ownIds = new Set(state.meals.map(m => m.id));
    return [...state.meals, ...shared.filter(m => !ownIds.has(m.id))];
  }, [state.meals, activePlan?.sharedMeals]);

  const setDefaultServings = useCallback(async (servings: number) => {
    setDefaultServingsLocal(servings);
    try {
      await api.put('/api/settings', { defaultServings: servings });
    } catch {
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

    const fullPlan: MealPlan = { ...plan, entries: [] };
    setState(prev => ({
      ...prev,
      plans: [fullPlan, ...prev.plans],
      activePlanId: plan.id,
    }));
  }, []);

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

  const joinSharedPlan = useCallback(async (token: string): Promise<number> => {
    const result = await api.post<{ planId: number; planName: string }>(`/api/share/${token}/join`);
    const plans = await api.get<MealPlan[]>('/api/plans');
    const planWithEntries = await api.get<MealPlan>(`/api/plans/${result.planId}`);
    setState(prev => ({
      ...prev,
      plans: plans.map(p => p.id === result.planId ? planWithEntries : p),
      activePlanId: result.planId,
    }));
    return result.planId;
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

  const addMeal = useCallback(async (meal: Omit<Meal, 'id'>): Promise<Meal | null> => {
    try {
      const newMeal = await api.post<Meal>('/api/meals', meal);
      setState(prev => ({
        ...prev,
        meals: [...prev.meals, newMeal],
      }));
      return newMeal;
    } catch (err) {
      console.error('Add meal failed:', err);
      return null;
    }
  }, []);

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
      // DB cascades deletes, so remove entries referencing this meal
      plans: prev.plans.map(p => ({
        ...p,
        entries: (p.entries || []).filter(e => e.mealId !== mealId),
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

  // --- Entry operations (multi-meal slots) ---

  const addMealToSlot = useCallback((date: string, mealType: MealType, mealId: string) => {
    if (!state.activePlanId) return;

    // Optimistic: create temporary entry with negative id
    const tempId = -Date.now();
    const newEntry: MealPlanEntry = {
      id: tempId,
      date,
      mealType,
      mealId,
      servings: defaultServings,
      enabled: true,
    };
    updateActivePlanEntries(entries => [...entries, newEntry]);

    api.post<MealPlanEntry>(`/api/plans/${state.activePlanId}/entries`, {
      date, mealType, mealId, servings: defaultServings,
    }).then(serverEntry => {
      // Replace temp entry with server entry (which has real id)
      updateActivePlanEntries(entries =>
        entries.map(e => e.id === tempId ? serverEntry : e)
      );
    }).catch(err => {
      console.error('Add meal to slot failed:', err);
      updateActivePlanEntries(entries => entries.filter(e => e.id !== tempId));
    });
  }, [state.activePlanId, defaultServings, updateActivePlanEntries]);

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
        allMealsForActivePlan,
        isLoading,
        error,
        defaultServings,
        setDefaultServings,
        createPlan,
        selectPlan,
        deletePlan,
        renamePlan,
        resetMealPlan,
        joinSharedPlan,
        leavePlan,
        refreshPlans,
        addMeal,
        importMeals,
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
        renameIngredientInAllMeals,
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
