import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useIsMobile } from '../hooks/useIsMobile';
import { computeNutritionScore } from '../utils/nutritionScore';
import {
  CANTEENS, bestCanteenDish, bestDishOverall, canteensLabel, combineCanteenEstimate, formatPrice, loadCanteenDays,
  type CanteenDay, type CanteenDish, type CanteenEstimate, type CanteenEvaluation, type CanteenKey,
} from '../utils/canteens';

type Sides = { soup: string | null; salad: boolean };
type PerCanteen<T> = Partial<Record<CanteenKey, T>>;
const NO_SIDES: Sides = { soup: null, salad: false };

/** Dishes grouped by menu category, in menu order (NAPO has none → one unlabeled group). */
function groupByCategory(dishes: CanteenDish[]): [string, CanteenDish[]][] {
  const groups = new Map<string, CanteenDish[]>();
  for (const d of dishes) {
    const key = d.category ?? '';
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  return [...groups.entries()];
}

/**
 * The day's canteen menus (NAPO, Mensa) in one place: side by side on desktop, swipeable pages on
 * mobile. One dish across all canteens is selected, plus that canteen's sides (Mensa soup, salad).
 * Picking is free; „Auswahl schätzen“ estimates all of a canteen's dishes and sides in one request,
 * which the server keeps for at least a day — an existing estimate is loaded right away. With an
 * estimate every change of mind updates the form's name and nutrition at once; without one only
 * the description follows and the old numbers are cleared.
 */
export function CanteenMenus({ canteens, date, onApply }: {
  canteens: CanteenKey[];
  date: string;
  onApply: (estimate: CanteenEstimate | null, description: string) => void;
}) {
  const isMobile = useIsMobile();
  const [days, setDays] = useState<PerCanteen<CanteenDay | null>>({});
  const [menuErrors, setMenuErrors] = useState<PerCanteen<string>>({});
  const [evaluations, setEvaluations] = useState<PerCanteen<CanteenEvaluation>>({});
  const [evaluating, setEvaluating] = useState<PerCanteen<boolean>>({});
  const [errors, setErrors] = useState<PerCanteen<string | null>>({});
  const [selected, setSelected] = useState<{ canteen: CanteenKey; dish: string } | null>(null);
  const [sides, setSides] = useState<PerCanteen<Sides>>({});
  const [page, setPage] = useState(0);
  const [pageHeight, setPageHeight] = useState<number | null>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const canteensKey = canteens.join(',');

  useEffect(() => {
    for (const key of canteensKey.split(',') as CanteenKey[]) {
      loadCanteenDays(key)
        .then(list => setDays(prev => ({ ...prev, [key]: list.find(d => d.date === date) ?? null })))
        .catch(e => setMenuErrors(prev => ({ ...prev, [key]: e instanceof Error ? e.message : 'Fehler' })));
      // Free: an estimate from earlier (server keeps it ≥ 1 day) — picking then fills the form at once.
      api.get<CanteenEvaluation | null>(`${CANTEENS[key].estimatePath}?date=${date}`)
        .then(ev => { if (ev) setEvaluations(prev => ({ ...prev, [key]: ev })); })
        .catch(() => { /* estimate on demand then */ });
    }
  }, [canteensKey, date]);

  // Every change of mind goes straight into the form — only when something changed, since onApply
  // re-renders the parent (and hands us a new onApply).
  const onApplyRef = useRef(onApply);
  useEffect(() => { onApplyRef.current = onApply; });
  const applied = useRef('');
  useEffect(() => {
    if (!selected) return;
    const dish = days[selected.canteen]?.dishes.find(d => d.name === selected.dish);
    if (!dish) return;
    const s = sides[selected.canteen] ?? NO_SIDES;
    const ev = evaluations[selected.canteen];
    const key = JSON.stringify([selected, s, !!ev]);
    if (key === applied.current) return;
    applied.current = key;
    onApplyRef.current(ev ? combineCanteenEstimate(ev, dish.name, s.soup, s.salad) : null,
      CANTEENS[selected.canteen].describe(dish, s.soup, s.salad));
  }, [selected, sides, evaluations, days]);

  // Mobile: the pages row takes the height of the visible page (no empty space under a short menu).
  useEffect(() => {
    const el = pagesRef.current?.children[page];
    if (!isMobile || !(el instanceof HTMLElement)) return;
    const observer = new ResizeObserver(() => setPageHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMobile, page, canteensKey]);

  const setSide = (canteen: CanteenKey, patch: Partial<Sides>) =>
    setSides(prev => ({ ...prev, [canteen]: { ...(prev[canteen] ?? NO_SIDES), ...patch } }));

  const evaluate = async (canteen: CanteenKey): Promise<CanteenEvaluation | null> => {
    const existing = evaluations[canteen];
    if (existing) return existing;
    setEvaluating(prev => ({ ...prev, [canteen]: true }));
    setErrors(prev => ({ ...prev, [canteen]: null }));
    try {
      const ev = await api.post<CanteenEvaluation>(CANTEENS[canteen].estimatePath, { date });
      setEvaluations(prev => ({ ...prev, [canteen]: ev }));
      return ev;
    } catch (e) {
      setErrors(prev => ({ ...prev, [canteen]: e instanceof Error ? e.message : 'Schätzung fehlgeschlagen' }));
      return null;
    } finally {
      setEvaluating(prev => ({ ...prev, [canteen]: false }));
    }
  };
  const chooseBest = async (canteen: CanteenKey) => {
    const ev = await evaluate(canteen);
    if (ev) setSelected({ canteen, dish: bestCanteenDish(ev) });
  };

  // Across all canteens of the day: estimates the ones still missing (in parallel), then picks.
  const withMenu = canteens.filter(k => (days[k]?.dishes.length ?? 0) > 0);
  const evaluated = withMenu.flatMap(k => { const ev = evaluations[k]; return ev ? [[k, ev] as [CanteenKey, CanteenEvaluation]] : []; });
  const overallBest = evaluated.length === withMenu.length ? bestDishOverall(evaluated) : null;
  const missing = withMenu.filter(k => !evaluations[k]);
  const anyEvaluating = withMenu.some(k => evaluating[k]);
  const chooseBestOverall = async () => {
    const results = await Promise.all(withMenu.map(async k => [k, await evaluate(k)] as const));
    const best = bestDishOverall(results.filter((r): r is [CanteenKey, CanteenEvaluation] => r[1] !== null));
    if (!best) return;
    setSelected(best);
    goTo(canteens.indexOf(best.canteen));
  };

  const pageElements = () => [...(pagesRef.current?.children ?? [])] as HTMLElement[];
  const onScroll = () => {
    const row = pagesRef.current;
    if (!row) return;
    const offsets = pageElements().map(el => Math.abs(el.offsetLeft - row.scrollLeft));
    setPage(offsets.indexOf(Math.min(...offsets)));
  };
  const goTo = (i: number) => pagesRef.current?.scrollTo({ left: pageElements()[i]?.offsetLeft ?? 0, behavior: 'smooth' });

  return (
    <div className="canteen-menus">
      {withMenu.length > 1 && (
        <div className="canteen-best-overall">
          <button type="button" className="btn btn-muted btn-sm" onClick={chooseBestOverall}
            disabled={anyEvaluating || (!!overallBest && selected?.canteen === overallBest.canteen && selected.dish === overallBest.dish)}
            title={missing.length ? `Schätzt dafür noch ${canteensLabel(missing).replace(/-Menü$/, '')}` : 'Alles geschätzt – kostet nichts'}>
            🤖 {anyEvaluating ? 'Schätze…' : `Bestes Menü aus ${canteensLabel(withMenu)}`}
          </button>
          {overallBest && <span className="quick-meal-hint">🏆 = bester Score aus beiden</span>}
        </div>
      )}
      {canteens.length > 1 && (
        <div className="quick-meal-tabs canteen-tabs" role="tablist">
          {canteens.map((key, i) => (
            <button key={key} role="tab" aria-selected={page === i} className={page === i ? 'is-active' : ''} onClick={() => goTo(i)}>
              {CANTEENS[key].title}{selected?.canteen === key && <span aria-label="Auswahl">✓</span>}
            </button>
          ))}
        </div>
      )}
      <div ref={pagesRef} className="canteen-pages" onScroll={onScroll}
        style={isMobile && pageHeight && canteens.length > 1 ? { height: pageHeight } : undefined}>
        {canteens.map(key => (
          <CanteenPanel key={key} canteen={key} day={days[key]} menuError={menuErrors[key]}
            evaluation={evaluations[key]} evaluating={!!evaluating[key]} error={errors[key]}
            selectedDish={selected?.canteen === key ? selected.dish : null} sides={sides[key] ?? NO_SIDES}
            overallBestDish={overallBest?.canteen === key ? overallBest.dish : null}
            onPickDish={dish => setSelected({ canteen: key, dish })}
            onSides={patch => setSide(key, patch)}
            onEvaluate={() => evaluate(key)}
            onBest={() => chooseBest(key)} />
        ))}
      </div>
    </div>
  );
}

function CanteenPanel({ canteen, day, menuError, evaluation, evaluating, error, selectedDish, overallBestDish, sides, onPickDish, onSides, onEvaluate, onBest }: {
  canteen: CanteenKey;
  /** undefined = loading, null = no menu that day */
  day: CanteenDay | null | undefined;
  menuError?: string;
  evaluation?: CanteenEvaluation;
  evaluating: boolean;
  error?: string | null;
  selectedDish: string | null;
  /** Best dish across all canteens, when it is in this one (🏆). */
  overallBestDish: string | null;
  sides: Sides;
  onPickDish: (dish: string) => void;
  onSides: (patch: Partial<Sides>) => void;
  onEvaluate: () => void;
  onBest: () => void;
}) {
  const config = CANTEENS[canteen];
  const title = <div className="quick-meal-canteen-title">{config.title}{day && ` · ${day.weekday}`}</div>;

  if (menuError || !day || day.dishes.length === 0) {
    return (
      <div className="quick-meal-canteen">
        {title}
        <div className="quick-meal-hint">
          {menuError ?? (day === undefined ? 'Lade Menü…' : 'Für diesen Tag gibt es kein Menü.')}
        </div>
      </div>
    );
  }

  const best = evaluation ? bestCanteenDish(evaluation) : null;
  const hasSoups = day.soups.length > 0;

  return (
    <div className="quick-meal-canteen">
      {title}

      {groupByCategory(day.dishes).map(([category, dishes]) => (
        <div key={category} className="quick-meal-canteen-group">
          {category && <span className="quick-meal-canteen-label">{category}</span>}
          <div className="quick-meal-canteen-options">
            {dishes.map(d => {
              const est = evaluation?.dishes.find(x => x.dish === d.name);
              const score = est ? computeNutritionScore(est.nutritionPerServing) : null;
              const info = [
                d.price && formatPrice(d.price) + (d.priceReduced ? ` (ermäßigt ${formatPrice(d.priceReduced)})` : ''),
                est && `Score ${score ?? '–'}`,
                est && `${est.nutritionPerServing.kcal} kcal`,
                est && `${est.nutritionPerServing.protein} g Protein`,
              ].filter(Boolean);
              return (
                <button key={d.name} type="button" disabled={evaluating} title={d.details}
                  className={`pill quick-meal-canteen-option ${selectedDish === d.name ? 'pill-active' : ''}`}
                  onClick={() => onPickDish(d.name)}>
                  <span>{d.name}{best === d.name && ' ⭐'}{overallBestDish === d.name && ' 🏆'}</span>
                  {info.length > 0 && <small>{info.join(' · ')}</small>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {hasSoups && (
        <div className="quick-meal-canteen-group">
          <span className="quick-meal-canteen-label">Suppe</span>
          <div className="quick-meal-canteen-options">
            <button type="button" disabled={evaluating}
              className={`pill quick-meal-canteen-option ${sides.soup === null ? 'pill-active' : ''}`}
              onClick={() => onSides({ soup: null })}>
              <span>ohne Suppe</span>
            </button>
            {day.soups.map(s => {
              const est = evaluation?.soups?.find(x => x.soup === s.name);
              const info = [
                s.price && formatPrice(s.price),
                est && `+${est.nutritionPerServing.kcal} kcal`,
                est && `${est.nutritionPerServing.protein} g Protein`,
              ].filter(Boolean);
              return (
                <button key={s.name} type="button" disabled={evaluating}
                  className={`pill quick-meal-canteen-option ${sides.soup === s.name ? 'pill-active' : ''}`}
                  onClick={() => onSides({ soup: s.name })}>
                  <span>{s.name}</span>
                  {info.length > 0 && <small>{info.join(' · ')}</small>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <label className="quick-meal-canteen-salad">
        <input type="checkbox" checked={sides.salad} disabled={evaluating} onChange={e => onSides({ salad: e.target.checked })} />
        mit Salat (mittelgroße Schüssel)
        {evaluation && <small>+{evaluation.salad.nutritionPerServing.kcal} kcal</small>}
      </label>
      {day.combos && day.combos.length > 0 && (
        <div className="quick-meal-hint">
          Preise nur als Menü: {day.combos.map(c => `${c.name} (${c.contents}) ${formatPrice(c.price)}`).join(' · ')}
        </div>
      )}
      <div className="quick-meal-canteen-actions">
        {!evaluation && (
          <button type="button" className="btn btn-primary btn-sm" disabled={!selectedDish || evaluating} onClick={onEvaluate}>
            {evaluating ? 'Schätze…' : 'Auswahl schätzen'}
          </button>
        )}
        <button type="button" className="btn btn-muted btn-sm" disabled={evaluating || (!!evaluation && selectedDish === best)} onClick={onBest}>
          🤖 {day.dishes.length > 2 ? 'Bestes' : 'Besseres'} Menü wählen
        </button>
      </div>
      <div className="quick-meal-hint">
        {evaluation
          ? `Geschätzt – ${hasSoups ? 'Gericht, Suppe' : 'Gericht'} und Salat wechseln kostet nichts mehr. ⭐ = bester Nährwert-Score.`
          : `Auswählen kostet nichts – geschätzt wird erst per Button: alle Gerichte${hasSoups ? ', Suppen' : ''} und der Salat auf einmal, danach einen Tag lang gespeichert.`}
      </div>
      {error && <div className="quick-meal-error">{error}</div>}
    </div>
  );
}
