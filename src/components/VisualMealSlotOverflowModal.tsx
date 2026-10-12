import React from 'react';
import { ModalPortal } from './Modal';
import { useMealPlan } from '../context/MealPlanContext';
import { MealCellItem } from './MealPlanTable';
import type { MealType, MealPlanEntry } from '../types/index.js';

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: 'Frühstück',
  lunch: 'Mittagessen',
  dinner: 'Abendessen',
  snacks: 'Snacks',
};

export interface VisualMealSlotOverflowModalProps {
  date: string;
  mealType: MealType;
  entries: MealPlanEntry[];
  onClose: () => void;
}

export const VisualMealSlotOverflowModal: React.FC<VisualMealSlotOverflowModalProps> = ({ date, mealType, entries, onClose }) => {
  const { allMealsForActivePlan } = useMealPlan();

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-content" style={{ maxWidth: '420px', width: '90%', padding: '16px' }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <strong style={{ color: 'var(--text-h)' }}>
              {MEAL_TYPE_LABELS[mealType] || mealType} · {date}
            </strong>
            <button className="btn-ghost" onClick={onClose} title="Schließen">✕</button>
          </div>
          {entries.map(entry => {
            const meal = allMealsForActivePlan.find(m => m.id === entry.mealId);
            if (!meal) return null;
            return <MealCellItem key={entry.id} entry={entry} meal={meal} />;
          })}
        </div>
      </div>
    </ModalPortal>
  );
};
