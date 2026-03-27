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
    <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
      <h2 style={{ marginTop: 0 }}>Essensplaner</h2>

      {!state.startDate ? (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label>
            Von:
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ marginLeft: '5px', padding: '5px' }}
            />
          </label>
          <label>
            Bis:
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ marginLeft: '5px', padding: '5px' }}
            />
          </label>
          <button
            onClick={handleInitialize}
            disabled={!startDate || !endDate}
            style={{
              padding: '6px 15px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: startDate && endDate ? 'pointer' : 'not-allowed',
            }}
          >
            Plan erstellen
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <div>
            <strong>Zeitraum:</strong> {state.startDate} bis {state.endDate}
          </div>
          {!showResetConfirm ? (
            <button
              onClick={() => setShowResetConfirm(true)}
              style={{
                padding: '6px 15px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Plan zurücksetzen
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{ color: '#d32f2f' }}>Wirklich zurücksetzen?</span>
              <button
                onClick={handleReset}
                style={{
                  padding: '4px 12px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Ja
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                style={{
                  padding: '4px 12px',
                  backgroundColor: '#9e9e9e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Abbrechen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
