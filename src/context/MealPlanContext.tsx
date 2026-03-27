import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { format, eachDayOfInterval } from 'date-fns';
import type { Meal, MealPlanEntry, MealPlanState, MealType } from '../types/index.js';

interface MealPlanContextType {
  state: MealPlanState;
  defaultServings: number;
  setDefaultServings: (servings: number) => void;
  initializeDateRange: (startDate: Date, endDate: Date) => void;
  resetMealPlan: () => void;
  addMeal: (meal: Omit<Meal, 'id'>) => void;
  updateMeal: (mealId: string, updatedMeal: Omit<Meal, 'id'>) => void;
  deleteMeal: (mealId: string) => void;
  toggleMealStar: (mealId: string) => void;
  assignMealToSlot: (date: string, mealType: MealType, mealId: string) => void;
  removeMealFromSlot: (date: string, mealType: MealType) => void;
  toggleSlotEnabled: (date: string, mealType: MealType) => void;
  updateMealServings: (date: string, mealType: MealType, servings: number) => void;
  renameIngredientInAllMeals: (oldName: string, newName: string) => void;
  moveMealBetweenSlots: (fromDate: string, fromMealType: MealType, toDate: string, toMealType: MealType) => void;
}

const MealPlanContext = createContext<MealPlanContextType | undefined>(undefined);

const STORAGE_KEY_PLAN = 'essensplaner_plan';
const STORAGE_KEY_MEALS = 'essensplaner_meals';
const STORAGE_KEY_DEFAULT_SERVINGS = 'essensplaner_default_servings';

export const MealPlanProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [defaultServings, setDefaultServingsState] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_DEFAULT_SERVINGS);
    return saved ? Number(saved) : 2;
  });

  const setDefaultServings = (servings: number) => {
    setDefaultServingsState(servings);
    localStorage.setItem(STORAGE_KEY_DEFAULT_SERVINGS, String(servings));
  };

  const [state, setState] = useState<MealPlanState>(() => {
    // Load from localStorage
    const savedPlan = localStorage.getItem(STORAGE_KEY_PLAN);
    const savedMeals = localStorage.getItem(STORAGE_KEY_MEALS);

    return {
      startDate: savedPlan ? JSON.parse(savedPlan).startDate : null,
      endDate: savedPlan ? JSON.parse(savedPlan).endDate : null,
      entries: savedPlan ? JSON.parse(savedPlan).entries : [],
      meals: savedMeals ? JSON.parse(savedMeals) : [],
    };
  });

  // Auto-save to localStorage
  useEffect(() => {
    const planData = {
      startDate: state.startDate,
      endDate: state.endDate,
      entries: state.entries,
    };
    localStorage.setItem(STORAGE_KEY_PLAN, JSON.stringify(planData));
    localStorage.setItem(STORAGE_KEY_MEALS, JSON.stringify(state.meals));
  }, [state]);

  const initializeDateRange = (startDate: Date, endDate: Date) => {
    const dates = eachDayOfInterval({ start: startDate, end: endDate });
    const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner'];

    const entries: MealPlanEntry[] = dates.flatMap(date =>
      mealTypes.map(mealType => ({
        date: format(date, 'yyyy-MM-dd'),
        mealType,
        mealId: null,
        servings: defaultServings,
        enabled: true,
      }))
    );

    setState(prev => ({
      ...prev,
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
      entries,
    }));
  };

  const resetMealPlan = () => {
    setState(prev => ({
      ...prev,
      startDate: null,
      endDate: null,
      entries: [],
    }));
  };

  const addMeal = (meal: Omit<Meal, 'id'>) => {
    const newMeal: Meal = {
      ...meal,
      id: `meal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    setState(prev => ({
      ...prev,
      meals: [...prev.meals, newMeal],
    }));
  };

  const updateMeal = (mealId: string, updatedMeal: Omit<Meal, 'id'>) => {
    setState(prev => ({
      ...prev,
      meals: prev.meals.map(m =>
        m.id === mealId ? { ...updatedMeal, id: mealId } : m
      ),
    }));
  };

  const deleteMeal = (mealId: string) => {
    setState(prev => ({
      ...prev,
      meals: prev.meals.filter(m => m.id !== mealId),
      entries: prev.entries.map(entry =>
        entry.mealId === mealId ? { ...entry, mealId: null } : entry
      ),
    }));
  };

  const toggleMealStar = (mealId: string) => {
    setState(prev => ({
      ...prev,
      meals: prev.meals.map(m =>
        m.id === mealId ? { ...m, starred: !m.starred } : m
      ),
    }));
  };

  const assignMealToSlot = (date: string, mealType: MealType, mealId: string) => {
    setState(prev => ({
      ...prev,
      entries: prev.entries.map(entry =>
        entry.date === date && entry.mealType === mealType
          ? { ...entry, mealId, servings: defaultServings }
          : entry
      ),
    }));
  };

  const removeMealFromSlot = (date: string, mealType: MealType) => {
    setState(prev => ({
      ...prev,
      entries: prev.entries.map(entry =>
        entry.date === date && entry.mealType === mealType
          ? { ...entry, mealId: null }
          : entry
      ),
    }));
  };

  const toggleSlotEnabled = (date: string, mealType: MealType) => {
    setState(prev => ({
      ...prev,
      entries: prev.entries.map(entry =>
        entry.date === date && entry.mealType === mealType
          ? { ...entry, enabled: !entry.enabled, mealId: entry.enabled ? null : entry.mealId }
          : entry
      ),
    }));
  };

  const updateMealServings = (date: string, mealType: MealType, servings: number) => {
    setState(prev => ({
      ...prev,
      entries: prev.entries.map(entry =>
        entry.date === date && entry.mealType === mealType
          ? { ...entry, servings }
          : entry
      ),
    }));
  };

  const moveMealBetweenSlots = (fromDate: string, fromMealType: MealType, toDate: string, toMealType: MealType) => {
    setState(prev => {
      const fromEntry = prev.entries.find(e => e.date === fromDate && e.mealType === fromMealType);
      const toEntry = prev.entries.find(e => e.date === toDate && e.mealType === toMealType);
      if (!fromEntry || !toEntry || !fromEntry.mealId) return prev;

      return {
        ...prev,
        entries: prev.entries.map(entry => {
          if (entry.date === fromDate && entry.mealType === fromMealType) {
            // Source gets target's meal (swap) or null
            return { ...entry, mealId: toEntry.mealId, servings: toEntry.mealId ? toEntry.servings : defaultServings };
          }
          if (entry.date === toDate && entry.mealType === toMealType) {
            // Target gets source's meal
            return { ...entry, mealId: fromEntry.mealId, servings: fromEntry.servings };
          }
          return entry;
        }),
      };
    });
  };

  const renameIngredientInAllMeals = (oldName: string, newName: string) => {
    if (!oldName.trim() || !newName.trim() || oldName === newName) return;

    setState(prev => ({
      ...prev,
      meals: prev.meals.map(meal => ({
        ...meal,
        ingredients: meal.ingredients.map(ing =>
          ing.name === oldName ? { ...ing, name: newName } : ing
        ),
      })),
    }));
  };

  return (
    <MealPlanContext.Provider
      value={{
        state,
        defaultServings,
        setDefaultServings,
        initializeDateRange,
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
