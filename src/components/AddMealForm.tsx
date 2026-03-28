import React, { useState } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import { RecipeForm } from './RecipeForm';
import type { RecipeFormData } from './RecipeForm';

export const AddMealForm: React.FC = () => {
  const { state, addMeal, uploadMealPhoto, downloadMealPhotoFromUrl } = useMealPlan();
  const allUserTags = React.useMemo(() => state.meals.flatMap(m => m.tags || []), [state.meals]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const handleSubmit = async (data: RecipeFormData) => {
    const newMeal = await addMeal(data.meal);
    if (newMeal) {
      if (data.photoFile) {
        await uploadMealPhoto(newMeal.id, data.photoFile);
      } else if (data.remotePhotoUrl) {
        await downloadMealPhotoFromUrl(newMeal.id, data.remotePhotoUrl);
      }
    }
    setFormKey(k => k + 1);
    setIsExpanded(false);
  };

  return (
    <div className="panel" style={{ marginTop: '20px' }}>
      {!isExpanded ? (
        <button
          className="btn btn-primary btn-lg"
          onClick={() => setIsExpanded(true)}
          style={{ width: '100%' }}
        >
          + Neues Rezept hinzufügen
        </button>
      ) : (
        <>
          <h3 style={{ marginTop: 0 }}>Neues Rezept</h3>
          <RecipeForm
            key={formKey}
            allUserTags={allUserTags}
            onSubmit={handleSubmit}
            onCancel={() => setIsExpanded(false)}
            submitLabel="Speichern"
            showUrlParsing={true}
          />
        </>
      )}
    </div>
  );
};
