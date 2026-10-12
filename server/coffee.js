// ☕ Coffee counter: drinks are QuickMeals with is_drink = 1; what a user drinks on a day is stored
// as personal plan entries (meal_type 'drinks', personal_user_id = that user, servings = cups).
// Personal entries are only visible to their user and count fully for them — they are not split
// across the day's persons like shared meals.
//
// Daily habit (users.coffee_habit, e.g. 2× Cappuccino): days from today on are pre-filled with
// entries flagged auto_habit. coffee_habit_fill remembers per plan + user up to which date that
// happened, so a day the user changed (or cleared) is not filled again on the next load.
import db from './db.js';

export const COFFEE_MEAL_TYPE = 'drinks';
const MAX_CUPS = 20;

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** The client's "today" if given (the server runs in UTC), else the server's date. */
export function resolveToday(value) {
  return isDate(value) ? value : new Date().toISOString().slice(0, 10);
}

function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const ownDrinkStmt = db.prepare('SELECT id FROM meals WHERE id = ? AND user_id = ? AND is_drink = 1');

/** Normalise a habit from the client or the DB: own drinks only, 1–20 cups, each drink once. */
export function sanitizeHabit(value, userId) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const mealId = typeof item?.mealId === 'string' ? item.mealId : null;
    const count = Math.round(Number(item?.count));
    if (!mealId || seen.has(mealId) || !Number.isFinite(count) || count < 1) continue;
    if (!ownDrinkStmt.get(mealId, userId)) continue;
    seen.add(mealId);
    result.push({ mealId, count: Math.min(MAX_CUPS, count) });
  }
  return result;
}

export function readHabit(userId) {
  const row = db.prepare('SELECT coffee_habit FROM users WHERE id = ?').get(userId);
  if (!row?.coffee_habit) return [];
  try { return sanitizeHabit(JSON.parse(row.coffee_habit), userId); } catch { return []; }
}

const fillRowStmt = db.prepare('SELECT filled_through FROM coffee_habit_fill WHERE plan_id = ? AND user_id = ?');
const fillUpsertStmt = db.prepare(`
  INSERT INTO coffee_habit_fill (plan_id, user_id, filled_through) VALUES (?, ?, ?)
  ON CONFLICT(plan_id, user_id) DO UPDATE SET filled_through = excluded.filled_through
`);
const dayHasCoffeeStmt = db.prepare(
  'SELECT 1 FROM meal_plan_entries WHERE plan_id = ? AND date = ? AND meal_type = ? AND personal_user_id = ? LIMIT 1'
);
// The nutrition log keeps snapshots of deleted entries (history survives plan cleanup). A cup
// taken back is a correction, not history — its log row goes too.
const deleteEntryStmt = db.prepare('DELETE FROM meal_plan_entries WHERE id = ?');
const deleteLogStmt = db.prepare('DELETE FROM nutrition_logs WHERE entry_id = ?');
function deleteCoffeeEntry(id) {
  deleteEntryStmt.run(id);
  deleteLogStmt.run(id);
}

const insertCoffeeStmt = db.prepare(`
  INSERT INTO meal_plan_entries (plan_id, date, meal_type, meal_id, servings, personal_user_id, auto_habit)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

/** Pre-fill the habit into the plan's days from today on that were not filled before. */
export function fillCoffeeHabit(plan, userId, today) {
  if (plan.plan_type === 'menu' || !isDate(plan.start_date) || !isDate(plan.end_date)) return;
  const habit = readHabit(userId);
  if (habit.length === 0) return;

  const filled = fillRowStmt.get(plan.id, userId)?.filled_through;
  let from = today > plan.start_date ? today : plan.start_date;
  if (filled && addDays(filled, 1) > from) from = addDays(filled, 1);
  if (from > plan.end_date) return;

  db.transaction(() => {
    for (let date = from; date <= plan.end_date; date = addDays(date, 1)) {
      if (dayHasCoffeeStmt.get(plan.id, date, COFFEE_MEAL_TYPE, userId)) continue;
      for (const { mealId, count } of habit) {
        insertCoffeeStmt.run(plan.id, date, COFFEE_MEAL_TYPE, mealId, count, userId, 1);
      }
    }
    fillUpsertStmt.run(plan.id, userId, plan.end_date);
  })();
}

/**
 * The habit changed: drop the untouched habit entries from today on and forget how far plans were
 * filled, so the next plan load fills those days with the new habit. Days the user adjusted keep
 * their entries (they are no longer auto_habit).
 */
export function resetCoffeeHabit(userId, today) {
  db.transaction(() => {
    const stale = db.prepare(`
      SELECT id FROM meal_plan_entries
      WHERE personal_user_id = ? AND meal_type = ? AND auto_habit = 1 AND date >= ?
    `).all(userId, COFFEE_MEAL_TYPE, today);
    for (const e of stale) deleteCoffeeEntry(e.id);
    db.prepare('DELETE FROM coffee_habit_fill WHERE user_id = ?').run(userId);
  })();
}

/**
 * Set how many cups of one drink the user has on a day. Any change makes the whole day the
 * user's own (no longer auto_habit). Returns the resulting entry row, or null when set to 0.
 */
export function setCoffeeCount(planId, userId, date, mealId, count) {
  const cups = Math.max(0, Math.min(MAX_CUPS, Math.round(Number(count) || 0)));
  return db.transaction(() => {
    db.prepare(`
      UPDATE meal_plan_entries SET auto_habit = 0
      WHERE plan_id = ? AND date = ? AND meal_type = ? AND personal_user_id = ?
    `).run(planId, date, COFFEE_MEAL_TYPE, userId);

    const existing = db.prepare(`
      SELECT id FROM meal_plan_entries
      WHERE plan_id = ? AND date = ? AND meal_type = ? AND personal_user_id = ? AND meal_id = ?
      ORDER BY id
    `).all(planId, date, COFFEE_MEAL_TYPE, userId, mealId);

    if (cups === 0) {
      for (const e of existing) deleteCoffeeEntry(e.id);
      return null;
    }
    let id;
    if (existing.length > 0) {
      id = existing[0].id;
      db.prepare('UPDATE meal_plan_entries SET servings = ?, enabled = 1 WHERE id = ?').run(cups, id);
      for (const e of existing.slice(1)) deleteCoffeeEntry(e.id);
    } else {
      id = insertCoffeeStmt.run(planId, date, COFFEE_MEAL_TYPE, mealId, cups, userId, 0).lastInsertRowid;
    }
    return db.prepare('SELECT * FROM meal_plan_entries WHERE id = ?').get(id);
  })();
}

export { isDate, ownDrinkStmt };
