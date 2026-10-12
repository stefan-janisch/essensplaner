import type { Meal } from '../types/index.js';
import { COLOR_HEX } from '../utils/nutritionColors';
import { computeNutritionScore, getScoreColor, computeProteinDensity, formatProteinDensity } from '../utils/nutritionScore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Compact list row for the recipe sidebar: thumbnail, title and the few numbers that matter
 * when choosing (kcal/protein per serving, time, score, protein density).
 * With `dragHandleProps` the thumbnail is the drag handle, like the photo on the big cards.
 */
export function RecipeRow({ meal, onClick, hideNutrition, requiredProteinDensity, dragHandleProps }: {
  meal: Meal;
  onClick: () => void;
  hideNutrition?: boolean;
  /** Protein density the target day needs — badge turns green (fits) or fades (too low). */
  requiredProteinDensity?: number;
  dragHandleProps?: Record<string, unknown>;
}) {
  const n = meal.nutritionPerServing;
  const score = computeNutritionScore(n);
  const proteinDensity = computeProteinDensity(n);
  const time = meal.totalTime || meal.prepTime;

  const meta: string[] = [];
  if (n) meta.push(`${Math.round(n.kcal)} kcal`, `${Math.round(n.protein)} g Protein`);
  if (time) meta.push(`⏱ ${time} Min.`);

  const densityClass = requiredProteinDensity === undefined || proteinDensity === null
    ? ''
    : proteinDensity >= requiredProteinDensity ? ' recipe-row-badge-fits' : ' recipe-row-badge-short';

  return (
    <div
      className="recipe-row"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <div
        className="recipe-row-thumb"
        style={dragHandleProps ? { cursor: 'grab', touchAction: 'none' } : undefined}
        onClick={dragHandleProps ? (e) => e.stopPropagation() : undefined}
        title={dragHandleProps ? 'Ziehen um einzuplanen' : undefined}
        {...dragHandleProps}
      >
        {meal.photoUrl ? (
          <img src={`${API_URL}${meal.photoUrl}`} alt="" loading="lazy" style={{ pointerEvents: 'none' }} />
        ) : (
          <div className="recipe-card-photo-placeholder" aria-hidden="true" />
        )}
      </div>
      <div className="recipe-row-body">
        <div className="recipe-row-title">
          {meal.starred && <span className="recipe-row-star" title="Favorit">★ </span>}
          {meal.name}
        </div>
        {meta.length > 0 && <div className="recipe-row-meta" title={n ? 'Nährwerte pro Portion' : undefined}>{meta.join(' · ')}</div>}
      </div>
      {!hideNutrition && (proteinDensity !== null || score !== null) && (
        <div className="recipe-row-badges">
          {proteinDensity !== null && (
            <span className={`recipe-row-badge recipe-row-badge-protein${densityClass}`}
              title={`${formatProteinDensity(proteinDensity)} g Protein pro 100 kcal`}>
              {formatProteinDensity(proteinDensity)}
            </span>
          )}
          {score !== null && (
            <span className="recipe-row-badge" style={{ backgroundColor: COLOR_HEX[getScoreColor(score)] }}
              title={`Nährwert-Score: ${score}/100`}>
              {score}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
