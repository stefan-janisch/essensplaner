import React, { useState } from 'react';
import { useMealPlan } from '../context/MealPlanContext';

export const DateRangeSelector: React.FC = () => {
  const { state, initializeDateRange, resetMealPlan } = useMealPlan();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleInitialize = () => {
    if (!startDate || !endDate) return;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      alert('Startdatum muss vor Enddatum liegen');
      return;
    }
    initializeDateRange(start, end);
  };

  const handleReset = () => {
    resetMealPlan();
    setStartDate('');
    setEndDate('');
    setShowResetConfirm(false);
  };

  return (
    <div className="panel" style={{ marginBottom: '24px' }}>
      <h2 style={{ marginTop: 0, fontSize: '28px', letterSpacing: '-0.5px' }}>Essensplaner</h2>

      {!state.startDate ? (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
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
            onClick={handleInitialize}
            disabled={!startDate || !endDate}
          >
            Plan erstellen
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          <div>
            <strong>{state.startDate}</strong> bis <strong>{state.endDate}</strong>
          </div>
          {!showResetConfirm ? (
            <button
              className="btn btn-danger"
              onClick={() => setShowResetConfirm(true)}
            >
              Plan zurücksetzen
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{ color: 'var(--color-danger)', fontWeight: 500 }}>Wirklich zurücksetzen?</span>
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
