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
      style={{
        ...style,
        padding: '10px',
        marginBottom: '8px',
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '6px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div style={{ flex: 1, cursor: isDragging ? 'grabbing' : 'grab' }} {...listeners} {...attributes}>
        <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>{meal.name}</div>
        <div style={{ fontSize: '12px', color: '#666' }}>
          {meal.ingredients.length} Zutaten • {meal.defaultServings} Person{meal.defaultServings !== 1 ? 'en' : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '5px' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMealStar(meal.id);
          }}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '18px',
          }}
          title={meal.starred ? 'Favorit entfernen' : 'Als Favorit markieren'}
        >
          {meal.starred ? '⭐' : '☆'}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(meal);
          }}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            color: '#2196F3',
          }}
          title="Bearbeiten"
        >
          ✏️
        </button>
        <button
          onClick={handleDelete}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            color: '#f44336',
          }}
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
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          maxWidth: '600px',
          maxHeight: '80vh',
          overflow: 'auto',
          width: '90%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>Rezept bearbeiten</h3>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: 'none',
                background: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '0 5px',
              }}
            >
              ×
            </button>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Rezept-URL:</label>
            <input
              type="url"
              value={recipeUrl}
              onChange={(e) => setRecipeUrl(e.target.value)}
              placeholder="https://..."
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Name:*</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Portionen:*</label>
            <input
              type="number"
              min="1"
              value={servings}
              onChange={(e) => setServings(parseInt(e.target.value) || 1)}
              required
              style={{ width: '100px', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Kommentar:</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optionale Notizen zum Rezept..."
              rows={3}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Zubereitung:</label>
            <textarea
              value={recipeText}
              onChange={(e) => setRecipeText(e.target.value)}
              placeholder="Optionale Zubereitungsschritte..."
              rows={6}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Zutaten:*</label>
            {ingredients.map((ing, index) => (
              <div key={index} style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                <input
                  type="text"
                  placeholder="Zutat"
                  value={ing.name}
                  onChange={(e) => handleIngredientChange(index, 'name', e.target.value)}
                  style={{
                    flex: 2,
                    padding: '6px',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    ...(ing.unit === 'Nach Belieben' ? { backgroundColor: '#ffebee', borderColor: '#f44336', color: '#c62828' } : {})
                  }}
                />
                <input
                  type="number"
                  placeholder="Menge"
                  value={ing.amount || ''}
                  onChange={(e) => handleIngredientChange(index, 'amount', parseFloat(e.target.value) || 0)}
                  style={{
                    flex: 1,
                    padding: '6px',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    ...(ing.unit === 'Nach Belieben' ? { backgroundColor: '#ffebee', borderColor: '#f44336', color: '#c62828' } : {})
                  }}
                />
                <input
                  type="text"
                  placeholder="Einheit"
                  value={ing.unit}
                  onChange={(e) => handleIngredientChange(index, 'unit', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    ...(ing.unit === 'Nach Belieben' ? { backgroundColor: '#ffebee', borderColor: '#f44336', color: '#c62828', fontWeight: 'bold' } : {})
                  }}
                />
                {ingredients.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveIngredient(index)}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: '#f44336',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    ✗
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddIngredient}
              style={{
                marginTop: '5px',
                padding: '6px 12px',
                backgroundColor: '#9e9e9e',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              + Zutat hinzufügen
            </button>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="submit"
              style={{
                padding: '10px 20px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Speichern
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                backgroundColor: '#9e9e9e',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
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
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);

  const filteredMeals = state.meals.filter(meal => {
    if (filter === 'starred') return meal.starred;
    return true;
  });

  // Sort: starred first, then alphabetically
  const sortedMeals = [...filteredMeals].sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div style={{ padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '8px', height: '100%' }}>
      <h3 style={{ marginTop: 0 }}>Rezepte</h3>

      <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
        <button
          onClick={() => setFilter('all')}
          style={{
            padding: '6px 12px',
            backgroundColor: filter === 'all' ? '#2196F3' : '#e0e0e0',
            color: filter === 'all' ? 'white' : 'black',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Alle ({state.meals.length})
        </button>
        <button
          onClick={() => setFilter('starred')}
          style={{
            padding: '6px 12px',
            backgroundColor: filter === 'starred' ? '#2196F3' : '#e0e0e0',
            color: filter === 'starred' ? 'white' : 'black',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          ⭐ Favoriten ({state.meals.filter(m => m.starred).length})
        </button>
      </div>

      <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
        {sortedMeals.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
            {filter === 'starred' ? 'Keine Favoriten vorhanden' : 'Keine Rezepte vorhanden'}
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
