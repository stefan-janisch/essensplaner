import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function rowToEntry(row) {
  return {
    id: row.id,
    date: row.date,
    mealType: row.meal_type,
    mealId: row.meal_id,
    servings: row.servings,
    enabled: row.enabled === 1,
  };
}

function rowToPlan(row) {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
  };
}

// Verify plan belongs to user
function getPlanForUser(planId, userId) {
  return db.prepare('SELECT * FROM meal_plans WHERE id = ? AND user_id = ?').get(planId, userId);
}

// List all plans
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM meal_plans WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
  res.json(rows.map(rowToPlan));
});

// Create plan
router.post('/', (req, res) => {
  try {
    const { name, startDate, endDate } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name ist erforderlich' });
    }

    const result = db.prepare(
      'INSERT INTO meal_plans (user_id, name, start_date, end_date) VALUES (?, ?, ?, ?)'
    ).run(req.userId, name, startDate || null, endDate || null);

    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(rowToPlan(plan));
  } catch (err) {
    console.error('Create plan error:', err);
    res.status(500).json({ error: 'Plan konnte nicht erstellt werden' });
  }
});

// Get plan with entries
router.get('/:planId', (req, res) => {
  const plan = getPlanForUser(req.params.planId, req.userId);
  if (!plan) {
    return res.status(404).json({ error: 'Plan nicht gefunden' });
  }

  const entries = db.prepare(
    'SELECT * FROM meal_plan_entries WHERE plan_id = ? ORDER BY date, meal_type'
  ).all(plan.id);

  res.json({
    ...rowToPlan(plan),
    entries: entries.map(rowToEntry),
  });
});

// Update plan metadata
router.put('/:planId', (req, res) => {
  const plan = getPlanForUser(req.params.planId, req.userId);
  if (!plan) {
    return res.status(404).json({ error: 'Plan nicht gefunden' });
  }

  const { name, startDate, endDate } = req.body;

  db.prepare(
    'UPDATE meal_plans SET name = ?, start_date = ?, end_date = ? WHERE id = ?'
  ).run(
    name ?? plan.name,
    startDate !== undefined ? startDate : plan.start_date,
    endDate !== undefined ? endDate : plan.end_date,
    plan.id
  );

  const updated = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(plan.id);
  res.json(rowToPlan(updated));
});

// Delete plan
router.delete('/:planId', (req, res) => {
  const plan = getPlanForUser(req.params.planId, req.userId);
  if (!plan) {
    return res.status(404).json({ error: 'Plan nicht gefunden' });
  }

  db.prepare('DELETE FROM meal_plans WHERE id = ?').run(plan.id);
  res.json({ ok: true });
});

// Bulk upsert entries (for initializeDateRange)
router.put('/:planId/entries', (req, res) => {
  const plan = getPlanForUser(req.params.planId, req.userId);
  if (!plan) {
    return res.status(404).json({ error: 'Plan nicht gefunden' });
  }

  try {
    const { entries } = req.body;
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'entries Array ist erforderlich' });
    }

    const upsert = db.prepare(`
      INSERT INTO meal_plan_entries (plan_id, date, meal_type, meal_id, servings, enabled)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(plan_id, date, meal_type) DO UPDATE SET
        meal_id = excluded.meal_id,
        servings = excluded.servings,
        enabled = excluded.enabled
    `);

    const bulkUpsert = db.transaction(() => {
      for (const entry of entries) {
        upsert.run(
          plan.id,
          entry.date,
          entry.mealType,
          entry.mealId || null,
          entry.servings ?? 2,
          entry.enabled != null ? (entry.enabled ? 1 : 0) : 1
        );
      }
    });

    bulkUpsert();

    const rows = db.prepare(
      'SELECT * FROM meal_plan_entries WHERE plan_id = ? ORDER BY date, meal_type'
    ).all(plan.id);

    res.json(rows.map(rowToEntry));
  } catch (err) {
    console.error('Bulk upsert error:', err);
    res.status(500).json({ error: 'Einträge konnten nicht aktualisiert werden' });
  }
});

// Update single slot
router.put('/:planId/slot', (req, res) => {
  const plan = getPlanForUser(req.params.planId, req.userId);
  if (!plan) {
    return res.status(404).json({ error: 'Plan nicht gefunden' });
  }

  try {
    const { date, mealType, mealId, servings, enabled } = req.body;

    if (!date || !mealType) {
      return res.status(400).json({ error: 'date und mealType sind erforderlich' });
    }

    db.prepare(`
      INSERT INTO meal_plan_entries (plan_id, date, meal_type, meal_id, servings, enabled)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(plan_id, date, meal_type) DO UPDATE SET
        meal_id = CASE WHEN @hasMealId THEN @mealId ELSE meal_id END,
        servings = CASE WHEN @hasServings THEN @servings ELSE servings END,
        enabled = CASE WHEN @hasEnabled THEN @enabled ELSE enabled END
    `).run({
      1: plan.id,
      2: date,
      3: mealType,
      4: mealId !== undefined ? mealId : null,
      5: servings ?? 2,
      6: enabled != null ? (enabled ? 1 : 0) : 1,
      hasMealId: mealId !== undefined ? 1 : 0,
      mealId: mealId !== undefined ? mealId : null,
      hasServings: servings !== undefined ? 1 : 0,
      servings: servings ?? 2,
      hasEnabled: enabled !== undefined ? 1 : 0,
      enabled: enabled != null ? (enabled ? 1 : 0) : 1,
    });

    const row = db.prepare(
      'SELECT * FROM meal_plan_entries WHERE plan_id = ? AND date = ? AND meal_type = ?'
    ).get(plan.id, date, mealType);

    res.json(row ? rowToEntry(row) : null);
  } catch (err) {
    console.error('Update slot error:', err);
    res.status(500).json({ error: 'Slot konnte nicht aktualisiert werden' });
  }
});

// Swap two slots
router.post('/:planId/swap', (req, res) => {
  const plan = getPlanForUser(req.params.planId, req.userId);
  if (!plan) {
    return res.status(404).json({ error: 'Plan nicht gefunden' });
  }

  try {
    const { fromDate, fromMealType, toDate, toMealType } = req.body;

    const swap = db.transaction(() => {
      const from = db.prepare(
        'SELECT * FROM meal_plan_entries WHERE plan_id = ? AND date = ? AND meal_type = ?'
      ).get(plan.id, fromDate, fromMealType);

      const to = db.prepare(
        'SELECT * FROM meal_plan_entries WHERE plan_id = ? AND date = ? AND meal_type = ?'
      ).get(plan.id, toDate, toMealType);

      if (!from || !to) return null;

      db.prepare(
        'UPDATE meal_plan_entries SET meal_id = ?, servings = ? WHERE id = ?'
      ).run(to.meal_id, to.servings, from.id);

      db.prepare(
        'UPDATE meal_plan_entries SET meal_id = ?, servings = ? WHERE id = ?'
      ).run(from.meal_id, from.servings, to.id);

      return true;
    });

    const result = swap();
    if (!result) {
      return res.status(404).json({ error: 'Slots nicht gefunden' });
    }

    // Return updated entries
    const entries = db.prepare(
      'SELECT * FROM meal_plan_entries WHERE plan_id = ? ORDER BY date, meal_type'
    ).all(plan.id);

    res.json(entries.map(rowToEntry));
  } catch (err) {
    console.error('Swap error:', err);
    res.status(500).json({ error: 'Tausch fehlgeschlagen' });
  }
});

export default router;
