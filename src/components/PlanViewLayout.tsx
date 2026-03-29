import { DndContext, DragOverlay } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useState, type ReactNode } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import { DateRangeSelector } from './DateRangeSelector';
import { MealHistory } from './MealHistory';
import { ShoppingList } from './ShoppingList';
import type { Meal, MealType } from '../types/index.js';

interface PlanViewLayoutProps {
  onBack: () => void;
  children: ReactNode;
}

export function PlanViewLayout({ onBack, children }: PlanViewLayoutProps) {
  const { addMealToSlot, moveEntry } = useMealPlan();
  const [activeMeal, setActiveMeal] = useState<Meal | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const meal = event.active.data.current?.meal;
    if (meal) {
      setActiveMeal(meal);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveMeal(null);

    const { active, over } = event;

    if (!over) return;

    const dropData = over.data.current as { date: string; mealType: string } | undefined;
    if (!dropData) return;

    const sourceData = active.data.current as { entryId?: number; sourceDate?: string; sourceMealType?: string } | undefined;

    if (sourceData?.entryId) {
      if (sourceData.sourceDate === dropData.date && sourceData.sourceMealType === dropData.mealType) return;
      moveEntry(sourceData.entryId, dropData.date, dropData.mealType as MealType);
    } else {
      const mealId = active.id as string;
      addMealToSlot(dropData.date, dropData.mealType as MealType, mealId);
    }
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ padding: '24px 32px', width: '85%', margin: '0 auto' }}>
        <DateRangeSelector onBack={onBack} />

        <div className="meal-plan-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '24px', minWidth: '0' }}>
          <div>
            {children}
            <ShoppingList />
          </div>

          <div style={{ position: 'sticky', top: '16px', maxHeight: 'calc(100vh - 200px)', overflow: 'hidden' }}>
            <MealHistory />
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeMeal ? (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'var(--surface-0)',
              border: '2px solid var(--accent)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              cursor: 'grabbing',
            }}
          >
            <div style={{ fontWeight: 'bold', color: 'var(--text-h)' }}>{activeMeal.name}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
