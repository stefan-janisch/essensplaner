import { DndContext, DragOverlay } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useState } from 'react';
import { MealPlanProvider, useMealPlan } from './context/MealPlanContext';
import { DateRangeSelector } from './components/DateRangeSelector';
import { MealPlanTable } from './components/MealPlanTable';
import { MealHistory } from './components/MealHistory';
import { AddMealForm } from './components/AddMealForm';
import { ShoppingList } from './components/ShoppingList';
import type { Meal } from './types/index.js';
import './App.css';

function MealPlannerContent() {
  const { assignMealToSlot } = useMealPlan();
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

    const mealId = active.id as string;
    const dropData = over.data.current as { date: string; mealType: string } | undefined;

    if (dropData) {
      assignMealToSlot(dropData.date, dropData.mealType as any, mealId);
    }
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ padding: '20px', width: '80%', margin: '0 auto' }}>
        <DateRangeSelector />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '20px', minWidth: '0' }}>
          <div>
            <MealPlanTable />
            <AddMealForm />
            <ShoppingList />
          </div>

          <div>
            <MealHistory />
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeMeal ? (
          <div
            style={{
              padding: '10px',
              backgroundColor: 'white',
              border: '2px solid #2196F3',
              borderRadius: '6px',
              boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
              cursor: 'grabbing',
            }}
          >
            <div style={{ fontWeight: 'bold' }}>{activeMeal.name}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function App() {
  return (
    <MealPlanProvider>
      <MealPlannerContent />
    </MealPlanProvider>
  );
}

export default App;
