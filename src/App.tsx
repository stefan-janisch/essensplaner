import { DndContext, DragOverlay } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useState, useEffect, useRef, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MealPlanProvider, useMealPlan } from './context/MealPlanContext';
import { AuthForm } from './components/AuthForm';
import { MigrationPrompt } from './components/MigrationPrompt';
import { DateRangeSelector } from './components/DateRangeSelector';
import { MealPlanTable } from './components/MealPlanTable';
import { MenuPlanTable } from './components/MenuPlanTable';
import { MealHistory } from './components/MealHistory';
import { ShoppingList } from './components/ShoppingList';
import { MealPlanOverview } from './components/MealPlanOverview';
import { RecipeManagement } from './components/RecipeManagement';
import type { Meal, MealType, PlanType } from './types/index.js';
import './App.css';

type AppView = 'overview' | 'planner' | 'recipes' | 'menuplan';

function MealPlannerContent({ onBack }: { onBack: () => void }) {
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
      // Entry drag from cell → move to target slot
      if (sourceData.sourceDate === dropData.date && sourceData.sourceMealType === dropData.mealType) return;
      moveEntry(sourceData.entryId, dropData.date, dropData.mealType as MealType);
    } else {
      // Drag from history sidebar → add to slot
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
            <MealPlanTable />
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

function MenuPlanContent({ onBack }: { onBack: () => void }) {
  const { addMealToSlot, moveEntry } = useMealPlan();
  const [activeMeal, setActiveMeal] = useState<Meal | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const meal = event.active.data.current?.meal;
    if (meal) setActiveMeal(meal);
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
            <MenuPlanTable />
            <ShoppingList />
          </div>
          <div style={{ position: 'sticky', top: '16px', maxHeight: 'calc(100vh - 200px)', overflow: 'hidden' }}>
            <MealHistory />
          </div>
        </div>
      </div>
      <DragOverlay>
        {activeMeal ? (
          <div style={{ padding: '12px 16px', backgroundColor: 'var(--surface-0)', border: '2px solid var(--accent)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', cursor: 'grabbing' }}>
            <div style={{ fontWeight: 'bold', color: 'var(--text-h)' }}>{activeMeal.name}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function AppHeader({ currentView, onNavigate }: { currentView: AppView; onNavigate: (view: AppView) => void }) {
  const { user, logout } = useAuth();

  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <h1
          className="app-header-title"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate('overview')}
        >
          Essensplaner
        </h1>
        <button
          className={`btn btn-ghost btn-sm ${currentView === 'overview' || currentView === 'planner' || currentView === 'menuplan' ? 'btn-nav-active' : ''}`}
          onClick={() => onNavigate('overview')}
        >
          Pläne
        </button>
        <button
          className={`btn btn-ghost btn-sm ${currentView === 'recipes' ? 'btn-nav-active' : ''}`}
          onClick={() => onNavigate('recipes')}
        >
          Rezepte
        </button>
      </div>
      <div className="app-header-user">
        <span>{user?.email}</span>
        <button className="btn btn-ghost btn-sm" onClick={logout}>Abmelden</button>
      </div>
    </header>
  );
}

function getInitialShareStatus(): 'idle' | 'joining' {
  const params = new URLSearchParams(window.location.search);
  return (params.get('share') || params.get('joined')) ? 'joining' : 'idle';
}

function useShareJoin(onJoined: () => void) {
  const { joinSharedPlan, selectPlan, isLoading } = useMealPlan();
  const [status, setStatus] = useState<'idle' | 'joining' | 'error'>(getInitialShareStatus);
  const [errorMsg, setErrorMsg] = useState('');
  const handled = useRef(false);
  const pendingJoinedId = useRef<number | null>(null);

  // Read query params once on first render
  const paramsRef = useRef(() => {
    const params = new URLSearchParams(window.location.search);
    const shareToken = params.get('share');
    const joinedPlanId = params.get('joined');

    if (shareToken || joinedPlanId) {
      const url = new URL(window.location.href);
      url.searchParams.delete('share');
      url.searchParams.delete('joined');
      url.searchParams.delete('shareError');
      window.history.replaceState({}, '', url.pathname);
    }

    return { shareToken, joinedPlanId };
  });

  // Handle ?share= token (API join)
  useEffect(() => {
    if (handled.current) return;
    const { shareToken } = paramsRef.current();
    if (!shareToken) return;

    handled.current = true;
    joinSharedPlan(shareToken)
      .then(() => { onJoined(); })
      .catch(err => { setStatus('error'); setErrorMsg(err instanceof Error ? err.message : 'Beitritt fehlgeschlagen'); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle ?joined= (server already joined, wait for initial load then select plan)
  useEffect(() => {
    if (handled.current) return;
    const { joinedPlanId } = paramsRef.current();
    if (!joinedPlanId) return;

    if (pendingJoinedId.current === null) {
      pendingJoinedId.current = Number(joinedPlanId);
    }

    if (!isLoading && pendingJoinedId.current !== null) {
      handled.current = true;
      selectPlan(pendingJoinedId.current);
      onJoined();
    }
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  return { status, errorMsg };
}

function parseHash(hash: string): { view: AppView; planId?: number } {
  if (hash === '#rezepte') return { view: 'recipes' };
  if (hash.startsWith('#menuplan')) {
    const id = parseInt(hash.split('/')[1]);
    return { view: 'menuplan', planId: id || undefined };
  }
  if (hash.startsWith('#planer')) {
    const id = parseInt(hash.split('/')[1]);
    return { view: 'planner', planId: id || undefined };
  }
  return { view: 'overview' };
}

function AuthenticatedAppInner() {
  const { selectPlan } = useMealPlan();
  const [view, setViewState] = useState<AppView>(() => parseHash(window.location.hash).view);

  const setView = useCallback((v: AppView, planId?: number) => {
    setViewState(v);
    if (v === 'recipes') window.location.hash = '#rezepte';
    else if (v === 'menuplan' && planId) window.location.hash = `#menuplan/${planId}`;
    else if (v === 'menuplan') window.location.hash = '#menuplan';
    else if (v === 'planner' && planId) window.location.hash = `#planer/${planId}`;
    else if (v === 'planner') window.location.hash = '#planer';
    else window.location.hash = '#plaene';
  }, []);

  const openPlan = useCallback((planId: number, planType?: PlanType) => {
    selectPlan(planId);
    setView(planType === 'menu' ? 'menuplan' : 'planner', planId);
  }, [selectPlan, setView]);

  // Listen for browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const { view, planId } = parseHash(window.location.hash);
      setViewState(view);
      if (planId) selectPlan(planId);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [selectPlan]);

  const { status, errorMsg } = useShareJoin(() => setView('planner'));

  if (status === 'joining') {
    return (
      <>
        <AppHeader currentView={view} onNavigate={setView} />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
          <div>Plan wird beigetreten...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader currentView={view} onNavigate={setView} />
      {status === 'error' && (
        <div style={{ padding: '24px 32px', textAlign: 'center' }}>
          <div className="auth-error" style={{ display: 'inline-block' }}>{errorMsg}</div>
        </div>
      )}
      {view === 'overview' ? (
        <MealPlanOverview onOpenPlan={openPlan} />
      ) : view === 'recipes' ? (
        <RecipeManagement />
      ) : view === 'menuplan' ? (
        <MenuPlanContent onBack={() => setView('overview')} />
      ) : (
        <MealPlannerContent onBack={() => setView('overview')} />
      )}
    </>
  );
}

function AuthenticatedApp() {
  const { hasPendingMigration } = useAuth();

  if (hasPendingMigration) {
    return <MigrationPrompt />;
  }

  return (
    <MealPlanProvider>
      <AuthenticatedAppInner />
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
