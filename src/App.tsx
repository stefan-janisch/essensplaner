import { DndContext, DragOverlay } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MealPlanProvider, useMealPlan } from './context/MealPlanContext';
import { AuthForm } from './components/AuthForm';
import { MigrationPrompt } from './components/MigrationPrompt';
import { DateRangeSelector } from './components/DateRangeSelector';
import { MealPlanTable } from './components/MealPlanTable';
import { MealHistory } from './components/MealHistory';
import { AddMealForm } from './components/AddMealForm';
import { ShoppingList } from './components/ShoppingList';
import type { Meal, MealType } from './types/index.js';
import './App.css';

function MealPlannerContent() {
  const { assignMealToSlot, moveMealBetweenSlots } = useMealPlan();
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

    const sourceData = active.data.current as { sourceDate?: string; sourceMealType?: string } | undefined;

    if (sourceData?.sourceDate && sourceData?.sourceMealType) {
      // Cell-to-cell move (swap)
      if (sourceData.sourceDate === dropData.date && sourceData.sourceMealType === dropData.mealType) return;
      moveMealBetweenSlots(sourceData.sourceDate, sourceData.sourceMealType as MealType, dropData.date, dropData.mealType as MealType);
    } else {
      // Drag from history sidebar
      const mealId = active.id as string;
      assignMealToSlot(dropData.date, dropData.mealType as MealType, mealId);
    }
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ padding: '24px 32px', width: '85%', margin: '0 auto' }}>
        <DateRangeSelector />

        <div className="meal-plan-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '24px', minWidth: '0' }}>
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

function AppHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="app-header">
      <h1 className="app-header-title">Essensplaner</h1>
      <div className="app-header-user">
        <span>{user?.email}</span>
        <button className="btn btn-ghost btn-sm" onClick={logout}>Abmelden</button>
      </div>
    </header>
  );
}

function AuthenticatedApp() {
  const { hasPendingMigration } = useAuth();

  if (hasPendingMigration) {
    return <MigrationPrompt />;
  }

  return (
    <MealPlanProvider>
      <AppHeader />
      <MealPlannerContent />
    </MealPlanProvider>
  );
}

function AppGate() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Laden...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthForm />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  );
}

export default App;
