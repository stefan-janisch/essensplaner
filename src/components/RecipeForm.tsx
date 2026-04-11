import React, { useState, useRef, useMemo } from 'react';
import { RECIPE_CATEGORIES } from '../constants/categories';
import { TAG_GROUPS, parseTag, formatTag } from '../constants/tags';
import type { Meal, Ingredient } from '../types/index.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function parseRecipeFromURL(url: string, existingTags: string[]): Promise<{
  name: string; ingredientText: string; recipeText: string; servings: number;
  photoUrl?: string; category?: string; tags?: string[]; prepTime?: number; totalTime?: number;
}> {
  const response = await fetch(`${API_URL}/api/parse-recipe-url`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, existingTags }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Fehler beim Parsen der URL');
  }
  return response.json();
}

async function cleanRecipeText(recipeText: string): Promise<string> {
  const response = await fetch(`${API_URL}/api/clean-recipe-text`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipeText }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Fehler beim Bereinigen');
  }
  const data = await response.json();
  return data.cleanedText;
}

async function parseIngredientsWithAI(ingredientText: string): Promise<{ ingredients: Ingredient[]; shoppingIngredients: Ingredient[]; servings: number | null }> {
  const response = await fetch(`${API_URL}/api/parse-ingredients`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ingredientText }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Fehler beim Parsen');
  }
  return response.json();
}

export interface RecipeFormData {
  meal: Omit<Meal, 'id'>;
  photoFile?: File | null;
  deletePhoto?: boolean;
  remotePhotoUrl?: string;
}

interface RecipeFormProps {
  initialData?: Partial<Meal>;
  allUserTags?: string[];
  formId?: string;
  onSubmit: (data: RecipeFormData) => void;
  onCancel?: () => void;
  submitLabel?: string;
  showUrlParsing?: boolean;
}

// --- Tag Group Selector with autocomplete ---
function TagGroupSelector({
  groupKey,
  label,
  predefinedValues,
  selectedTags,
  allKnownValues,
  onToggle,
  onAdd,
  onRemove,
}: {
  groupKey: string;
  label: string;
  predefinedValues: string[];
  selectedTags: string[];
  allKnownValues: string[];
  onToggle: (tag: string) => void;
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const selectedValues = selectedTags
    .map(t => parseTag(t))
    .filter(p => p && p.key === groupKey)
    .map(p => p!.value);

  // Merge predefined + custom values from user's existing recipes
  const allValues = useMemo(() => {
    const set = new Set([...predefinedValues, ...allKnownValues]);
    return [...set].sort();
  }, [predefinedValues, allKnownValues]);

  const filteredSuggestions = input.trim()
    ? allValues.filter(v => v.toLowerCase().includes(input.toLowerCase()) && !selectedValues.includes(v))
    : allValues.filter(v => !selectedValues.includes(v));

  const handleAddCustom = (value: string) => {
    const v = value.trim().toLowerCase();
    if (v && !selectedValues.includes(v)) {
      onAdd(formatTag(groupKey, v));
    }
    setInput('');
    setShowSuggestions(false);
  };

  return (
    <div style={{ marginBottom: '10px' }}>
      <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 500, color: 'var(--text-h)' }}>{label}:</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
        {predefinedValues.map(value => {
          const tag = formatTag(groupKey, value);
          const isSelected = selectedTags.includes(tag);
          return (
            <button
              key={value}
              type="button"
              className={`pill ${isSelected ? 'pill-active' : ''}`}
              onClick={() => onToggle(tag)}
              style={{ fontSize: '12px', padding: '2px 8px' }}
            >
              {value}
            </button>
          );
        })}
        {/* Custom selected values not in predefined */}
        {selectedValues.filter(v => !predefinedValues.includes(v)).map(value => {
          const tag = formatTag(groupKey, value);
          return (
            <button
              key={value}
              type="button"
              className="pill pill-active"
              onClick={() => onRemove(tag)}
              style={{ fontSize: '12px', padding: '2px 8px' }}
            >
              {value} ✗
            </button>
          );
        })}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          className="input"
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (input.trim()) handleAddCustom(input);
            }
          }}
          placeholder={`${label} hinzufügen...`}
          style={{ width: '100%', fontSize: '12px', padding: '4px 8px' }}
        />
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
            background: 'var(--surface-0)', border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)',
            maxHeight: '150px', overflowY: 'auto',
          }}>
            {filteredSuggestions.map(v => (
              <div
                key={v}
                onMouseDown={(e) => { e.preventDefault(); handleAddCustom(v); }}
                style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-h)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {v}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const RecipeForm: React.FC<RecipeFormProps> = ({
  initialData,
  allUserTags = [],
  formId,
  onSubmit,
  onCancel,
  submitLabel = 'Speichern',
  showUrlParsing = true,
}) => {
  const [recipeUrl, setRecipeUrl] = useState(initialData?.recipeUrl || '');
  const [ingredientText, setIngredientText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);

  const [name, setName] = useState(initialData?.name || '');
  const [servings, setServings] = useState(initialData?.defaultServings || 2);
  const [comment, setComment] = useState(initialData?.comment || '');
  const [recipeText, setRecipeText] = useState(initialData?.recipeText || '');
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    initialData?.ingredients?.length ? initialData.ingredients : [{ name: '', amount: 0, unit: '' }]
  );
  const [shoppingIngredients, setShoppingIngredients] = useState<Ingredient[]>(
    initialData?.shoppingIngredients?.length ? initialData.shoppingIngredients : []
  );

  const [category, setCategory] = useState(initialData?.category || '');
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [rating, setRating] = useState<number>(initialData?.rating || 0);
  const [prepTime, setPrepTime] = useState<number | ''>(initialData?.prepTime || '');
  const [totalTime, setTotalTime] = useState<number | ''>(initialData?.totalTime || '');

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    initialData?.photoUrl ? `${API_URL}${initialData.photoUrl}` : null
  );
  const [deletePhoto, setDeletePhoto] = useState(false);
  const [remotePhotoUrl, setRemotePhotoUrl] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Collect known custom values per tag group from all user tags
  const knownValuesByGroup = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const tag of allUserTags) {
      const parsed = parseTag(tag);
      if (parsed) {
        if (!map[parsed.key]) map[parsed.key] = [];
        if (!map[parsed.key].includes(parsed.value)) map[parsed.key].push(parsed.value);
      }
    }
    return map;
  }, [allUserTags]);

  // Unstructured tags (backward compat)
  const unstructuredTags = tags.filter(t => !parseTag(t));

  const handleParseFromURL = async () => {
    if (!recipeUrl.trim()) return;
    try {
      setIsParsing(true);
      const parsed = await parseRecipeFromURL(recipeUrl, allUserTags);
      if (parsed.ingredientText.trim()) {
        if (!name.trim()) setName(parsed.name);
        if (servings === 2 || !servings) setServings(parsed.servings);
        setIngredientText(parsed.ingredientText);
        if (!recipeText.trim()) setRecipeText(parsed.recipeText);
        if (!category && parsed.category) setCategory(parsed.category);
        if (tags.length === 0 && parsed.tags?.length) setTags(parsed.tags);
        if (!prepTime && parsed.prepTime) setPrepTime(parsed.prepTime);
        if (!totalTime && parsed.totalTime) setTotalTime(parsed.totalTime);
        if (!photoPreview && parsed.photoUrl) {
          setRemotePhotoUrl(parsed.photoUrl);
          setPhotoPreview(parsed.photoUrl);
          setPhotoFile(null);
          setDeletePhoto(false);
        }
        // Auto-clean recipe text
        if (parsed.recipeText?.trim()) {
          try {
            const cleaned = await cleanRecipeText(parsed.recipeText);
            setRecipeText(cleaned);
          } catch {
            // Cleaning failed — keep the raw text
          }
        }
        // Auto-parse ingredients (dual lists)
        try {
          const parsedIngs = await parseIngredientsWithAI(parsed.ingredientText);
          if (parsedIngs.ingredients.length > 0) {
            setIngredients(parsedIngs.ingredients);
            setShoppingIngredients(parsedIngs.shoppingIngredients || []);
            if (parsedIngs.servings && (servings === 2 || !servings)) setServings(parsedIngs.servings);
          }
        } catch {
          // Ingredient parsing failed — user can still parse manually
        }
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
        setShoppingIngredients(parsed.shoppingIngredients || []);
        if (parsed.servings) setServings(parsed.servings);
      } else {
        alert('Keine Zutaten gefunden. Bitte überprüfen Sie den Text.');
      }
    } catch (error) {
      alert('Fehler beim Parsen der Zutaten: ' + (error instanceof Error ? error.message : 'Unbekannter Fehler'));
    } finally {
      setIsParsing(false);
    }
  };

  const handleCleanRecipeText = async () => {
    if (!recipeText.trim()) return;
    try {
      setIsCleaning(true);
      const cleaned = await cleanRecipeText(recipeText);
      setRecipeText(cleaned);
    } catch (error) {
      alert('Fehler beim Bereinigen: ' + (error instanceof Error ? error.message : 'Unbekannter Fehler'));
    } finally {
      setIsCleaning(false);
    }
  };

  const handleAddIngredient = () => setIngredients([...ingredients, { name: '', amount: 0, unit: '' }]);
  const handleRemoveIngredient = (index: number) => setIngredients(ingredients.filter((_, i) => i !== index));
  const handleIngredientChange = (index: number, field: keyof Ingredient, value: string | number) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setIngredients(updated);
  };

  const handleAddShoppingIngredient = () => setShoppingIngredients([...shoppingIngredients, { name: '', amount: 0, unit: '' }]);
  const handleRemoveShoppingIngredient = (index: number) => setShoppingIngredients(shoppingIngredients.filter((_, i) => i !== index));
  const handleShoppingIngredientChange = (index: number, field: keyof Ingredient, value: string | number) => {
    const updated = [...shoppingIngredients];
    updated[index] = { ...updated[index], [field]: value };
    setShoppingIngredients(updated);
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); setDeletePhoto(false); setRemotePhotoUrl(undefined); }
  };
  const handlePhotoRemove = () => {
    setPhotoFile(null); setPhotoPreview(null); setDeletePhoto(true); setRemotePhotoUrl(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleTag = (tag: string) => {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };
  const addTag = (tag: string) => {
    if (!tags.includes(tag)) setTags(prev => [...prev, tag]);
  };
  const removeTag = (tag: string) => setTags(prev => prev.filter(t => t !== tag));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { alert('Bitte geben Sie einen Namen ein'); return; }
    const validIngredients = ingredients.filter(ing => ing.name.trim() && ing.amount >= 0);
    if (validIngredients.length === 0) { alert('Bitte fügen Sie mindestens eine Zutat hinzu'); return; }
    const validShoppingIngredients = shoppingIngredients.filter(ing => ing.name.trim() && ing.amount >= 0);

    onSubmit({
      meal: {
        name: name.trim(),
        ingredients: validIngredients,
        shoppingIngredients: validShoppingIngredients.length > 0 ? validShoppingIngredients : undefined,
        defaultServings: servings,
        starred: initialData?.starred ?? false,
        recipeUrl: recipeUrl || undefined,
        comment: comment.trim() || undefined,
        recipeText: recipeText.trim() || undefined,
        category: category || undefined,
        tags: tags.length > 0 ? tags : undefined,
        rating: rating > 0 ? rating : undefined,
        prepTime: prepTime ? Number(prepTime) : undefined,
        totalTime: totalTime ? Number(totalTime) : undefined,
      },
      photoFile, deletePhoto, remotePhotoUrl,
    });
  };

  return (
    <form id={formId} onSubmit={handleSubmit}>
      {showUrlParsing && (
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Rezept-URL:</label>
          <input className="input" type="url" value={recipeUrl} onChange={(e) => setRecipeUrl(e.target.value)} placeholder="https://..." style={{ width: '100%' }} />
          <button type="button" className="btn btn-warning" onClick={handleParseFromURL} disabled={!recipeUrl.trim() || isParsing} style={{ marginTop: '8px', display: 'block', marginLeft: 'auto', marginRight: 'auto' }}>
            {isParsing ? '🤖 Parst...' : '🌐 Rezept von URL parsen'}
          </button>
        </div>
      )}

      {/* Photo */}
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>Foto:</label>
        {photoPreview && (
          <div style={{ marginBottom: '8px', position: 'relative', display: 'inline-block' }}>
            <img src={photoPreview} alt="Rezeptfoto" style={{ maxWidth: '200px', maxHeight: '150px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />
            <button type="button" className="btn btn-danger btn-sm" onClick={handlePhotoRemove} style={{ position: 'absolute', top: '4px', right: '4px' }}>✗</button>
          </div>
        )}
        <div>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoSelect} style={{ display: 'none' }} />
          <button type="button" className="btn btn-muted" onClick={() => fileInputRef.current?.click()} style={{ display: 'block', marginLeft: 'auto', marginRight: 'auto' }}>{photoPreview ? 'Foto ändern' : 'Foto hochladen'}</button>
        </div>
      </div>

      {/* Name */}
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>Name:*</label>
        <input className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} required style={{ width: '100%' }} />
      </div>

      {/* Category */}
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>Kategorie:</label>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: '100%' }}>
          <option value="">Keine Kategorie</option>
          {RECIPE_CATEGORIES.map(cat => (<option key={cat.value} value={cat.value}>{cat.label}</option>))}
        </select>
      </div>

      {/* Structured Tags */}
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>Tags:</label>
        {TAG_GROUPS.map(group => (
          <TagGroupSelector
            key={group.key}
            groupKey={group.key}
            label={group.label}
            predefinedValues={group.values as unknown as string[]}
            selectedTags={tags}
            allKnownValues={knownValuesByGroup[group.key] || []}
            onToggle={toggleTag}
            onAdd={addTag}
            onRemove={removeTag}
          />
        ))}
        {unstructuredTags.length > 0 && (
          <div style={{ marginTop: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text)' }}>Sonstige: </span>
            {unstructuredTags.map(tag => (
              <button
                key={tag}
                type="button"
                className="pill pill-active"
                onClick={() => removeTag(tag)}
                style={{ fontSize: '12px', padding: '2px 8px' }}
              >
                {tag} ✗
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Servings + Times + Rating */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '15px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '5px' }}>Portionen:*</label>
          <input className="input" type="number" min="1" value={servings} onChange={(e) => setServings(parseInt(e.target.value) || 0)} onBlur={() => { if (!servings) setServings(1); }} required style={{ width: '80px' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '5px' }}>Aktive Zeit:</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input className="input" type="number" min="0" step="5" value={prepTime} onChange={(e) => setPrepTime(e.target.value ? parseInt(e.target.value) : '')} style={{ width: '70px' }} placeholder="—" />
            <span style={{ fontSize: '12px', color: 'var(--text)' }}>Min.</span>
          </div>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '5px' }}>Gesamtzeit:</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input className="input" type="number" min="0" step="5" value={totalTime} onChange={(e) => setTotalTime(e.target.value ? parseInt(e.target.value) : '')} style={{ width: '70px' }} placeholder="—" />
            <span style={{ fontSize: '12px', color: 'var(--text)' }}>Min.</span>
          </div>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '5px' }}>Bewertung:</label>
          <div className="rating-stars rating-stars-interactive">
            {[1, 2, 3, 4, 5].map(star => (
              <span key={star} onClick={() => setRating(rating === star ? 0 : star)} style={{ cursor: 'pointer', fontSize: '22px' }}>
                {star <= rating ? '★' : '☆'}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Comment */}
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>Kommentar:</label>
        <textarea className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optionale Notizen zum Rezept..." rows={3} style={{ width: '100%' }} />
      </div>

      {/* Recipe text */}
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>Zubereitung:</label>
        <textarea className="textarea" value={recipeText} onChange={(e) => setRecipeText(e.target.value)} placeholder="Optionale Zubereitungsschritte..." rows={6} style={{ width: '100%' }} />
        <button type="button" className="btn btn-warning" onClick={handleCleanRecipeText} disabled={!recipeText.trim() || isCleaning} style={{ marginTop: '8px', display: 'block', marginLeft: 'auto', marginRight: 'auto' }}>
          {isCleaning ? '🤖 Räumt auf...' : '✨ Aufräumen'}
        </button>
      </div>

      {/* Ingredient text parsing */}
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>ODER Zutatenliste einfügen:</label>
        <textarea className="textarea" value={ingredientText} onChange={(e) => setIngredientText(e.target.value)} placeholder={"Z.B.:\n2 Zwiebeln\n500g Tomaten\n3 Zehen Knoblauch\n2 EL Olivenöl"} rows={6} style={{ width: '100%' }} />
        <button type="button" className="btn btn-accent" onClick={handleParseIngredients} disabled={!ingredientText.trim() || isParsing} style={{ marginTop: '8px', display: 'block', marginLeft: 'auto', marginRight: 'auto' }}>
          {isParsing ? '🤖 Parst...' : '📝 Zutaten parsen'}
        </button>
      </div>

      {/* Ingredients — side by side: display + shopping */}
      <div className="ingredient-columns" style={{ marginBottom: '15px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
        {/* Display ingredients (verbatim from recipe) */}
        <div>
          <label style={{ display: 'block', marginBottom: '5px' }}>Rezept-Zutaten:*</label>
          {ingredients.map((ing, index) => (
            <div key={index} style={{ display: 'flex', gap: '3px', marginBottom: '4px' }}>
              <input className="input" type="text" placeholder="Zutat" value={ing.name} onChange={(e) => handleIngredientChange(index, 'name', e.target.value)}
                style={{ flex: 2, ...(ing.unit === 'NB' || ing.unit === 'Nach Belieben' ? { backgroundColor: 'var(--color-danger-light)', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' } : {}) }} />
              <input className="input ing-amount" type="number" placeholder="Menge" value={ing.amount || ''} onChange={(e) => handleIngredientChange(index, 'amount', parseFloat(e.target.value) || 0)}
                style={{ flex: 0, width: '65px', minWidth: '65px', ...(ing.unit === 'NB' || ing.unit === 'Nach Belieben' ? { backgroundColor: 'var(--color-danger-light)', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' } : {}) }} />
              <input className="input ing-unit" type="text" placeholder="Einh." value={ing.unit} onChange={(e) => handleIngredientChange(index, 'unit', e.target.value)}
                onFocus={(e) => { const el = e.target; setTimeout(() => el.select()); }}
                style={{ flex: 0, width: '55px', minWidth: '55px', ...(ing.unit === 'NB' || ing.unit === 'Nach Belieben' ? { backgroundColor: 'var(--color-danger-light)', borderColor: 'var(--color-danger)', color: 'var(--color-danger)', fontWeight: 'bold' } : {}) }} />
              {ingredients.length > 1 && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => handleRemoveIngredient(index)} style={{ padding: '2px 6px' }}>✗</button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-muted btn-sm" onClick={handleAddIngredient} style={{ marginTop: '5px' }}>+ Zutat</button>
        </div>

        {/* Shopping ingredients (normalized for shopping list) */}
        <div>
          <label style={{ display: 'block', marginBottom: '5px' }}>Einkaufslisten-Zutaten:</label>
          {(shoppingIngredients.length > 0 ? shoppingIngredients : [{ name: '', amount: 0, unit: '' }]).map((ing, index) => (
            <div key={index} style={{ display: 'flex', gap: '3px', marginBottom: '4px' }}>
              <input className="input" type="text" placeholder="Zutat" value={ing.name} onChange={(e) => {
                if (shoppingIngredients.length === 0) setShoppingIngredients([{ name: e.target.value, amount: 0, unit: '' }]);
                else handleShoppingIngredientChange(index, 'name', e.target.value);
              }}
                style={{ flex: 2, ...(ing.unit === 'NB' || ing.unit === 'Nach Belieben' ? { backgroundColor: 'var(--color-danger-light)', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' } : {}) }} />
              <input className="input ing-amount" type="number" placeholder="Menge" value={ing.amount || ''} onChange={(e) => {
                if (shoppingIngredients.length === 0) setShoppingIngredients([{ name: '', amount: parseFloat(e.target.value) || 0, unit: '' }]);
                else handleShoppingIngredientChange(index, 'amount', parseFloat(e.target.value) || 0);
              }}
                style={{ flex: 0, width: '65px', minWidth: '65px', ...(ing.unit === 'NB' || ing.unit === 'Nach Belieben' ? { backgroundColor: 'var(--color-danger-light)', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' } : {}) }} />
              <input className="input ing-unit" type="text" placeholder="Einh." value={ing.unit} onChange={(e) => {
                if (shoppingIngredients.length === 0) setShoppingIngredients([{ name: '', amount: 0, unit: e.target.value }]);
                else handleShoppingIngredientChange(index, 'unit', e.target.value);
              }}
                onFocus={(e) => { const el = e.target; setTimeout(() => el.select()); }}
                style={{ flex: 0, width: '55px', minWidth: '55px', ...(ing.unit === 'NB' || ing.unit === 'Nach Belieben' ? { backgroundColor: 'var(--color-danger-light)', borderColor: 'var(--color-danger)', color: 'var(--color-danger)', fontWeight: 'bold' } : {}) }} />
              {shoppingIngredients.length > 1 && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => handleRemoveShoppingIngredient(index)} style={{ padding: '2px 6px' }}>✗</button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-muted btn-sm" onClick={handleAddShoppingIngredient} style={{ marginTop: '5px' }}>+ Zutat</button>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
        <button type="submit" className="btn btn-primary">{submitLabel}</button>
        {onCancel && (<button type="button" className="btn btn-muted" onClick={onCancel}>Abbrechen</button>)}
      </div>
    </form>
  );
};
