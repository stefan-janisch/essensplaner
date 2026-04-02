import { useState } from 'react';
import { api } from '../api/client.js';
import { useMealPlan } from '../context/MealPlanContext';
import type { Meal, NutritionInfo } from '../types/index.js';
import { DEFAULT_NUTRITION_TARGETS } from '../types/index.js';

interface NutritionTableProps {
  meal: Meal;
  onTagsUpdated?: (tags: string[]) => void;
}

const NUTRITION_KEYS: { key: keyof NutritionInfo; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Kalorien', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Kohlenh.', unit: 'g' },
  { key: 'fat', label: 'Fett', unit: 'g' },
  { key: 'fiber', label: 'Ballast.', unit: 'g' },
];

const BAR_COLORS = {
  low: '#ffa94d',    // orange — under 50%
  good: '#51cf66',   // green — 50-130%
  high: '#ff6b6b',   // red — over 130%
};

// Protein and fiber: more is better (over 100% stays green)
const MORE_IS_BETTER: Set<keyof NutritionInfo> = new Set(['protein', 'fiber']);

function getBarColor(percent: number, key: keyof NutritionInfo): string {
  if (percent < 50) return BAR_COLORS.low;
  if (percent <= 130 || MORE_IS_BETTER.has(key)) return BAR_COLORS.good;
  return BAR_COLORS.high;
}

export function NutritionTable({ meal, onTagsUpdated }: NutritionTableProps) {
  const { nutritionTargets, mealsPerDay } = useMealPlan();
  const [nutrition, setNutrition] = useState<NutritionInfo | null>(meal.nutritionPerServing ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = nutritionTargets ?? DEFAULT_NUTRITION_TARGETS;
  const mpd = mealsPerDay || 3;
  const perMealTargets: NutritionInfo = {
    kcal: Math.round(targets.kcal / mpd),
    protein: Math.round(targets.protein / mpd),
    carbs: Math.round(targets.carbs / mpd),
    fat: Math.round(targets.fat / mpd),
    fiber: Math.round(targets.fiber / mpd),
  };

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

  if (!nutrition) return null;

  return (
    <div className="nutrition-section">
      <div className="nutrition-header">Geschätzte Nährwerte pro Portion</div>

      {/* Number grid */}
      <div className="nutrition-grid">
        {NUTRITION_KEYS.map(({ key, label, unit }) => (
          <div key={key} className="nutrition-item">
            <div className="nutrition-value">
              {nutrition[key]}{key !== 'kcal' && <span className="nutrition-unit">{unit}</span>}
            </div>
            <div className="nutrition-label">{key === 'kcal' ? 'kcal' : label}</div>
          </div>
        ))}
      </div>

      {/* Bar chart — actual vs target per meal */}
      <div className="nutrition-bar-chart">
        {NUTRITION_KEYS.map(({ key, label }) => {
          const target = perMealTargets[key];
          const actual = nutrition[key];
          const percent = target > 0 ? Math.round((actual / target) * 100) : 0;
          const barWidth = Math.min(percent, 200); // cap at 200%

          return (
            <div key={key} className="nutrition-bar-row">
              <div className="nutrition-bar-label">{label}</div>
              <div className="nutrition-bar-track">
                <div
                  className="nutrition-bar-fill"
                  style={{ width: `${barWidth / 2}%`, backgroundColor: getBarColor(percent, key) }}
                />
                <div className="nutrition-bar-target" />
              </div>
              <div className="nutrition-bar-percent">{percent}%</div>
            </div>
          );
        })}
      </div>

      <div className="nutrition-disclaimer">
        Schätzwerte — können von tatsächlichen Nährwerten abweichen. Balken zeigen Anteil an der empfohlenen Menge pro Mahlzeit (1/{mpd} Tagesbedarf).
      </div>
    </div>
  );
}
