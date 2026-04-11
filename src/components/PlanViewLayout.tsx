import { DndContext, DragOverlay } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useState, useMemo, type ReactNode } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { DateRangeSelector } from './DateRangeSelector';
import { MealHistory } from './MealHistory';
import { ShoppingList } from './ShoppingList';
import { MobileDayView } from './MobileDayView';
import { MobileBottomTabs, type MobileTab } from './MobileBottomTabs';
import { calculateNutritionGap } from '../utils/dailyNutrition';
import { getDayTargets } from '../utils/nutritionCalculator';
import { DEFAULT_NUTRITION_TARGETS } from '../types/index.js';
import type { Meal, MealType, NutritionInfo } from '../types/index.js';
import React from 'react';

// Context to pass tap-to-add handler down to MenuPlanTable cells
export const MenuAddContext = React.createContext<((date: string, mealType: MealType) => void) | null>(null);

interface PlanViewLayoutProps {
  onBack: () => void;
  children: ReactNode;
  planType?: 'weekly' | 'menu';
}

export function PlanViewLayout({ onBack, children, planType = 'weekly' }: PlanViewLayoutProps) {
  const { addMealToSlot, moveEntry, activePlan, allMealsForActivePlan, nutritionTargets, defaultServings, nutritionProfile } = useMealPlan();
  const isMobile = useIsMobile();
  const [activeMeal, setActiveMeal] = useState<Meal | null>(null);
  const [activeTab, setActiveTab] = useState<MobileTab>('plan');
  const [addTarget, setAddTarget] = useState<{ date: string; mealType: MealType } | null>(null);

  // Compute nutrition gap for the target date
  const nutritionGap = useMemo<NutritionInfo | null>(() => {
    if (!addTarget || !activePlan) return null;
    const dayTargets = nutritionProfile
      ? getDayTargets(nutritionProfile, addTarget.date)
      : (nutritionTargets ?? DEFAULT_NUTRITION_TARGETS);
    const planServings = activePlan.defaultServings ?? defaultServings;
    return calculateNutritionGap(addTarget.date, activePlan.entries || [], allMealsForActivePlan, dayTargets, planServings);
  }, [addTarget, activePlan, allMealsForActivePlan, nutritionTargets, defaultServings, nutritionProfile]);

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

  const handleAddRequest = (date: string, mealType: MealType) => {
    setAddTarget({ date, mealType });
  };

  const handleTapSelect = (mealId: string) => {
    if (addTarget) {
      addMealToSlot(addTarget.date, addTarget.mealType, mealId);
      setAddTarget(null);
    }
  };

  const handleCancelAdd = () => {
    setAddTarget(null);
  };

  if (isMobile) {
    // Menüpläne: children direkt rendern + tap-to-add für Rezepte
    if (planType === 'menu') {
      return (
        <div className="plan-view-mobile">
          <DateRangeSelector onBack={onBack} />
          <div style={{ padding: '0 12px 80px' }}>
            {activeTab === 'plan' && (
              <MenuAddContext.Provider value={handleAddRequest}>
                {children}
              </MenuAddContext.Provider>
            )}
            {activeTab === 'shopping' && <ShoppingList />}
          </div>

          {addTarget && (
            <div className="mobile-recipe-overlay">
              <MealHistory
                tapMode={addTarget}
                onTapSelect={handleTapSelect}
                onCancelTap={handleCancelAdd}
              />
            </div>
          )}

          <MobileBottomTabs activeTab={activeTab} onChange={setActiveTab} />
        </div>
      );
    }

    return (
      <div className="plan-view-mobile">
        <DateRangeSelector onBack={onBack} />

        {activeTab === 'plan' && (
          <MobileDayView onAddRequest={handleAddRequest} />
        )}
        {activeTab === 'shopping' && (
          <ShoppingList />
        )}

        {/* Rezeptauswahl als Fullscreen-Overlay wenn "+" getippt */}
        {addTarget && (
          <div className="mobile-recipe-overlay">
            <MealHistory
              tapMode={addTarget}
              onTapSelect={handleTapSelect}
              onCancelTap={handleCancelAdd}
              nutritionGap={nutritionGap}
            />
          </div>
        )}

        <MobileBottomTabs activeTab={activeTab} onChange={setActiveTab} />
      </div>
    );
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ padding: '24px 32px', width: '85%', margin: '0 auto' }}>
        <DateRangeSelector onBack={onBack} />

        <div className="meal-plan-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '24px', minWidth: '0' }}>
          <div>
            <MenuAddContext.Provider value={handleAddRequest}>
              {children}
            </MenuAddContext.Provider>
            <ShoppingList />
          </div>

          <div style={{ position: 'sticky', top: '16px', maxHeight: 'calc(100vh - 200px)', overflow: 'hidden' }}>
            <MealHistory
              tapMode={addTarget}
              onTapSelect={handleTapSelect}
              onCancelTap={handleCancelAdd}
              nutritionGap={nutritionGap}
            />
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
