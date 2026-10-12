import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useMealPlan } from '../context/MealPlanContext';
import type { Meal, MealPlanEntry } from '../types/index.js';

export interface UseMealCellItemActionsProps {
  entry: MealPlanEntry;
  meal: Meal;
}

export function useMealCellItemActions({ entry, meal }: UseMealCellItemActionsProps) {
  const { removeEntry, toggleEntryEnabled, updateEntryServings, toggleMealStar, updateMeal } = useMealPlan();
  const [isEditing, setIsEditing] = useState(false);
  const [editServings, setEditServings] = useState(entry.servings);
  const [showRecipeCard, setShowRecipeCard] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `entry:${entry.id}`,
    data: { entryId: entry.id, meal, sourceDate: entry.date, sourceMealType: entry.mealType },
    disabled: !entry.enabled,
  });

  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeEntry(entry.id);
  };

  const handleToggleEnabled = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleEntryEnabled(entry.id);
  };

  const handleEditServings = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditServings(entry.servings);
    setIsEditing(true);
  };

  const handleSaveServings = () => {
    updateEntryServings(entry.id, editServings);
    setIsEditing(false);
  };

  return {
    attributes,
    listeners,
    setNodeRef,
    dragStyle,
    isDragging,
    isEditing,
    setIsEditing,
    editServings,
    setEditServings,
    showRecipeCard,
    setShowRecipeCard,
    showEdit,
    setShowEdit,
    handleRemove,
    handleToggleEnabled,
    handleEditServings,
    handleSaveServings,
    toggleMealStar,
    updateMeal,
  };
}
