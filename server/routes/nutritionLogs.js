import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Log every planned entry up to and including today — whether or not it is marked cooked (✗);
// the report counts what is in the plans, like the day score does. While an entry exists its row
// follows the plan (servings, persons, recipe values, date); the WHERE on the update skips
// unchanged rows, so running this on every read stays cheap. Rows whose plan, entry or recipe
// was deleted keep their last snapshot (history survives plan cleanup — agreed behavior).
// persons = the day's own count if one is set for that date, else plan.default_servings,
// falling back to user.default_servings.
// Personal entries (☕ coffee) are logged for their user — also in plans shared with them — and
// count fully (persons = 1); other users' personal entries in the user's own plans are skipped.
const upsertStmt = db.prepare(`
  INSERT INTO nutrition_logs
    (user_id, plan_id, entry_id, meal_id, meal_name, date, meal_type, servings, persons, nutrition_per_serving)
  SELECT
    @userId, e.plan_id, e.id, e.meal_id, m.name, e.date, e.meal_type, e.servings,
    CASE WHEN e.personal_user_id IS NOT NULL THEN 1
         ELSE COALESCE(dp.persons, p.default_servings, u.default_servings, 1) END,
    m.nutrition_per_serving
  FROM meal_plan_entries e
  JOIN meal_plans p ON p.id = e.plan_id
  JOIN users u ON u.id = p.user_id
  JOIN meals m ON m.id = e.meal_id
  LEFT JOIN plan_day_persons dp ON dp.plan_id = e.plan_id AND dp.date = e.date
  WHERE ((p.user_id = @userId AND e.personal_user_id IS NULL) OR e.personal_user_id = @userId)
    AND e.date <= date('now')
  ON CONFLICT(user_id, entry_id) DO UPDATE SET
    plan_id = excluded.plan_id, meal_id = excluded.meal_id, meal_name = excluded.meal_name,
    date = excluded.date, meal_type = excluded.meal_type, servings = excluded.servings,
    persons = excluded.persons, nutrition_per_serving = excluded.nutrition_per_serving
  WHERE nutrition_logs.meal_id IS NOT excluded.meal_id
     OR nutrition_logs.meal_name IS NOT excluded.meal_name
     OR nutrition_logs.date IS NOT excluded.date
     OR nutrition_logs.meal_type IS NOT excluded.meal_type
     OR nutrition_logs.servings IS NOT excluded.servings
     OR nutrition_logs.persons IS NOT excluded.persons
     OR nutrition_logs.nutrition_per_serving IS NOT excluded.nutrition_per_serving
`);

// Entries moved past today (or into a menu course) leave the log until their day comes.
const unplannedStmt = db.prepare(`
  DELETE FROM nutrition_logs
  WHERE user_id = ?
    AND entry_id IN (
      SELECT e.id FROM meal_plan_entries e JOIN meal_plans p ON p.id = e.plan_id
      WHERE ((p.user_id = ? AND e.personal_user_id IS NULL) OR e.personal_user_id = ?)
        AND NOT (e.date <= date('now'))
    )
`);

// Bring the log up to date for a user. No-op unless the user has the log enabled in settings.
export function reconcileNutritionLogs(userId) {
  const user = db.prepare('SELECT nutrition_log_enabled FROM users WHERE id = ?').get(userId);
  if (!user || !user.nutrition_log_enabled) return 0;
  return db.transaction(() => upsertStmt.run({ userId }).changes + unplannedStmt.run(userId, userId, userId).changes)();
}

// Distinct months (YYYY-MM) that have log data — feeds the report's month navigator.
router.get('/months', (req, res) => {
  reconcileNutritionLogs(req.userId);
  const rows = db.prepare(
    `SELECT DISTINCT substr(date, 1, 7) AS month FROM nutrition_logs WHERE user_id = ? ORDER BY month DESC`
  ).all(req.userId);
  res.json(rows.map(r => r.month));
});

router.get('/', (req, res) => {
  reconcileNutritionLogs(req.userId);
  // Optional ?month=YYYY-MM filter (used by the monthly report).
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month)) ? String(req.query.month) : null;
  const rows = month
    ? db.prepare(
        `SELECT id, plan_id, entry_id, meal_id, meal_name, date, meal_type, servings, persons,
                nutrition_per_serving, logged_at
         FROM nutrition_logs WHERE user_id = ? AND substr(date, 1, 7) = ? ORDER BY date DESC, id DESC`
      ).all(req.userId, month)
    : db.prepare(
        `SELECT id, plan_id, entry_id, meal_id, meal_name, date, meal_type, servings, persons,
                nutrition_per_serving, logged_at
         FROM nutrition_logs WHERE user_id = ? ORDER BY date DESC, id DESC`
      ).all(req.userId);
  res.json(rows.map(r => ({
    id: r.id,
    planId: r.plan_id,
    entryId: r.entry_id,
    mealId: r.meal_id,
    mealName: r.meal_name,
    date: r.date,
    mealType: r.meal_type,
    servings: r.servings,
    persons: r.persons,
    nutritionPerServing: r.nutrition_per_serving ? JSON.parse(r.nutrition_per_serving) : null,
    loggedAt: r.logged_at,
  })));
});

export default router;
