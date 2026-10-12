import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { useMealPlan } from '../context/MealPlanContext';
import { api } from '../api/client.js';
import { DEFAULT_NUTRITION_TARGETS } from '../types/index.js';
import type { NutritionTargets, NutritionInfo } from '../types/index.js';
import { NutritionCalculator } from './NutritionCalculator';
import { CoffeeSettings } from './CoffeeChip';
import { getDayEnergy, isHealthSource } from '../utils/nutritionCalculator';
import { SORT_OPTIONS } from '../utils/mealFilters';
import type { SortBy } from '../utils/mealFilters';

type SettingsTab = 'profile' | 'calculator' | 'weight';

function NutritionBackfill() {
  const { state } = useMealPlan();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });

  // Recipes estimated before portion weights existed only need the (cheaper) weight call —
  // the endpoint keeps the cached nutrition and just fills in what is missing.
  const missing = state.meals.filter(
    m => m.ingredients?.length > 0 && (!m.nutritionPerServing || !m.portionWeight)
  );

  const handleBackfill = async () => {
    setRunning(true);
    setProgress({ done: 0, total: missing.length, current: '' });

    for (let i = 0; i < missing.length; i++) {
      const meal = missing[i];
      setProgress({ done: i, total: missing.length, current: meal.name });
      try {
        await api.post<{ nutritionPerServing: NutritionInfo; portionWeight?: number; tagsUpdated: string[] | null }>(
          '/api/estimate-nutrition', { mealId: meal.id }
        );
      } catch {
        // Skip failures silently
      }
    }

    setProgress(prev => ({ ...prev, done: missing.length, current: '' }));
    setRunning(false);
    // Reload page to reflect all changes
    window.location.reload();
  };

  if (missing.length === 0) return null;

  return (
    <div className="settings-section" style={{ marginTop: '20px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
      <h3>Nährwerte berechnen</h3>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
        {missing.length} Rezept{missing.length !== 1 ? 'e' : ''} ohne vollständige Schätzung (Nährwerte oder Portionsgewicht).
      </p>
      {running ? (
        <div style={{ fontSize: '13px' }}>
          <div style={{ marginBottom: '6px' }}>{progress.done} / {progress.total} — {progress.current}</div>
          <div style={{ background: '#e9ecef', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
            <div style={{ background: 'var(--accent)', height: '100%', width: `${(progress.done / progress.total) * 100}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
      ) : (
        <button className="btn btn-muted" onClick={handleBackfill}>
          Alle Nährwerte berechnen
        </button>
      )}
    </div>
  );
}

function ProfileTab({ onOpenCalculator }: { onOpenCalculator: () => void }) {
  const { user, logout } = useAuth();
  const { defaultServings, setDefaultServings, nutritionTargets, setNutritionTargets, mealsPerDay, setMealsPerDay, nutritionLogEnabled, setNutritionLogEnabled, defaultRecipeSort, setDefaultRecipeSort, nutritionProfile, activity, sport, flexibleSportEnabled, today, todayTargets } = useMealPlan();
  // With a nutrition profile every day target is calculated (per weekday, Apple Health if on) —
  // the manual values are not used, so they are shown read-only with today's calculated values.
  const calculated = !!nutritionProfile;
  const todayFromHealth = !!nutritionProfile && isHealthSource(getDayEnergy(nutritionProfile, today, activity, sport));

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
      if (servings !== defaultServings) await setDefaultServings(servings);
      if (mpd !== mealsPerDay) await setMealsPerDay(mpd);
      if (!calculated) await setNutritionTargets(targets);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setTargets({ ...DEFAULT_NUTRITION_TARGETS });
  const isDefault = JSON.stringify(targets) === JSON.stringify(DEFAULT_NUTRITION_TARGETS);

  return (
    <>
      <div className="settings-section">
        <h3>Profil</h3>
        <div className="settings-field">
          <label>E-Mail</label>
          <input className="input" type="text" value={user?.email ?? ''} disabled />
        </div>
        <div className="settings-field">
          <label>Standard-Portionen</label>
          <input className="input" type="number" min="1" value={servings}
            onChange={e => setServings(parseInt(e.target.value) || 0)}
            onBlur={() => { if (!servings) setServings(1); }} style={{ width: '80px' }} />
        </div>
        <div className="settings-field">
          <label>Mahlzeiten pro Tag</label>
          <input className="input" type="number" min="1" max="10" value={mpd}
            onChange={e => setMpd(parseInt(e.target.value) || 0)}
            onBlur={() => { if (!mpd) setMpd(3); }} style={{ width: '80px' }} />
        </div>
      </div>

      <div className="settings-section">
        <h3>Nährwert-Ziele (pro Tag)</h3>
        {calculated ? (
          // Calculated per day — the manual fields below are not used, so show today's result instead.
          <div className="targets-summary">
            <div className="targets-summary-values">
              <span><strong>{todayTargets.kcal.toLocaleString('de-DE')}</strong> kcal</span>
              <span><strong>{todayTargets.protein}</strong> g Protein</span>
              <span><strong>{todayTargets.carbs}</strong> g KH</span>
              <span><strong>{todayTargets.fat}</strong> g Fett</span>
            </div>
            <p>
              Heute ({format(parseISO(today), 'EEEE', { locale: de })}), automatisch berechnet
              {todayFromHealth ? ' mit Apple Health' : flexibleSportEnabled ? ' mit flexiblem Sportmodus' : ' aus dem Wochenplan'} –
              jeder Tag hat sein eigenes Ziel.
            </p>
            <button type="button" className="btn btn-muted btn-sm" onClick={onOpenCalculator}>Im Ernährungsrechner anpassen →</button>
          </div>
        ) : (
        <>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Feste Ziele für jeden Tag. Im Ernährungsrechner kannst du sie stattdessen aus Körperdaten, Training und
          Apple Health pro Tag berechnen lassen.
        </p>
        <div className="settings-nutrition-grid">
          {([
            { key: 'kcal' as const, label: 'Kalorien', unit: 'kcal' },
            { key: 'protein' as const, label: 'Protein', unit: 'g' },
            { key: 'carbs' as const, label: 'Kohlenhydrate', unit: 'g' },
            { key: 'fat' as const, label: 'Fett', unit: 'g' },
            { key: 'fiber' as const, label: 'Ballaststoffe', unit: 'g' },
            { key: 'sugar' as const, label: 'Zug. Zucker (max.)', unit: 'g' },
          ]).map(({ key, label, unit }) => (
            <div key={key} className="settings-field">
              <label>{label} ({unit})</label>
              <input className="input" type="number" min="0" value={targets[key]}
                onChange={e => setTargets(prev => ({ ...prev, [key]: Math.max(0, parseInt(e.target.value) || 0) }))}
                style={{ width: '100px' }} />
            </div>
          ))}
        </div>
        {!isDefault && (
          <button className="btn btn-ghost btn-sm" onClick={handleReset} style={{ marginTop: '8px', fontSize: '12px' }}>
            Auf DGE-Empfehlung zurücksetzen
          </button>
        )}
        </>
        )}
      </div>

      <div className="settings-section">
        <h3>Nährwert-Log</h3>
        <label className="settings-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input type="checkbox" checked={nutritionLogEnabled} onChange={e => setNutritionLogEnabled(e.target.checked)} />
          <span>Nährwert-Log aktivieren</span>
        </label>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Zeichnet alle Mahlzeiten deiner Pläne bis einschließlich heute samt Nährwerten im Hintergrund auf – als Grundlage für den Monatsbericht. Änderungen am Plan werden übernommen; gelöschte Pläne bleiben im Bericht erhalten.
        </p>
      </div>

      <CoffeeSettings />

      <div className="settings-section">
        <h3>Rezepte</h3>
        <div className="settings-field">
          <label>Standard-Sortierung</label>
          <select className="input" value={defaultRecipeSort}
            onChange={e => setDefaultRecipeSort(e.target.value as SortBy)} style={{ width: '220px' }}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Gilt für die Rezeptverwaltung und die Rezeptauswahl im Plan. Wird sofort gespeichert.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '16px' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Speichern...' : 'Speichern'}
        </button>
        {saved && <span style={{ color: 'var(--color-success)', fontSize: '13px' }}>Gespeichert!</span>}
      </div>

      <NutritionBackfill />

      <div className="settings-section" style={{ marginTop: '32px', borderTop: '1px solid var(--border-light)', paddingTop: '20px' }}>
        <button className="btn btn-muted" onClick={logout}>Abmelden</button>
      </div>
    </>
  );
}

export function UserSettings() {
  const [tab, setTab] = useState<SettingsTab>('profile');

  return (
    <div className="user-settings">
      <div className="settings-tabs">
        <button className={`btn btn-ghost btn-sm ${tab === 'profile' ? 'btn-nav-active' : ''}`}
          onClick={() => setTab('profile')}>Allgemein</button>
        <button className={`btn btn-ghost btn-sm ${tab === 'calculator' ? 'btn-nav-active' : ''}`}
          onClick={() => setTab('calculator')}>Ernährungsrechner</button>
      </div>

      {tab === 'profile' && <ProfileTab onOpenCalculator={() => setTab('calculator')} />}
      {tab === 'calculator' && <NutritionCalculator />}
    </div>
  );
}
