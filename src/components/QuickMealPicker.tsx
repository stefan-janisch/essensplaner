import { useEffect, useMemo, useState } from 'react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { api } from '../api/client';
import { useMealPlan } from '../context/MealPlanContext';
import { useAuth } from '../context/AuthContext';
import { useCanteensOnDate } from '../hooks/useCanteensOnDate';
import { useIsMobile } from '../hooks/useIsMobile';
import type { Meal } from '../types/index.js';
import { canteensLabel, type CanteenKey } from '../utils/canteens';
import { computeProteinDensity, formatProteinDensity } from '../utils/nutritionScore';
import { ModalPortal } from './Modal';
import { QuickMealForm } from './QuickMealDialog';

type Usage = Record<string, { lastDate: string; count: number }>;
type Tab = 'favorites' | 'recent';
type Sort = 'default' | 'protein' | 'density' | 'kcal';

const SORT_LABELS: Record<Sort, string> = {
  default: 'Standard',
  protein: 'Protein ↓',
  density: 'Proteindichte ↓',
  kcal: 'kcal ↑',
};
type View = { kind: 'list' } | { kind: 'new'; description: string; canteens?: CanteenKey[] } | { kind: 'edit'; meal: Meal };

const TAB_KEY = 'quickMealTab';

/** Date a QuickMeal was created, from its id ("meal_<ms>_…") — the fallback when it was never entered. */
function createdDate(meal: Meal): string {
  const ms = Number(meal.id.split('_')[1]);
  return Number.isFinite(ms) && ms > 0 ? format(new Date(ms), 'yyyy-MM-dd') : '';
}

function relativeDay(date: string, today: string): string {
  const diff = differenceInCalendarDays(parseISO(today), parseISO(date));
  if (diff === 0) return 'heute';
  if (diff === 1) return 'gestern';
  if (diff === -1) return 'morgen';
  if (diff > 1 && diff < 7) return `vor ${diff} Tagen`;
  return format(parseISO(date), date.slice(0, 4) === today.slice(0, 4) ? 'EEEEEE dd.MM.' : 'dd.MM.yyyy', { locale: de });
}

const normalize = (s: string) => s.toLocaleLowerCase('de').trim();

/**
 * QuickMeal window for a plan slot: search, ⭐ favourites and "Zuletzt gegessen" as a list — tap
 * an entry to put it into the slot. "Neues QuickMeal" and editing switch the same window to the
 * estimate form; saving a new one enters it right away.
 */
export function QuickMealPicker({ date, subtitle, onClose, onSelect, requiredProteinDensity }: {
  /** Plan date of the slot (canteen menus of that day). */
  date: string;
  /** e.g. "Mittagessen · Samstag 03.10." */
  subtitle: string;
  onClose: () => void;
  onSelect: (meal: Meal) => void;
  /** Protein density (g/100 kcal) the day still needs — enables „passt ins Defizit“ and colours the badges. */
  requiredProteinDensity?: number;
}) {
  const { quickMeals: allQuickMeals, toggleMealStar, today } = useMealPlan();
  // ☕ drinks have their own counter in the day header.
  const quickMeals = useMemo(() => allQuickMeals.filter(m => !m.isDrink), [allQuickMeals]);
  const [sort, setSort] = useState<Sort>('default');
  const [fitOnly, setFitOnly] = useState(false);
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [query, setQuery] = useState('');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [brokenPhotos, setBrokenPhotos] = useState<Set<string>>(() => new Set());
  const [tab, setTabState] = useState<Tab>(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(TAB_KEY); } catch { /* storage blocked */ }
    const hasFavorites = quickMeals.some(m => m.starred);
    if (saved === 'recent') return 'recent';
    return hasFavorites ? 'favorites' : 'recent';
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* storage blocked */ }
  };

  // Usage changes whenever something is entered, so it is fetched fresh each time the window opens.
  useEffect(() => {
    api.get<Usage>(`/api/meals/quick/usage?today=${today}`).then(setUsage).catch(() => setUsage({}));
  }, [today]);

  // Canteen shortcuts (NAPO, Mensa) only on days with a published menu.
  const canteens = useCanteensOnDate(user, date);
  const canteenKeys = canteens.map(c => c.key);

  // Most recently eaten first (never entered → by creation date). Same name only once — the
  // most recent one — unless it is a favourite.
  const pool = useMemo(() => {
    if (!usage) return [];
    const recency = (m: Meal) => usage[m.id]?.lastDate ?? createdDate(m);
    const sorted = [...quickMeals].sort((a, b) => recency(b).localeCompare(recency(a)) || (b.id > a.id ? 1 : -1));
    const seen = new Set<string>();
    return sorted.filter(m => {
      const key = normalize(m.name);
      if (seen.has(key) && !m.starred) return false;
      seen.add(key);
      return true;
    });
  }, [quickMeals, usage]);

  const favorites = useMemo(() => pool.filter(m => m.starred), [pool]);

  const searchResults = useMemo(() => {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;
    const hits = pool.filter(m => {
      const text = normalize(`${m.name} ${m.comment ?? ''}`);
      return tokens.every(t => text.includes(t));
    });
    return [...hits.filter(m => m.starred), ...hits.filter(m => !m.starred)];
  }, [pool, query]);

  const need = requiredProteinDensity;
  const list = useMemo(() => {
    let result = searchResults ?? (tab === 'favorites' ? favorites : pool);
    const density = (m: Meal) => computeProteinDensity(m.nutritionPerServing) ?? -1;
    if (fitOnly && need !== undefined) result = result.filter(m => density(m) >= need);
    const by = sort === 'default' && fitOnly ? 'density' : sort;
    if (by === 'default') return result;
    const value = (m: Meal) => {
      const n = m.nutritionPerServing;
      if (by === 'protein') return -(n?.protein ?? -1);
      if (by === 'density') return -density(m);
      return n ? n.kcal : Infinity;
    };
    return [...result].sort((a, b) => value(a) - value(b));
  }, [searchResults, tab, favorites, pool, fitOnly, need, sort]);

  if (view.kind !== 'list') {
    const back = () => setView({ kind: 'list' });
    return (
      <ModalPortal>
        <div className="modal-backdrop" onClick={onClose}>
          <div className={`modal-content quick-meal-dialog quick-meal-picker ${view.kind === 'new' && (view.canteens?.length ?? 0) > 1 ? 'quick-meal-picker-wide' : ''}`} onClick={e => e.stopPropagation()}>
            <div className="quick-meal-header">
              <button className="btn-ghost quick-meal-back" onClick={back} aria-label="Zurück zur Liste">←</button>
              <div className="quick-meal-title">
                <h3>{view.kind === 'edit' ? view.meal.name : view.canteens ? canteensLabel(view.canteens) : 'Neues QuickMeal'}</h3>
                <span>{subtitle}</span>
              </div>
              <button className="btn-ghost" onClick={onClose} style={{ fontSize: '16px' }} aria-label="Schließen">{'✗'}</button>
            </div>
            <div className="quick-meal-scroll quick-meal-form-scroll">
              {view.kind === 'new' ? (
                <QuickMealForm date={date} canteens={view.canteens} initialDescription={view.description}
                  onSaved={onSelect} onCancel={back} />
              ) : (
                <QuickMealForm meal={view.meal} usageCount={usage?.[view.meal.id]?.count}
                  onSaved={back} onCancel={back} onRemoved={back} />
              )}
            </div>
          </div>
        </div>
      </ModalPortal>
    );
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-content quick-meal-dialog quick-meal-picker" onClick={e => e.stopPropagation()}>
          <div className="quick-meal-header">
            <div className="quick-meal-title">
              <h3>🍽️ QuickMeal</h3>
              <span>{subtitle}</span>
            </div>
            <button className="btn-ghost" onClick={onClose} style={{ fontSize: '16px' }} aria-label="Schließen">{'✗'}</button>
          </div>

          <input
            className="input quick-meal-search"
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="QuickMeals durchsuchen…"
            autoFocus={!isMobile}
            enterKeyHint="search"
          />

          <div className="quick-meal-actions">
            <button className="btn btn-primary" onClick={() => setView({ kind: 'new', description: query.trim() })}>
              {query.trim() ? `＋ „${query.trim()}“ neu erfassen` : '＋ Neues QuickMeal'}
            </button>
            {canteens.length > 0 && (
              <button className="btn btn-muted" onClick={() => setView({ kind: 'new', description: '', canteens: canteenKeys })}
                title={`Mittagsmenü am ${canteens[0].weekday}`}>
                {canteensLabel(canteenKeys)}
              </button>
            )}
          </div>

          {searchResults ? (
            <div className="quick-meal-list-label">
              {searchResults.length === 0 ? 'Keine Treffer' : `${searchResults.length} Treffer`}
            </div>
          ) : (
            <div className="quick-meal-tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'favorites'}
                className={tab === 'favorites' ? 'is-active' : ''} onClick={() => setTab('favorites')}>
                ⭐ Favoriten{favorites.length > 0 && <small>{favorites.length}</small>}
              </button>
              <button role="tab" aria-selected={tab === 'recent'}
                className={tab === 'recent' ? 'is-active' : ''} onClick={() => setTab('recent')}>
                🕒 Zuletzt gegessen
              </button>
            </div>
          )}

          <div className="quick-meal-filters">
            {need !== undefined && (
              <button type="button" className={`pill ${fitOnly ? 'pill-active' : ''}`} onClick={() => setFitOnly(!fitOnly)}
                title="Nur QuickMeals mit mindestens dieser Proteindichte, dichteste zuerst">
                💪 passt ins Defizit (≥ {formatProteinDensity(need)})
              </button>
            )}
            <select className="input quick-meal-sort" value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sortierung">
              {(Object.keys(SORT_LABELS) as Sort[]).map(k => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
            </select>
          </div>

          <div className="quick-meal-scroll">
            {!usage ? (
              <div className="quick-meal-empty">Lade…</div>
            ) : list.length === 0 ? (
              <div className="quick-meal-empty">
                {fitOnly
                  ? 'Kein QuickMeal in dieser Liste ist dicht genug. Schalte „passt ins Defizit“ aus, um alle zu sehen.'
                  : searchResults
                  ? 'Nichts gefunden. Mit dem Button oben erfasst du es neu.'
                  : tab === 'favorites'
                    ? 'Noch keine Favoriten. Tippe bei „Zuletzt gegessen“ auf ☆, um ein QuickMeal hier abzulegen.'
                    : 'Noch keine QuickMeals. Erfasse dein erstes mit „＋ Neues QuickMeal“.'}
              </div>
            ) : (
              <ul className="quick-meal-list">
                {list.map(m => {
                  const u = usage[m.id];
                  const n = m.nutritionPerServing;
                  const density = computeProteinDensity(n);
                  const densityClass = need === undefined || density === null ? '' : density >= need ? ' recipe-row-badge-fits' : ' recipe-row-badge-short';
                  return (
                    <li key={m.id} className="quick-meal-row">
                      <button className="quick-meal-row-main" onClick={() => onSelect(m)} title={`${m.name} eintragen`}>
                        {m.photoUrl && !brokenPhotos.has(m.id)
                          ? <img className="quick-meal-thumb" src={`${api.url}${m.photoUrl}`} alt="" loading="lazy"
                              onError={() => setBrokenPhotos(prev => new Set(prev).add(m.id))} />
                          : <span className="quick-meal-thumb quick-meal-thumb-empty" aria-hidden>🍽️</span>}
                        <span className="quick-meal-row-text">
                          <span className="quick-meal-row-name">
                            {density !== null && (
                              <span className={`recipe-row-badge recipe-row-badge-protein quick-meal-density${densityClass}`}
                                title={`${formatProteinDensity(density)} g Protein pro 100 kcal`}>
                                {formatProteinDensity(density)}
                              </span>
                            )}
                            {m.name}
                          </span>
                          <span className="quick-meal-row-meta">
                            {n && <><strong>{Math.round(n.kcal)} kcal</strong> · {Math.round(n.protein)} g Protein · </>}
                            {u ? `${relativeDay(u.lastDate, today)}${u.count > 1 ? ` · ${u.count}×` : ''}` : 'noch nicht eingetragen'}
                          </span>
                        </span>
                      </button>
                      <button className={`btn-ghost quick-meal-star ${m.starred ? 'is-starred' : ''}`}
                        onClick={() => toggleMealStar(m.id)} aria-pressed={!!m.starred}
                        aria-label={m.starred ? `${m.name} aus den Favoriten entfernen` : `${m.name} zu den Favoriten`}>
                        {m.starred ? '★' : '☆'}
                      </button>
                      <button className="btn-ghost quick-meal-edit" onClick={() => setView({ kind: 'edit', meal: m })}
                        aria-label={`${m.name} bearbeiten`} title="Bearbeiten">
                        ✎
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
