import React, { useState } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import type { Ingredient } from '../types/index.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Parse recipe from URL using OpenAI backend
const parseRecipeFromURL = async (url: string): Promise<{ name: string; ingredientText: string; recipeText: string; servings: number }> => {
  const response = await fetch(`${API_URL}/api/parse-recipe-url`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Fehler beim Parsen der URL');
  }

  const data = await response.json();
  return { name: data.name, ingredientText: data.ingredientText, recipeText: data.recipeText, servings: data.servings };
};

// Parse ingredients from text using OpenAI backend
const parseIngredientsWithAI = async (ingredientText: string): Promise<{ ingredients: Ingredient[]; servings: number | null }> => {
  const response = await fetch(`${API_URL}/api/parse-ingredients`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ingredientText }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Fehler beim Parsen');
  }

  const data = await response.json();
  return { ingredients: data.ingredients, servings: data.servings };
};

export const AddMealForm: React.FC = () => {
  const { addMeal } = useMealPlan();
  const [isExpanded, setIsExpanded] = useState(false);
  const [recipeUrl, setRecipeUrl] = useState('');
  const [ingredientText, setIngredientText] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  // Manual form fields
  const [name, setName] = useState('');
  const [servings, setServings] = useState(2);
  const [comment, setComment] = useState('');
  const [recipeText, setRecipeText] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { name: '', amount: 0, unit: '' },
  ]);

  const handleParseFromURL = async () => {
    if (!recipeUrl.trim()) return;

    try {
      setIsParsing(true);
      const parsed = await parseRecipeFromURL(recipeUrl);

      if (parsed.ingredientText.trim()) {
        setName(parsed.name);
        setServings(parsed.servings);
        setIngredientText(parsed.ingredientText);
        setRecipeText(parsed.recipeText);
      } else {
        alert('Keine Zutaten gefunden. Bitte überprüfen Sie die URL.');
      }
    } catch (error) {
      alert('Fehler beim Parsen der URL: ' + (error instanceof Error ? error.message : 'Unbekannter Fehler'));
    } finally {
      setIsParsing(false);
    }
  };

  const handleParseIngredients = async () => {
    if (!ingredientText.trim()) return;

    try {
      setIsParsing(true);
      const parsed = await parseIngredientsWithAI(ingredientText);

      if (parsed.ingredients.length > 0) {
        setIngredients(parsed.ingredients);
        if (parsed.servings) {
          setServings(parsed.servings);
        }
      } else {
        alert('Keine Zutaten gefunden. Bitte überprüfen Sie den Text.');
      }
    } catch (error) {
      alert('Fehler beim Parsen der Zutaten: ' + (error instanceof Error ? error.message : 'Unbekannter Fehler'));
    } finally {
      setIsParsing(false);
    }
  };

  const handleAddIngredient = () => {
    setIngredients([...ingredients, { name: '', amount: 0, unit: '' }]);
  };

  const handleRemoveIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const handleIngredientChange = (index: number, field: keyof Ingredient, value: string | number) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setIngredients(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('Bitte geben Sie einen Namen ein');
      return;
    }

    const validIngredients = ingredients.filter(ing => ing.name.trim() && (ing.amount >= 0));

    if (validIngredients.length === 0) {
      alert('Bitte fügen Sie mindestens eine Zutat hinzu');
      return;
    }

    addMeal({
      name: name.trim(),
      ingredients: validIngredients,
      defaultServings: servings,
      starred: false,
      recipeUrl: recipeUrl || undefined,
      comment: comment.trim() || undefined,
      recipeText: recipeText.trim() || undefined,
    });

    // Reset form
    setName('');
    setRecipeUrl('');
    setIngredientText('');
    setComment('');
    setRecipeText('');
    setServings(2);
    setIngredients([{ name: '', amount: 0, unit: '' }]);
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
        <form onSubmit={handleSubmit}>
          <h3 style={{ marginTop: 0 }}>Neues Rezept</h3>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Rezept-URL:</label>
            <input
              className="input"
              type="url"
              value={recipeUrl}
              onChange={(e) => setRecipeUrl(e.target.value)}
              placeholder="https://..."
              style={{ width: '100%' }}
            />
            <button
              type="button"
              className="btn btn-warning"
              onClick={handleParseFromURL}
              disabled={!recipeUrl.trim() || isParsing}
              style={{ marginTop: '8px' }}
            >
              {isParsing ? '🤖 Parst...' : '🌐 Rezept von URL parsen'}
            </button>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Name:*</label>
            <input
              className="input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Portionen:*</label>
            <input
              className="input"
              type="number"
              min="1"
              value={servings}
              onChange={(e) => setServings(parseInt(e.target.value) || 1)}
              required
              style={{ width: '100px' }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Kommentar:</label>
            <textarea
              className="textarea"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optionale Notizen zum Rezept..."
              rows={3}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Zubereitung:</label>
            <textarea
              className="textarea"
              value={recipeText}
              onChange={(e) => setRecipeText(e.target.value)}
              placeholder="Optionale Zubereitungsschritte..."
              rows={6}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>ODER Zutatenliste einfügen:</label>
            <textarea
              className="textarea"
              value={ingredientText}
              onChange={(e) => setIngredientText(e.target.value)}
              placeholder={"Z.B.:\n2 Zwiebeln\n500g Tomaten\n3 Zehen Knoblauch\n2 EL Olivenöl"}
              rows={6}
              style={{ width: '100%' }}
            />
            <button
              type="button"
              className="btn btn-accent"
              onClick={handleParseIngredients}
              disabled={!ingredientText.trim() || isParsing}
              style={{ marginTop: '8px' }}
            >
              {isParsing ? '🤖 Parst...' : '📝 Text parsen'}
            </button>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Zutaten:*</label>
            {ingredients.map((ing, index) => (
              <div key={index} style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                <input
                  className="input"
                  type="text"
                  placeholder="Zutat"
                  value={ing.name}
                  onChange={(e) => handleIngredientChange(index, 'name', e.target.value)}
                  style={{
                    flex: 2,
                    ...(ing.unit === 'Nach Belieben' ? { backgroundColor: 'var(--color-danger-light)', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' } : {})
                  }}
                />
                <input
                  className="input"
                  type="number"
                  placeholder="Menge"
                  value={ing.amount || ''}
                  onChange={(e) => handleIngredientChange(index, 'amount', parseFloat(e.target.value) || 0)}
                  style={{
                    flex: 1,
                    ...(ing.unit === 'Nach Belieben' ? { backgroundColor: 'var(--color-danger-light)', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' } : {})
                  }}
                />
                <input
                  className="input"
                  type="text"
                  placeholder="Einheit"
                  value={ing.unit}
                  onChange={(e) => handleIngredientChange(index, 'unit', e.target.value)}
                  style={{
                    flex: 1,
                    ...(ing.unit === 'Nach Belieben' ? { backgroundColor: 'var(--color-danger-light)', borderColor: 'var(--color-danger)', color: 'var(--color-danger)', fontWeight: 'bold' } : {})
                  }}
                />
                {ingredients.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => handleRemoveIngredient(index)}
                  >
                    ✗
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="btn btn-muted btn-sm"
              onClick={handleAddIngredient}
              style={{ marginTop: '5px' }}
            >
              + Zutat hinzufügen
            </button>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" className="btn btn-primary">
              Speichern
            </button>
            <button type="button" className="btn btn-muted" onClick={() => setIsExpanded(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
