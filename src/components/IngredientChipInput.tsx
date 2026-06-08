import React, { useState, useMemo } from 'react';

interface IngredientChipInputProps {
  label: string;
  icon?: string;
  items: string[];
  /** Known ingredient names for autocomplete suggestions. */
  suggestions: string[];
  placeholder?: string;
  onChange: (items: string[]) => void;
}

/**
 * Chip/tag-style input for a list of ingredient names, with autocomplete from
 * a known vocabulary and a per-field "Leeren" (clear) button. Used for the
 * "Vorratskammer" and "Frische Zutaten" sections of the cook-from-pantry feature.
 */
export const IngredientChipInput: React.FC<IngredientChipInputProps> = ({
  label,
  icon,
  items,
  suggestions,
  placeholder,
  onChange,
}) => {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const selectedLower = useMemo(() => new Set(items.map(i => i.toLowerCase().trim())), [items]);

  const filteredSuggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    const available = suggestions.filter(s => !selectedLower.has(s.toLowerCase().trim()));
    const matches = q ? available.filter(s => s.toLowerCase().includes(q)) : available;
    return matches.slice(0, 30);
  }, [input, suggestions, selectedLower]);

  const addItem = (value: string) => {
    const v = value.trim();
    if (!v) return;
    if (!selectedLower.has(v.toLowerCase())) {
      onChange([...items, v]);
    }
    setInput('');
    setShowSuggestions(false);
  };

  const removeItem = (value: string) => {
    onChange(items.filter(i => i !== value));
  };

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-h)' }}>
          {icon ? `${icon} ` : ''}{label} ({items.length})
        </label>
        {items.length > 0 && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onChange([])}
            style={{ fontSize: '12px', color: 'var(--color-danger)', padding: '2px 6px' }}
          >
            Leeren
          </button>
        )}
      </div>

      {items.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
          {items.map(item => (
            <button
              key={item}
              type="button"
              className="pill pill-active"
              onClick={() => removeItem(item)}
              style={{ fontSize: '12px', padding: '2px 8px' }}
              title="Entfernen"
            >
              {item} ✗
            </button>
          ))}
        </div>
      )}

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
              if (input.trim()) addItem(input);
            }
          }}
          placeholder={placeholder || `${label} hinzufügen...`}
          style={{ width: '100%', fontSize: '13px', padding: '6px 8px' }}
        />
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
            background: 'var(--surface-0)', border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)',
            maxHeight: '180px', overflowY: 'auto',
          }}>
            {filteredSuggestions.map(s => (
              <div
                key={s}
                onMouseDown={(e) => { e.preventDefault(); addItem(s); }}
                style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '13px' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {s}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
