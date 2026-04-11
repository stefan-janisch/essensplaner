import { useState, useMemo } from 'react';
import { api } from '../api/client.js';
import { useMealPlan } from '../context/MealPlanContext';
import type { Meal, NutritionInfo } from '../types/index.js';
import { DEFAULT_NUTRITION_TARGETS } from '../types/index.js';
import { getNutrientColor, COLOR_HEX, NUTRITION_LABELS, calculateOptimalMultiplier, getPerMealTargets } from '../utils/nutritionColors';

interface NutritionTableProps {
  meal: Meal;
  onTagsUpdated?: (tags: string[]) => void;
}

const DISPLAY_KEYS: { key: keyof NutritionInfo; unit: string }[] = [
  { key: 'kcal', unit: 'kcal' },
  { key: 'protein', unit: 'g' },
  { key: 'carbs', unit: 'g' },
  { key: 'fat', unit: 'g' },
  { key: 'fiber', unit: 'g' },
  { key: 'sugar', unit: 'g' },
];

export function NutritionTable({ meal, onTagsUpdated }: NutritionTableProps) {
  const { nutritionTargets, mealsPerDay } = useMealPlan();
  const [nutrition, setNutrition] = useState<NutritionInfo | null>(meal.nutritionPerServing ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = nutritionTargets ?? DEFAULT_NUTRITION_TARGETS;
  const mpd = mealsPerDay || 3;
  const perMealTargets = getPerMealTargets(targets, mpd);

  const handleEstimate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<{ nutritionPerServing: NutritionInfo; tagsUpdated: string[] | null }>(
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

  const [portionScale, setPortionScale] = useState(100); // percentage: 50-200

  const scaled = useMemo(() => {
    if (!nutrition) return null;
    const s = portionScale / 100;
    return Object.fromEntries(
      DISPLAY_KEYS.map(({ key }) => [key, Math.round(nutrition[key] * s)])
    ) as Record<keyof NutritionInfo, number>;
  }, [nutrition, portionScale]);

  if (!nutrition || !scaled) return null;

  return (
    <div className="nutrition-section">
      <div className="nutrition-header">Geschätzte Nährwerte pro Portion</div>

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

      {/* Optimal serving recommendation */}
      {(() => {
        const M = calculateOptimalMultiplier(nutrition, perMealTargets);
        if (Math.abs(M - 1) <= 0.05) return null;
        const scaledKcal = Math.round(nutrition.kcal * M);
        const mPct = Math.round(M * 100 / 5) * 5;
        return (
          <div className="nutrition-recommendation" onClick={() => setPortionScale(Math.max(50, Math.min(200, mPct)))} style={{ cursor: 'pointer' }}>
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
