import React, { useState } from 'react';
import { useMealPlan } from '../context/MealPlanContext';

export const DateRangeSelector: React.FC = () => {
  const { state, activePlan, createPlan, selectPlan, resetMealPlan } = useMealPlan();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [planName, setPlanName] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!startDate || !endDate) return;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      alert('Startdatum muss vor Enddatum liegen');
      return;
    }
    setCreating(true);
    try {
      await createPlan(planName || `Plan ${startDate}`, start, end);
      setStartDate('');
      setEndDate('');
      setPlanName('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Erstellen');
    } finally {
      setCreating(false);
    }
  };

  const handleReset = async () => {
    await resetMealPlan();
    setShowResetConfirm(false);
  };

  return (
    <div className="panel" style={{ marginBottom: '24px' }}>
      {/* Plan selector when multiple plans exist */}
      {state.plans.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 500 }}>Plan:</label>
          {state.plans.map(plan => (
            <button
              key={plan.id}
              className={`pill ${plan.id === state.activePlanId ? 'pill-active' : ''}`}
              onClick={() => selectPlan(plan.id)}
            >
              {plan.name}
            </button>
          ))}
        </div>
      )}

      {!activePlan ? (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            type="text"
            placeholder="Planname (optional)"
            value={planName}
            onChange={e => setPlanName(e.target.value)}
            style={{ width: '180px' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            Von:
            <input
              className="input"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            Bis:
            <input
              className="input"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={!startDate || !endDate || creating}
          >
            {creating ? '...' : 'Plan erstellen'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          <div>
            <strong>{activePlan.name}</strong>: {activePlan.startDate} bis {activePlan.endDate}
          </div>
          {!showResetConfirm ? (
            <button
              className="btn btn-danger"
              onClick={() => setShowResetConfirm(true)}
            >
              Plan löschen
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{ color: 'var(--color-danger)', fontWeight: 500 }}>Wirklich löschen?</span>
              <button className="btn btn-danger btn-sm" onClick={handleReset}>
                Ja
              </button>
              <button className="btn btn-muted btn-sm" onClick={() => setShowResetConfirm(false)}>
                Abbrechen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
