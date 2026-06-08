import { useState, useEffect, useRef, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MealPlanProvider, useMealPlan } from './context/MealPlanContext';
import { AuthForm } from './components/AuthForm';
import { MigrationPrompt } from './components/MigrationPrompt';
import { MealPlanTable } from './components/MealPlanTable';
import { MenuPlanTable } from './components/MenuPlanTable';
import { MealPlanOverview } from './components/MealPlanOverview';
import { RecipeManagement } from './components/RecipeManagement';
import { CookFromPantry } from './components/CookFromPantry';
import { PlanViewLayout } from './components/PlanViewLayout';
import { AdminPanel } from './components/AdminPanel';
import { UserSettings } from './components/UserSettings';
import { MonthlyNutritionReport } from './components/MonthlyNutritionReport';
import { useIsMobile } from './hooks/useIsMobile';
import type { PlanType } from './types/index.js';
import './App.css';

type AppView = 'overview' | 'planner' | 'recipes' | 'cook' | 'menuplan' | 'admin' | 'settings' | 'bericht';

interface NavItem {
  view: AppView;
  label: string;
  isActive: (v: AppView) => boolean;
  show: boolean;
}

function AppHeader({ currentView, onNavigate }: { currentView: AppView; onNavigate: (view: AppView) => void }) {
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems: NavItem[] = [
    { view: 'overview', label: 'Pläne', isActive: v => v === 'overview' || v === 'planner' || v === 'menuplan', show: true },
    { view: 'recipes', label: 'Rezepte', isActive: v => v === 'recipes', show: true },
    { view: 'cook', label: 'Was kann ich kochen?', isActive: v => v === 'cook', show: true },
    { view: 'bericht', label: 'Bericht', isActive: v => v === 'bericht', show: true },
    { view: 'admin', label: 'Admin', isActive: v => v === 'admin', show: !!user?.isAdmin },
  ];

  if (isMobile) {
    const selectView = (view: AppView) => {
      onNavigate(view);
      setMenuOpen(false);
    };

    return (
      <header className="app-header">
        <h1
          className="app-header-title"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate('overview')}
        >
          Essensplaner
        </h1>
        <button
          className="app-header-hamburger"
          onClick={() => setMenuOpen(true)}
          aria-label="Menü öffnen"
        >
          ☰
        </button>

        {menuOpen && (
          <>
            <div className="app-drawer-overlay" onClick={() => setMenuOpen(false)} />
            <nav className="app-drawer">
              <button
                className="app-drawer-close"
                onClick={() => setMenuOpen(false)}
                aria-label="Menü schließen"
              >
                ✕
              </button>
              {navItems.filter(item => item.show).map(item => (
                <button
                  key={item.view}
                  className={item.isActive(currentView) ? 'app-drawer-item active' : 'app-drawer-item'}
                  onClick={() => selectView(item.view)}
                >
                  {item.label}
                </button>
              ))}
              <button
                className={currentView === 'settings' ? 'app-drawer-item active' : 'app-drawer-item'}
                onClick={() => selectView('settings')}
              >
                Einstellungen
              </button>
              <div className="app-drawer-divider" />
              <div className="app-drawer-email">{user?.email}</div>
              <button className="app-drawer-item" onClick={() => { setMenuOpen(false); logout(); }}>
                Abmelden
              </button>
            </nav>
          </>
        )}
      </header>
    );
  }

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
        {navItems.filter(item => item.show).map(item => (
          <button
            key={item.view}
            className={`btn btn-ghost btn-sm ${item.isActive(currentView) ? 'btn-nav-active' : ''}`}
            onClick={() => onNavigate(item.view)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="app-header-user">
        <span>{user?.email}</span>
        <button
          className={`btn btn-ghost btn-sm ${currentView === 'settings' ? 'btn-nav-active' : ''}`}
          onClick={() => onNavigate('settings')}
          title="Einstellungen"
        >
          👤
        </button>
      </div>
    </header>
  );
}

function getInitialShareStatus(): 'idle' | 'joining' {
  const params = new URLSearchParams(window.location.search);
  return (params.get('share') || params.get('joined')) ? 'joining' : 'idle';
}

function useShareJoin(onJoined: (planId: number) => void) {
  const { joinSharedPlan, selectPlan, isLoading } = useMealPlan();
  const [status, setStatus] = useState<'idle' | 'joining' | 'error'>(getInitialShareStatus);
  const [errorMsg, setErrorMsg] = useState('');
  const handled = useRef(false);

  // Read query params once on first render and clear them from the URL
  const [params] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const shareToken = p.get('share');
    const joinedPlanId = p.get('joined');

    if (shareToken || joinedPlanId) {
      const url = new URL(window.location.href);
      url.searchParams.delete('share');
      url.searchParams.delete('joined');
      url.searchParams.delete('shareError');
      window.history.replaceState({}, '', url.pathname + url.hash);
    }

    return { shareToken, joinedPlanId: joinedPlanId ? Number(joinedPlanId) : null };
  });

  // Handle ?share= token (API join)
  useEffect(() => {
    if (handled.current || !params.shareToken) return;
    handled.current = true;
    joinSharedPlan(params.shareToken)
      .then(planId => { setStatus('idle'); onJoined(planId); })
      .catch(err => { setStatus('error'); setErrorMsg(err instanceof Error ? err.message : 'Beitritt fehlgeschlagen'); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle ?joined= (server already joined, wait for initial load then select plan)
  useEffect(() => {
    if (handled.current || params.joinedPlanId === null) return;
    if (isLoading) return;
    handled.current = true;
    selectPlan(params.joinedPlanId);
    setStatus('idle');
    onJoined(params.joinedPlanId);
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  return { status, errorMsg };
}

function parseHash(hash: string): { view: AppView; planId?: number; reportMonth?: string } {
  if (hash === '#rezepte') return { view: 'recipes' };
  if (hash === '#kochen') return { view: 'cook' };
  if (hash === '#admin') return { view: 'admin' };
  if (hash === '#einstellungen') return { view: 'settings' };
  if (hash.startsWith('#bericht')) {
    const m = hash.split('/')[1];
    return { view: 'bericht', reportMonth: /^\d{4}-\d{2}$/.test(m || '') ? m : undefined };
  }
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
  const { selectPlan, state } = useMealPlan();
  const [view, setViewState] = useState<AppView>(() => parseHash(window.location.hash).view);
  const [reportMonth, setReportMonth] = useState<string | undefined>(() => parseHash(window.location.hash).reportMonth);

  const setView = useCallback((v: AppView, planId?: number) => {
    setViewState(v);
    if (v === 'recipes') window.location.hash = '#rezepte';
    else if (v === 'cook') window.location.hash = '#kochen';
    else if (v === 'bericht') window.location.hash = '#bericht';
    else if (v === 'settings') window.location.hash = '#einstellungen';
    else if (v === 'admin') window.location.hash = '#admin';
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
      const { view, planId, reportMonth } = parseHash(window.location.hash);
      setViewState(view);
      setReportMonth(reportMonth);
      if (planId) selectPlan(planId);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [selectPlan]);

  const plansRef = useRef(state.plans);
  plansRef.current = state.plans;

  const { status, errorMsg } = useShareJoin((planId: number) => {
    const joined = plansRef.current.find(p => p.id === planId);
    setView(joined?.planType === 'menu' ? 'menuplan' : 'planner', planId);
  });

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
      ) : view === 'settings' ? (
        <UserSettings />
      ) : view === 'admin' ? (
        <AdminPanel />
      ) : view === 'recipes' ? (
        <RecipeManagement />
      ) : view === 'cook' ? (
        <CookFromPantry />
      ) : view === 'bericht' ? (
        <MonthlyNutritionReport month={reportMonth} />
      ) : view === 'menuplan' ? (
        <PlanViewLayout onBack={() => setView('overview')} planType="menu"><MenuPlanTable /></PlanViewLayout>
      ) : (
        <PlanViewLayout onBack={() => setView('overview')}><MealPlanTable /></PlanViewLayout>
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
