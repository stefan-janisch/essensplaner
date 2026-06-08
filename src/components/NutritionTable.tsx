import { useState, useMemo } from 'react';
import { api } from '../api/client.js';
import { useMealPlan } from '../context/MealPlanContext';
import type { Meal, NutritionInfo, MicroNutrients } from '../types/index.js';
import { DEFAULT_NUTRITION_TARGETS } from '../types/index.js';
import { getNutrientColor, COLOR_HEX, NUTRITION_LABELS, calculateOptimalMultiplier, getPerMealTargets } from '../utils/nutritionColors';
import { MICRO_REFERENCES, getMicroReference } from '../utils/microReference';
import { computeNutritionScore, getScoreColor } from '../utils/nutritionScore';

type FullNutrition = NutritionInfo & Partial<MicroNutrients>;

// Round a (scaled) micronutrient value to at most one decimal for display.
function fmtMicro(value: number): string {
  const r = Math.round(value * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

interface NutritionTableProps {
  meal: Meal;
  onTagsUpdated?: (tags: string[]) => void;
  onApplyRecommendation?: (multiplier: number) => void;
}

const DISPLAY_KEYS: { key: keyof NutritionInfo; unit: string }[] = [
  { key: 'kcal', unit: 'kcal' },
  { key: 'protein', unit: 'g' },
  { key: 'carbs', unit: 'g' },
  { key: 'fat', unit: 'g' },
  { key: 'fiber', unit: 'g' },
  { key: 'sugar', unit: 'g' },
];

export function NutritionTable({ meal, onTagsUpdated, onApplyRecommendation }: NutritionTableProps) {
  const { nutritionTargets, mealsPerDay, nutritionProfile } = useMealPlan();
  const [nutrition, setNutrition] = useState<FullNutrition | null>(meal.nutritionPerServing ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portionScale, setPortionScale] = useState(100); // percentage: 50-200
  const [showMicros, setShowMicros] = useState(false);

  const targets = nutritionTargets ?? DEFAULT_NUTRITION_TARGETS;
  const mpd = mealsPerDay || 3;
  const perMealTargets = getPerMealTargets(targets, mpd);
  // Daily DGE reference per micronutrient (gender-aware) → divided by meals/day for a per-meal target.
  const microRefs = useMemo(() => getMicroReference(nutritionProfile), [nutritionProfile]);

  const scaled = useMemo(() => {
    if (!nutrition) return null;
    const s = portionScale / 100;
    return Object.fromEntries(
      DISPLAY_KEYS.map(({ key }) => [key, Math.round(nutrition[key] * s)])
    ) as Record<keyof NutritionInfo, number>;
  }, [nutrition, portionScale]);

  const handleEstimate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<{ nutritionPerServing: FullNutrition; tagsUpdated: string[] | null }>(
        '/api/estimate-nutrition',
        { mealId: meal.id }
      );
      setNutrition(result.nutritionPerServing);
      if (result.tagsUpdated && onTagsUpdated) {
        onTagsUpdated(result.tagsUpdated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Schätzen der Nährwerte');
    } finally {
      setLoading(false);
    }
  };

  if (!nutrition && !loading && !error) {
    return (
      <div className="nutrition-section">
        <button className="btn btn-muted" onClick={handleEstimate} style={{ width: '100%' }}>
          Nährwerte schätzen
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="nutrition-section" style={{ textAlign: 'center', padding: '20px' }}>
        <div style={{ color: 'var(--text-muted)' }}>Nährwerte werden geschätzt...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="nutrition-section">
        <div style={{ color: 'var(--color-danger)', marginBottom: '8px', fontSize: '13px' }}>{error}</div>
        <button className="btn btn-muted btn-sm" onClick={handleEstimate}>Erneut versuchen</button>
      </div>
    );
  }

  if (!nutrition || !scaled) return null;

  return (
    <div className="nutrition-section">
      <div className="nutrition-header">
        Geschätzte Nährwerte pro Portion
        {(() => {
          const score = computeNutritionScore(nutrition);
          if (score === null) return null;
          return (
            <span className="nutrition-score-badge" style={{ backgroundColor: COLOR_HEX[getScoreColor(score)] }}
              title="Nährwert-Score 0–100: Mikronährstoffdichte, Protein, Ballaststoffe, wenig Zucker, moderate Energie">
              Score {score}
            </span>
          );
        })()}
      </div>

      {/* Portion size slider */}
      <div className="nutrition-portion-slider">
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>0.5×</span>
        <input type="range" min="50" max="200" step="5" value={portionScale}
          onChange={e => setPortionScale(parseInt(e.target.value))}
          style={{ flex: 1 }} />
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>2×</span>
        <span className="nutrition-portion-badge">{(portionScale / 100).toFixed(portionScale % 100 === 0 ? 0 : 1)}× Portion</span>
      </div>

      {/* Number grid */}
      <div className="nutrition-grid">
        {DISPLAY_KEYS.map(({ key, unit }) => (
          <div key={key} className="nutrition-item">
            <div className="nutrition-value">
              {scaled[key]}{key !== 'kcal' && <span className="nutrition-unit">{unit}</span>}
            </div>
            <div className="nutrition-label">{key === 'kcal' ? 'kcal' : NUTRITION_LABELS[key]}</div>
          </div>
        ))}
      </div>

      {/* Bar chart — actual vs target per meal */}
      <div className="nutrition-bar-chart">
        {DISPLAY_KEYS.map(({ key }) => {
          const target = perMealTargets[key];
          const actual = scaled[key];
          const percent = target > 0 ? Math.round((actual / target) * 100) : 0;
          const barWidth = Math.min(percent, 200);

          return (
            <div key={key} className="nutrition-bar-row">
              <div className="nutrition-bar-label">{NUTRITION_LABELS[key]}</div>
              <div className="nutrition-bar-track">
                <div
                  className="nutrition-bar-fill"
                  style={{ width: `${barWidth / 2}%`, backgroundColor: COLOR_HEX[getNutrientColor(percent, key)] }}
                />
                <div className="nutrition-bar-target" />
              </div>
              <div className="nutrition-bar-percent">{percent}%</div>
            </div>
          );
        })}
      </div>

      {/* Expandable micronutrient detail (vitamins + trace elements) */}
      <div className="nutrition-micros">
        <button className="nutrition-micros-toggle" onClick={() => setShowMicros(v => !v)}>
          <span className="nutrition-micros-chevron">{showMicros ? '▾' : '▸'}</span>
          Vitamine &amp; Spurenelemente
        </button>
        {showMicros && (() => {
          const s = portionScale / 100;
          const present = MICRO_REFERENCES.filter(m => nutrition[m.key] != null);
          if (present.length === 0) {
            return (
              <div className="nutrition-micro-empty">
                Für dieses Rezept liegen noch keine Mikronährstoff-Daten vor. Sie werden bei der nächsten Nährwert-Schätzung ergänzt.
              </div>
            );
          }
          return (
            <div className="nutrition-micro-grid">
              {present.map(m => {
                const val = nutrition[m.key]! * s;
                const perMealRef = microRefs[m.key] / mpd;
                const percent = perMealRef > 0 ? Math.round((val / perMealRef) * 100) : 0;
                const color = getNutrientColor(percent, 'protein'); // all micros: "more is better"
                return (
                  <div key={m.key} className="nutrition-micro-row"
                    title={`${percent}% der empfohlenen Menge pro Mahlzeit (Tagesbedarf ~${microRefs[m.key]} ${m.unit})`}>
                    <span className="nutrition-micro-label">{m.label}</span>
                    <span className="nutrition-micro-value" style={{ color: COLOR_HEX[color] }}>
                      {fmtMicro(val)}<span className="nutrition-micro-unit">{m.unit}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Optimal serving recommendation */}
      {(() => {
        const M = calculateOptimalMultiplier(nutrition, perMealTargets);
        if (Math.abs(M - 1) <= 0.05) return null;
        const scaledKcal = Math.round(nutrition.kcal * M);
        const mPct = Math.round(M * 100 / 5) * 5;
        return (
          <div className="nutrition-recommendation" onClick={() => { setPortionScale(Math.max(50, Math.min(200, mPct))); onApplyRecommendation?.(M); }} style={{ cursor: 'pointer' }}>
            Empfohlene Portionsgröße: <strong>{M.toFixed(1)}×</strong> ({scaledKcal} kcal) <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>— klicken zum Anwenden</span>
          </div>
        );
      })()}

      <div className="nutrition-disclaimer">
        Schätzwerte — können von tatsächlichen Nährwerten abweichen. Balken zeigen Anteil an der empfohlenen Menge pro Mahlzeit (1/{mpd} Tagesbedarf).
      </div>
    </div>
  );
}
