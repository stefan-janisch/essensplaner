import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { useMealPlan } from '../context/MealPlanContext';
import { usePlanScore, useScoringInputs } from '../hooks/usePlanScore';
import { calculatePlanScore, optimizePlan } from '../utils/dayScore';
import type { PlanDayScore, PlanScore, ServingChange, TargetsForDate } from '../utils/dayScore';
import { COLOR_HEX } from '../utils/nutritionColors';
import type { MealPlan } from '../types/index.js';
import { DayScoreBreakdown } from './DayLabel';
import { ModalPortal } from './Modal';
import { ProteinGapSuggestions } from './ProteinGapSuggestions';
import { OptimizerModeToggle } from './DayPortionOptimizer';
import { formatPortionWeight, portionWeightTitle } from '../utils/portionWeight';
import { useOptimizerMode } from '../hooks/useOptimizerMode';
import { targetDensity } from '../utils/proteinPlanning';
import { formatProteinDensity } from '../utils/nutritionScore';
import { PlanScoreChipDetail } from './PlanScoreDetails';
import { hasComponentDetail } from '../utils/dayScore';
import type { DayScoreComponent } from '../utils/dayScore';

const TITLE = 'Plan-Score 0–100: Ø Tages-Score — wie gut die geplanten Tage deine Nährwert-Ziele treffen';

/** Small coloured score pill. Clickable (opens the detail popup) only for the active plan. */
export function PlanScoreBadge({ plan, interactive = false, size = 'md' }: {
  plan: MealPlan;
  interactive?: boolean;
  size?: 'sm' | 'md';
}) {
  const score = usePlanScore(plan);
  const [open, setOpen] = useState(false);
  if (!score || score.score === null) return null;

  return (
    <>
      <button
        type="button"
        className={`plan-score-badge plan-score-badge-${size}`}
        style={{ backgroundColor: COLOR_HEX[score.color], cursor: interactive ? 'pointer' : 'default' }}
        title={TITLE}
        onClick={interactive ? (e) => { e.stopPropagation(); setOpen(true); } : undefined}
        tabIndex={interactive ? 0 : -1}
      >
        {size === 'md' ? `Score ${score.score}` : score.score}
      </button>
      {open && <PlanScorePopup plan={plan} score={score} onClose={() => setOpen(false)} />}
    </>
  );
}

function formatDay(date: string) {
  return format(parseISO(date), 'EEE dd.MM.', { locale: de });
}

/** Mean "% of target" of one component over the scored days. */
function avgPercent(plan: PlanScore, key: 'protein' | 'kcal'): number {
  if (plan.days.length === 0) return 0;
  const sum = plan.days.reduce((s, d) => s + (d.day.components.find(c => c.key === key)?.percent ?? 0), 0);
  return Math.round(sum / plan.days.length);
}

/** Protein summary of a plan: Ø g/day, coverage, density vs. the density the targets need, weakest day. */
function proteinBalance(plan: PlanScore, targetsFor: TargetsForDate) {
  if (plan.days.length === 0) return null;
  let protein = 0, kcal = 0, need = 0;
  let weakest = plan.days[0];
  const pctOf = (d: PlanDayScore) => d.day.components.find(c => c.key === 'protein')?.percent ?? 0;
  for (const d of plan.days) {
    protein += d.totals.protein;
    kcal += d.totals.kcal;
    need += targetDensity(targetsFor(d.date));
    if (pctOf(d) < pctOf(weakest)) weakest = d;
  }
  const n = plan.days.length;
  return {
    grams: Math.round(protein / n),
    percent: avgPercent(plan, 'protein'),
    density: kcal > 0 ? (protein / kcal) * 100 : 0,
    needed: need / n,
    weakestDate: weakest.date,
    weakestPercent: pctOf(weakest),
  };
}

function PlanScorePopup({ plan, score, onClose }: { plan: MealPlan; score: PlanScore; onClose: () => void }) {
  const { updateEntryServings, nutritionProfile, activity, sport } = useMealPlan();
  const { targetsFor, microRefs, mealsById, personsFor } = useScoringInputs(plan);
  const [mode] = useOptimizerMode();
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [openChip, setOpenChip] = useState<DayScoreComponent['key'] | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [applied, setApplied] = useState<ServingChange[] | null>(null);

  const optimization = useMemo(() => {
    if (!plan.entries) return null;
    const today = format(new Date(), 'yyyy-MM-dd');
    const { changes, override } = optimizePlan(plan.entries, mealsById, targetsFor, microRefs, personsFor, today, mode);
    const after = calculatePlanScore(plan.entries, mealsById, targetsFor, microRefs, personsFor, plan.startDate, plan.endDate, override);
    return { changes, after: after.score ?? 0, afterPlan: after };
  }, [plan.entries, plan.startDate, plan.endDate, mealsById, targetsFor, microRefs, personsFor, mode]);
  const balance = useMemo(() => proteinBalance(score, targetsFor), [score, targetsFor]);

  const apply = () => {
    if (!optimization) return;
    for (const c of optimization.changes) updateEntryServings(c.entryId, c.to);
    setApplied(optimization.changes);
    setShowChanges(false);
  };
  const undo = () => {
    if (!applied) return;
    for (const c of applied) updateEntryServings(c.entryId, c.from);
    setApplied(null);
  };

  // What counts as "better" depends on the mode, because each one trades a different thing away.
  // A better score always counts: a calorie surplus is penalised hard, so the right move for an
  // overshooting day is to cut portions — which lowers protein coverage while lifting the score.
  const scoreImproves = !!optimization && optimization.after > (score.score ?? 0);
  const proteinImproves = !!optimization
    && avgPercent(optimization.afterPlan, 'protein') > avgPercent(score, 'protein');
  // Deficit mode: bringing an over-budget plan down is the point, even without more protein.
  const kcalImproves = !!optimization
    && avgPercent(score, 'kcal') > 100
    && avgPercent(optimization.afterPlan, 'kcal') < avgPercent(score, 'kcal');
  const canImprove = !!optimization && optimization.changes.length > 0 && (
    mode === 'score' ? scoreImproves
      : mode === 'deficit' ? (kcalImproves || proteinImproves || scoreImproves)
        : (proteinImproves || scoreImproves)
  );

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-content plan-score-popup" onClick={e => e.stopPropagation()}>
          <div className="plan-score-popup-header">
            <div>
              <div className="plan-score-popup-title">
                Plan-Score <strong style={{ color: COLOR_HEX[score.color] }}>{score.score}</strong>
                <span className="plan-score-muted"> / 100</span>
              </div>
              <div className="plan-score-muted">
                Ø der Tages-Scores · {score.daysScored} von {score.daysTotal} Tagen bewertet
              </div>
            </div>
            <button className="btn-ghost" onClick={onClose} style={{ fontSize: '16px' }} aria-label="Schließen">{'✗'}</button>
          </div>

          <h4 className="plan-score-section-title">Zielabdeckung Ø pro Tag</h4>
          <div className="plan-score-chips">
            {score.avgPercent.map(a => {
              const clickable = hasComponentDetail(a.key);
              const isOpen = openChip === a.key;
              return (
                <button
                  key={a.key}
                  type="button"
                  className={`plan-score-chip${clickable ? ' plan-score-chip-clickable' : ''}${isOpen ? ' plan-score-chip-open' : ''}`}
                  style={{ borderColor: COLOR_HEX[a.color] }}
                  onClick={clickable ? () => setOpenChip(isOpen ? null : a.key) : undefined}
                  disabled={!clickable}
                  title={clickable ? `${a.label}: Details anzeigen` : undefined}
                >
                  {a.label} <strong style={{ color: COLOR_HEX[a.color] }}>{a.percent}%</strong>
                  {clickable && <span className="plan-score-chip-chevron">{isOpen ? '▾' : '▸'}</span>}
                </button>
              );
            })}
          </div>
          {openChip && (
            <PlanScoreChipDetail
              chipKey={openChip}
              score={score}
              targetsFor={targetsFor}
              profile={nutritionProfile}
              activity={activity}
              sport={sport}
            />
          )}

          {balance && (
            <div className="plan-score-protein">
              <strong>Protein</strong> Ø {balance.grams} g/Tag ({balance.percent} %)
              {' · '}Ø {formatProteinDensity(balance.density)} g/100 kcal (nötig {formatProteinDensity(balance.needed)})
              {balance.weakestPercent < 100 && <> · schwächster Tag {formatDay(balance.weakestDate)} ({balance.weakestPercent} %)</>}
            </div>
          )}

          <h4 className="plan-score-section-title">Tage</h4>
          <div className="plan-score-days">
            {score.days.map(d => (
              <div key={d.date}>
                <button
                  type="button"
                  className="plan-score-day"
                  onClick={() => setExpandedDay(expandedDay === d.date ? null : d.date)}
                >
                  <span className="plan-score-day-date">{formatDay(d.date)}</span>
                  <span className="plan-score-day-score" style={{ background: COLOR_HEX[d.day.color] }}>{d.day.score}</span>
                  <span className="plan-score-muted plan-score-day-weakest">
                    schwächster Wert: {d.weakest.label} {d.weakest.percent}%
                  </span>
                  <span className="plan-score-muted">{expandedDay === d.date ? '▾' : '▸'}</span>
                </button>
                {expandedDay === d.date && (
                  <div className="plan-score-day-detail">
                    <DayScoreBreakdown day={d.day} />
                    <ProteinGapSuggestions date={d.date} totals={d.totals} targets={targetsFor(d.date)} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="plan-score-section-row">
            <h4 className="plan-score-section-title">Portionen optimieren</h4>
            {!applied && <OptimizerModeToggle />}
          </div>
          {applied ? (
            <div className="plan-score-optimize">
              <span>✓ {applied.length} Portionen angepasst.</span>
              <button className="btn btn-muted btn-sm" onClick={undo}>Rückgängig</button>
            </div>
          ) : canImprove ? (
            <>
              <div className="plan-score-optimize">
                {mode !== 'score' ? (
                  <span>
                    Protein Ø {avgPercent(score, 'protein')} % → <strong style={{ color: avgPercent(optimization!.afterPlan, 'protein') >= avgPercent(score, 'protein') ? COLOR_HEX.green : undefined }}>{avgPercent(optimization!.afterPlan, 'protein')} %</strong>
                    {' · '}kcal Ø {avgPercent(score, 'kcal')} % → <strong style={{ color: kcalImproves ? COLOR_HEX.green : undefined }}>{avgPercent(optimization!.afterPlan, 'kcal')} %</strong>
                    {' · '}Score {score.score} → <strong>{optimization!.after}</strong>
                  </span>
                ) : (
                  <span>
                    Mit optimierten Portionen: <strong>{score.score}</strong> → <strong style={{ color: COLOR_HEX.green }}>{optimization!.after}</strong>
                  </span>
                )}
                <button className="btn btn-primary btn-sm" onClick={apply}>Portionen optimieren</button>
              </div>
              <button type="button" className="btn-ghost plan-score-changes-toggle" onClick={() => setShowChanges(s => !s)}>
                {showChanges ? '▾' : '▸'} {optimization!.changes.length} Änderungen anzeigen
              </button>
              {showChanges && (
                <ul className="plan-score-changes">
                  {optimization!.changes.map(c => {
                    const weight = formatPortionWeight(mealsById.get(c.mealId), c.to);
                    return (
                      <li key={c.entryId}>
                        <span className="plan-score-muted">{formatDay(c.date)}</span>{' '}
                        {mealsById.get(c.mealId)?.name ?? '—'}: {c.from} → <strong>{c.to}</strong> Portionen
                        {weight && <span className="portion-weight" title={portionWeightTitle(mealsById.get(c.mealId), c.to)}> · {weight}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <div className="plan-score-muted">Die Portionen sind bereits optimal — bessere Werte gehen nur mit anderen Rezepten.</div>
          )}
          <div className="plan-score-muted plan-score-footnote">
            Kalorienüberschuss kostet zusätzlich 1,5 Punkte je Prozent über 110 % des Tagesziels.
            Portionen je Rezept zwischen 0,5× und 2× pro Person. „Protein zuerst“ lässt Tage über dem
            Kalorienziel unverändert und holt darunter Protein; „Defizit zuerst“ rechnet auch solche
            Tage herunter. Vergangene Tage, gekochte (✗) Einträge, QuickMeals sowie Getränke und Sonstiges bleiben unverändert.
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
