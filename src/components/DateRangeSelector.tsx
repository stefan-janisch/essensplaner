import React from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import { useIsMobile } from '../hooks/useIsMobile';

interface DateRangeSelectorProps {
  onBack: () => void;
}

function formatDateDE(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y.slice(2)}`;
}

export const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({ onBack }) => {
  const { activePlan, defaultServings, updatePlanServings } = useMealPlan();
  const isMobile = useIsMobile();

  if (!activePlan) return null;

  const planServings = activePlan.defaultServings ?? defaultServings;

  const handleServingsChange = (value: number) => {
    const s = Math.max(1, value);
    updatePlanServings(activePlan.id, s);
  };

  if (isMobile) {
    return (
      <div className="panel" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ flexShrink: 0, padding: '4px 6px' }}>
          &larr;
        </button>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          <strong style={{ fontSize: '15px', color: 'var(--text-h)' }}>{activePlan.name}</strong>
          {activePlan.startDate && activePlan.endDate && (
            <span style={{ color: 'var(--text)', fontSize: '12px', marginLeft: '6px' }}>
              {formatDateDE(activePlan.startDate)} — {formatDateDE(activePlan.endDate)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <input
            className="input"
            type="number"
            min="1"
            value={planServings}
            onChange={(e) => handleServingsChange(parseInt(e.target.value) || 1)}
            style={{ width: '40px', textAlign: 'center', padding: '3px 4px', fontSize: '13px' }}
          />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>P</span>
        </div>
      </div>
    );
  }

  return (
    <div className="panel date-range-bar" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      {/* Left: back */}
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ flexShrink: 0 }}>
        &larr; Alle Pläne
      </button>

      {/* Center: title + date range */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <strong style={{ fontSize: '16px', color: 'var(--text-h)' }}>{activePlan.name}</strong>
        {activePlan.startDate && activePlan.endDate && (
          <span style={{ color: 'var(--text)', fontSize: '14px' }}>
            {formatDateDE(activePlan.startDate)} — {formatDateDE(activePlan.endDate)}
          </span>
        )}
        {activePlan.isOwner === false && activePlan.ownerEmail && (
          <span style={{ fontSize: '12px', color: 'var(--accent)', padding: '2px 8px', borderRadius: '10px', background: 'var(--accent-bg)', marginTop: '2px' }}>
            Geteilt von {activePlan.ownerEmail}
          </span>
        )}
      </div>

      {/* Right: servings */}
      <div className="servings-section" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <label style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>Standard-Portionen:</label>
        <input
          className="input"
          type="number"
          min="1"
          value={planServings}
          onChange={(e) => handleServingsChange(parseInt(e.target.value) || 1)}
          style={{ width: '56px', textAlign: 'center', padding: '4px 8px' }}
        />
      </div>
    </div>
  );
};
