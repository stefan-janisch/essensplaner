import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMealPlan } from '../context/MealPlanContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { calculateDailyNutrition } from '../utils/dailyNutrition';
import { DEFAULT_NUTRITION_TARGETS } from '../types/index.js';
import { ModalPortal } from './Modal';

const DOT_COLORS = {
  green: '#51cf66',
  yellow: '#ffa94d',
  red: '#ff6b6b',
  gray: '#ced4da',
};

const STATUS_COLORS = {
  green: '#51cf66',
  yellow: '#ffa94d',
  red: '#ff6b6b',
};

function TooltipContent({ result }: { result: ReturnType<typeof calculateDailyNutrition> }) {
  return (
    <div className="day-nutrition-tooltip-content">
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>
        {result.filledMeals}/{result.totalSlots} Mahlzeiten geplant
      </div>
      {result.details.length > 0 ? (
        <div className="day-nutrition-rows">
          {result.details.map(d => (
            <div key={d.key} className="day-nutrition-row">
              <span className="day-nutrition-dot-mini" style={{ background: STATUS_COLORS[d.color] }} />
              <span className="day-nutrition-label">{d.label}</span>
              <span className="day-nutrition-values">{d.actual} / {d.target}</span>
              <span className="day-nutrition-pct" style={{ color: STATUS_COLORS[d.color] }}>{d.percent}%</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: '#888' }}>Keine Nährwertdaten verfügbar</div>
      )}
    </div>
  );
}

function DesktopTooltip({ result, dotRef, onClose }: {
  result: ReturnType<typeof calculateDailyNutrition>;
  dotRef: React.RefObject<HTMLSpanElement | null>;
  onClose: () => void;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (dotRef.current) {
      const rect = dotRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left });
    }
  }, [dotRef]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.day-nutrition-portal-tooltip') && !target.closest('.day-nutrition-dot')) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  return createPortal(
    <div
      className="day-nutrition-portal-tooltip"
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000 }}
    >
      <TooltipContent result={result} />
    </div>,
    document.body
  );
}

export function DayNutritionDot({ date }: { date: string }) {
  const { activePlan, allMealsForActivePlan, nutritionTargets, defaultServings } = useMealPlan();
  const isMobile = useIsMobile();
  const [showPopup, setShowPopup] = useState(false);
  const dotRef = useRef<HTMLSpanElement>(null);

  const entries = activePlan?.entries || [];
  const targets = nutritionTargets ?? DEFAULT_NUTRITION_TARGETS;
  const planServings = activePlan?.defaultServings ?? defaultServings;
  const result = calculateDailyNutrition(date, entries, allMealsForActivePlan, targets, planServings);

  if (result.overallColor === 'gray' && result.filledMeals === 0) return null;

  if (isMobile) {
    return (
      <>
        <span
          className="day-nutrition-dot"
          style={{ background: DOT_COLORS[result.overallColor] }}
          onClick={() => setShowPopup(true)}
        />
        {showPopup && (
          <ModalPortal>
            <div className="modal-backdrop" onClick={() => setShowPopup(false)}>
              <div className="day-nutrition-popup" onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '14px' }}>Nährwerte</strong>
                  <button className="btn-ghost" onClick={() => setShowPopup(false)} style={{ fontSize: '16px' }}>{'\u2717'}</button>
                </div>
                <TooltipContent result={result} />
              </div>
            </div>
          </ModalPortal>
        )}
      </>
    );
  }

  return (
    <>
      <span
        ref={dotRef}
        className="day-nutrition-dot"
        style={{ background: DOT_COLORS[result.overallColor] }}
        onClick={() => setShowPopup(p => !p)}
      />
      {showPopup && <DesktopTooltip result={result} dotRef={dotRef} onClose={() => setShowPopup(false)} />}
    </>
  );
}
