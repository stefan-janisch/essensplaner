import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { format, eachDayOfInterval } from 'date-fns';
import type { Meal, MealPlanEntry, MealPlanState, MealType } from '../types/index.js';

interface MealPlanContextType {
  state: MealPlanState;
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
}

const MealPlanContext = createContext<MealPlanContextType | undefined>(undefined);

const STORAGE_KEY_PLAN = 'essensplaner_plan';
const STORAGE_KEY_MEALS = 'essensplaner_meals';

export const MealPlanProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
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
        servings: 2,
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
          ? { ...entry, mealId }
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
