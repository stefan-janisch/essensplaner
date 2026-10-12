import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { useIsMobile } from '../hooks/useIsMobile';
import { useDayScore } from '../hooks/useDayScore';
import type { calculateDayScore, DayScore } from '../utils/dayScore';
import type { NutrientColor } from '../utils/nutritionColors';
import { ModalPortal } from './Modal';
import { ProteinGapSuggestions } from './ProteinGapSuggestions';
import { DayPortionOptimizer } from './DayPortionOptimizer';
import type { NutritionTargets } from '../types/index.js';

const STATUS_COLORS = {
  green: '#51cf66',
  yellow: '#ffa94d',
  red: '#ff6b6b',
};

/** Status colour as text (tokens with light/dark variants in index.css). */
const textClass = (color: NutrientColor) => `day-score-text-${color}`;

/** "K: XX%" over "P: XX%" — how much of the day's calorie and protein targets the plan covers. */
function DayIndicator({ date, result, stacked, onClick }: {
  date: string;
  result: DayResult;
  stacked: boolean;
  onClick: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  const kcal = result?.day.components.find(c => c.key === 'kcal');
  const protein = result?.day.components.find(c => c.key === 'protein');
  const title = kcal && protein
    ? `Kalorien: ${kcal.actual} von ${kcal.target} kcal · Protein: ${protein.actual} von ${protein.target} g`
    : 'Keine Nährwertdaten';
  return (
    <span className={`day-nutrition-indicator${stacked ? ' day-nutrition-indicator-stacked' : ''}`}
      data-day-trigger={date} onClick={onClick} title={title}>
      <span className={`day-target-pct ${kcal ? textClass(kcal.color) : 'day-target-pct-empty'}`}>K: {kcal ? `${kcal.percent}%` : '–'}</span>
      <span className={`day-target-pct ${protein ? textClass(protein.color) : 'day-target-pct-empty'}`}>P: {protein ? `${protein.percent}%` : '–'}</span>
    </span>
  );
}

/** Per-component breakdown of a day score (also used in the plan score popup). */
export function DayScoreBreakdown({ day }: { day: DayScore }) {
  return (
    <div className="day-nutrition-rows">
      {day.components.map(c => (
        <div key={c.key} className="day-nutrition-row" title={`${c.points.toFixed(1)} / ${c.maxPoints.toFixed(0)} Punkte`}>
          <span className="day-nutrition-dot-mini" style={{ background: STATUS_COLORS[c.color] }} />
          <span className="day-nutrition-label">{c.label}</span>
          <span className="day-nutrition-values">{c.key === 'micros' ? 'der Referenz' : `${c.actual} / ${c.target}`}</span>
          <span className="day-nutrition-pct" style={{ color: STATUS_COLORS[c.color] }}>{c.percent}%</span>
        </div>
      ))}
      {day.penalty > 0 && (
        <div className="day-nutrition-row" title="1,5 Punkte je Prozentpunkt über 110 % des Kalorienziels — zusätzlich zu den verlorenen kcal-Punkten">
          <span className="day-nutrition-dot-mini" style={{ background: STATUS_COLORS.red }} />
          <span className="day-nutrition-label">Kalorienüberschuss</span>
          <span className="day-nutrition-values">Abzug</span>
          <span className="day-nutrition-pct" style={{ color: STATUS_COLORS.red }}>−{Math.round(day.penalty)}</span>
        </div>
      )}
    </div>
  );
}

type DayResult = ReturnType<typeof calculateDayScore>;

function TooltipContent({ result, date, targets }: { result: DayResult; date: string; targets: NutritionTargets }) {
  return (
    <div className="day-nutrition-tooltip-content">
      {result ? (
        <>
          <div style={{ fontSize: '12px', marginBottom: '6px' }}>
            Tages-Score <strong style={{ color: STATUS_COLORS[result.day.color] }}>{result.day.score}</strong>
            <span style={{ color: '#888' }}> / 100</span>
          </div>
          <DayScoreBreakdown day={result.day} />
          <DayPortionOptimizer date={date} targets={targets} />
          <ProteinGapSuggestions date={date} totals={result.totals} targets={targets} />
        </>
      ) : (
        <div style={{ fontSize: '12px', color: '#888' }}>Keine Nährwertdaten verfügbar</div>
      )}
    </div>
  );
}

/** Open below the anchor, or above it when there is more room there; never past the viewport edges. */
function tooltipPosition(anchor: DOMRect): React.CSSProperties {
  const margin = 8;
  const spaceBelow = window.innerHeight - anchor.bottom - 6 - margin;
  const spaceAbove = anchor.top - 6 - margin;
  const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - 340 - margin));
  return spaceBelow >= 420 || spaceBelow >= spaceAbove
    ? { top: anchor.bottom + 6, left, maxHeight: spaceBelow }
    : { bottom: window.innerHeight - anchor.top + 6, left, maxHeight: spaceAbove };
}

function DesktopTooltip({ result, date, targets, anchor, onClose }: {
  result: DayResult;
  date: string;
  targets: NutritionTargets;
  anchor: DOMRect;
  onClose: () => void;
}) {
  const pos = tooltipPosition(anchor);

  useEffect(() => {
    // This day's own triggers toggle the tooltip themselves; any other click closes it.
    const handle = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.day-nutrition-portal-tooltip') && !target.closest(`[data-day-trigger="${date}"]`)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose, date]);

  return createPortal(
    <div
      className="day-nutrition-portal-tooltip"
      style={{ position: 'fixed', ...pos, overflowY: 'auto', zIndex: 1000 }}
    >
      <TooltipContent result={result} date={date} targets={targets} />
    </div>,
    document.body
  );
}

/**
 * Day heading of the plan: weekday name in the day-score colour, the date, and the kcal/protein
 * coverage. A click on the name or the coverage opens the day score breakdown and its tools.
 * `stacked` (table, visual grid) puts everything on its own line; `inline` is the mobile header.
 */
export function DayLabel({ date, layout }: { date: string; layout: 'stacked' | 'inline' }) {
  const isMobile = useIsMobile();
  const [showPopup, setShowPopup] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const { result, targets: dayTargets, hasEntries } = useDayScore(date);
  const scored = hasEntries && result;

  const toggle = (e: React.MouseEvent<HTMLElement>) => {
    setAnchor(e.currentTarget.getBoundingClientRect());
    setShowPopup(p => !p);
  };

  const name = (
    <span
      className={[hasEntries && 'day-name-trigger', scored && textClass(result.day.color)].filter(Boolean).join(' ') || undefined}
      data-day-trigger={hasEntries ? date : undefined}
      onClick={hasEntries ? toggle : undefined}
      title={scored ? `Tages-Score ${result.day.score} / 100 – Details anzeigen` : undefined}
    >
      {format(parseISO(date), 'EEEE', { locale: de })}
    </span>
  );
  const indicator = hasEntries && <DayIndicator date={date} result={result} stacked={layout === 'stacked'} onClick={toggle} />;

  let popup = null;
  if (showPopup && isMobile) {
    popup = (
      <ModalPortal>
        <div className="modal-backdrop" onClick={() => setShowPopup(false)}>
          <div className="day-nutrition-popup" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <strong style={{ fontSize: '14px' }}>Nährwerte</strong>
              <button className="btn-ghost" onClick={() => setShowPopup(false)} style={{ fontSize: '16px' }}>{'\u2717'}</button>
            </div>
            <TooltipContent result={result} date={date} targets={dayTargets} />
          </div>
        </div>
      </ModalPortal>
    );
  } else if (showPopup && anchor) {
    popup = <DesktopTooltip result={result} date={date} targets={dayTargets} anchor={anchor} onClose={() => setShowPopup(false)} />;
  }

  if (layout === 'inline') {
    return (
      <>
        {name}
        <span className="mobile-day-date"> {format(parseISO(date), 'dd.MM.')}</span>
        {indicator}
        {popup}
      </>
    );
  }
  return (
    <>
      <div style={{ fontWeight: 600 }}>{name}</div>
      <div style={{ color: 'var(--text)' }}>{format(parseISO(date), 'dd.MM.yyyy')}</div>
      {indicator}
      {popup}
    </>
  );
}
