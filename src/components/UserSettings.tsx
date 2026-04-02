import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMealPlan } from '../context/MealPlanContext';
import { DEFAULT_NUTRITION_TARGETS } from '../types/index.js';
import type { NutritionTargets } from '../types/index.js';

export function UserSettings() {
  const { user, logout } = useAuth();
  const { defaultServings, setDefaultServings, nutritionTargets, setNutritionTargets, mealsPerDay, setMealsPerDay } = useMealPlan();

  const current = nutritionTargets ?? DEFAULT_NUTRITION_TARGETS;
  const [targets, setTargets] = useState<NutritionTargets>({ ...current });
  const [servings, setServings] = useState(defaultServings);
  const [mpd, setMpd] = useState(mealsPerDay);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      if (servings !== defaultServings) {
        await setDefaultServings(servings);
      }
      if (mpd !== mealsPerDay) {
        await setMealsPerDay(mpd);
      }
      await setNutritionTargets(targets);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setTargets({ ...DEFAULT_NUTRITION_TARGETS });
  };

  const isDefault = JSON.stringify(targets) === JSON.stringify(DEFAULT_NUTRITION_TARGETS);

  return (
    <div className="user-settings">
      <h2>Einstellungen</h2>

      {/* Profile */}
      <div className="settings-section">
        <h3>Profil</h3>
        <div className="settings-field">
          <label>E-Mail</label>
          <input className="input" type="text" value={user?.email ?? ''} disabled />
        </div>
        <div className="settings-field">
          <label>Standard-Portionen</label>
          <input
            className="input"
            type="number"
            min="1"
            value={servings}
            onChange={e => setServings(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ width: '80px' }}
          />
        </div>
        <div className="settings-field">
          <label>Mahlzeiten pro Tag</label>
          <input
            className="input"
            type="number"
            min="1"
            max="10"
            value={mpd}
            onChange={e => setMpd(Math.max(1, Math.min(10, parseInt(e.target.value) || 3)))}
            style={{ width: '80px' }}
          />
        </div>
      </div>

      {/* Nutrition targets */}
      <div className="settings-section">
        <h3>Nährwert-Ziele (pro Tag)</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Diese Werte werden als Referenz im Nährwert-Diagramm verwendet.
        </p>

        <div className="settings-nutrition-grid">
          {([
            { key: 'kcal' as const, label: 'Kalorien', unit: 'kcal' },
            { key: 'protein' as const, label: 'Protein', unit: 'g' },
            { key: 'carbs' as const, label: 'Kohlenhydrate', unit: 'g' },
            { key: 'fat' as const, label: 'Fett', unit: 'g' },
            { key: 'fiber' as const, label: 'Ballaststoffe', unit: 'g' },
          ]).map(({ key, label, unit }) => (
            <div key={key} className="settings-field">
              <label>{label} ({unit})</label>
              <input
                className="input"
                type="number"
                min="0"
                value={targets[key]}
                onChange={e => setTargets(prev => ({ ...prev, [key]: Math.max(0, parseInt(e.target.value) || 0) }))}
                style={{ width: '100px' }}
              />
            </div>
          ))}
        </div>

        {!isDefault && (
          <button className="btn btn-ghost btn-sm" onClick={handleReset} style={{ marginTop: '8px', fontSize: '12px' }}>
            Auf DGE-Empfehlung zurücksetzen
          </button>
        )}
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '16px' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Speichern...' : 'Speichern'}
        </button>
        {saved && <span style={{ color: 'var(--color-success)', fontSize: '13px' }}>Gespeichert!</span>}
      </div>

      {/* Logout */}
      <div className="settings-section" style={{ marginTop: '32px', borderTop: '1px solid var(--border-light)', paddingTop: '20px' }}>
        <button className="btn btn-muted" onClick={logout}>Abmelden</button>
      </div>
    </div>
  );
}
