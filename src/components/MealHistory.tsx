import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useMealPlan } from '../context/MealPlanContext';
import type { Meal, Ingredient } from '../types/index.js';

interface DraggableMealCardProps {
  meal: Meal;
  onEdit: (meal: Meal) => void;
}

const DraggableMealCard: React.FC<DraggableMealCardProps> = ({ meal, onEdit }) => {
  const { toggleMealStar, deleteMeal } = useMealPlan();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: meal.id,
    data: { meal },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Rezept "${meal.name}" wirklich löschen?`)) {
      deleteMeal(meal.id);
    }
  };

  return (
    <div
      ref={setNodeRef}
      className="card card-draggable"
      style={{
        ...style,
        padding: '12px',
        marginBottom: '8px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div style={{ flex: 1, cursor: isDragging ? 'grabbing' : 'grab' }} {...listeners} {...attributes}>
        <div style={{ fontWeight: 'bold', marginBottom: '3px', color: 'var(--text-h)' }}>{meal.name}</div>
        <div style={{ fontSize: '12px', color: 'var(--text)' }}>
          {meal.ingredients.length} Zutaten • {meal.defaultServings} Person{meal.defaultServings !== 1 ? 'en' : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '2px' }}>
        <button
          className="btn-ghost"
          onClick={(e) => {
            e.stopPropagation();
            toggleMealStar(meal.id);
          }}
          style={{ fontSize: '18px' }}
          title={meal.starred ? 'Favorit entfernen' : 'Als Favorit markieren'}
        >
          {meal.starred ? '⭐' : '☆'}
        </button>
        <button
          className="btn-ghost"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(meal);
          }}
          style={{ fontSize: '16px', color: 'var(--accent)' }}
          title="Bearbeiten"
        >
          ✏️
        </button>
        <button
          className="btn-ghost"
          onClick={handleDelete}
          style={{ fontSize: '16px', color: 'var(--color-danger)' }}
          title="Löschen"
        >
          🗑️
        </button>
      </div>
    </div>
  );
};

interface EditMealModalProps {
  meal: Meal;
  onClose: () => void;
  onSave: (meal: Omit<Meal, 'id'>) => void;
}

const EditMealModal: React.FC<EditMealModalProps> = ({ meal, onClose, onSave }) => {
  const [name, setName] = useState(meal.name);
  const [recipeUrl, setRecipeUrl] = useState(meal.recipeUrl || '');
  const [servings, setServings] = useState(meal.defaultServings);
  const [comment, setComment] = useState(meal.comment || '');
  const [recipeText, setRecipeText] = useState(meal.recipeText || '');
  const [ingredients, setIngredients] = useState<Ingredient[]>(meal.ingredients);

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

    onSave({
      name: name.trim(),
      ingredients: validIngredients,
      defaultServings: servings,
      starred: meal.starred,
      recipeUrl: recipeUrl || undefined,
      comment: comment.trim() || undefined,
      recipeText: recipeText.trim() || undefined,
    });

    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '600px', width: '90%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0 }}>Rezept bearbeiten</h3>
            <button type="button" className="btn-ghost" onClick={onClose} style={{ fontSize: '24px' }}>
              ×
            </button>
          </div>

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
            <button type="button" className="btn btn-muted" onClick={onClose}>
              Abbrechen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const MealHistory: React.FC = () => {
  const { state, updateMeal } = useMealPlan();
  const [filter, setFilter] = useState<'all' | 'starred'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);

  const filteredMeals = state.meals.filter(meal => {
    if (filter === 'starred' && !meal.starred) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return meal.name.toLowerCase().includes(q) ||
        meal.ingredients.some(ing => ing.name.toLowerCase().includes(q));
    }
    return true;
  });

  // Sort: starred first, then alphabetically
  const sortedMeals = [...filteredMeals].sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="panel" style={{ height: '100%' }}>
      <h3 style={{ marginTop: 0, color: 'var(--text-h)' }}>Rezepte</h3>

      <div style={{ marginBottom: '15px', display: 'flex', gap: '8px' }}>
        <button
          className={`pill ${filter === 'all' ? 'pill-active' : ''}`}
          onClick={() => setFilter('all')}
        >
          Alle ({state.meals.length})
        </button>
        <button
          className={`pill ${filter === 'starred' ? 'pill-active' : ''}`}
          onClick={() => setFilter('starred')}
        >
          ⭐ Favoriten ({state.meals.filter(m => m.starred).length})
        </button>
      </div>

      <input
        className="input"
        type="text"
        placeholder="Rezept suchen..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{ width: '100%', marginBottom: '12px' }}
      />

      <div style={{ maxHeight: 'calc(100vh - 400px)', overflowY: 'auto' }}>
        {sortedMeals.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text)', padding: '20px' }}>
            {searchQuery.trim() ? 'Keine Treffer' : filter === 'starred' ? 'Keine Favoriten vorhanden' : 'Keine Rezepte vorhanden'}
          </div>
        ) : (
          sortedMeals.map(meal => (
            <DraggableMealCard
              key={meal.id}
              meal={meal}
              onEdit={(m) => setEditingMeal(m)}
            />
          ))
        )}
      </div>

      {editingMeal && (
        <EditMealModal
          meal={editingMeal}
          onClose={() => setEditingMeal(null)}
          onSave={(updatedMeal) => {
            updateMeal(editingMeal.id, updatedMeal);
            setEditingMeal(null);
          }}
        />
      )}
    </div>
  );
};
