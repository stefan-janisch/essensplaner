import { Router } from 'express';
import crypto from 'crypto';
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

function rowToPlan(row, userId) {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
    isOwner: row.user_id === userId,
    ownerEmail: row.owner_email || null,
  };
}

function rowToMeal(row) {
  return {
    id: row.id,
    name: row.name,
    ingredients: JSON.parse(row.ingredients),
    defaultServings: row.default_servings,
    starred: row.starred === 1,
    rating: row.rating,
    category: row.category,
    tags: row.tags ? JSON.parse(row.tags) : undefined,
    photoUrl: row.photo_url,
    recipeUrl: row.recipe_url,
    comment: row.comment,
    recipeText: row.recipe_text,
    prepTime: row.prep_time,
    totalTime: row.total_time,
  };
}

// Verify plan belongs to user (as owner or collaborator)
function getPlanForUser(planId, userId) {
  return db.prepare(`
    SELECT mp.* FROM meal_plans mp
    WHERE mp.id = ?
    AND (mp.user_id = ? OR EXISTS (
      SELECT 1 FROM plan_collaborators pc WHERE pc.plan_id = mp.id AND pc.user_id = ?
    ))
  `).get(planId, userId, userId);
}

// Check if user is the owner of a plan
function isOwner(planId, userId) {
  const plan = db.prepare('SELECT user_id FROM meal_plans WHERE id = ?').get(planId);
  return plan && plan.user_id === userId;
}

// List all plans (owned + collaborated)
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT mp.*, u.email AS owner_email FROM meal_plans mp
    JOIN users u ON u.id = mp.user_id
    WHERE mp.user_id = ?
    UNION
    SELECT mp.*, u.email AS owner_email FROM meal_plans mp
    JOIN plan_collaborators pc ON pc.plan_id = mp.id
    JOIN users u ON u.id = mp.user_id
    WHERE pc.user_id = ?
    ORDER BY created_at DESC
  `).all(req.userId, req.userId);
  res.json(rows.map(r => rowToPlan(r, req.userId)));
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

    const plan = db.prepare('SELECT mp.*, u.email AS owner_email FROM meal_plans mp JOIN users u ON u.id = mp.user_id WHERE mp.id = ?').get(result.lastInsertRowid);
    res.status(201).json(rowToPlan(plan, req.userId));
  } catch (err) {
    console.error('Create plan error:', err);
    res.status(500).json({ error: 'Plan konnte nicht erstellt werden' });
  }
});

// Get plan with entries + sharedMeals + collaborators
router.get('/:planId', (req, res) => {
  const plan = getPlanForUser(req.params.planId, req.userId);
  if (!plan) {
    return res.status(404).json({ error: 'Plan nicht gefunden' });
  }

  const entries = db.prepare(
    'SELECT * FROM meal_plan_entries WHERE plan_id = ? ORDER BY date, meal_type'
  ).all(plan.id);

  // Get user's own meal IDs
  const userMealIds = new Set(
    db.prepare('SELECT id FROM meals WHERE user_id = ?').all(req.userId).map(r => r.id)
  );

  // Find foreign meal IDs referenced in entries
  const foreignMealIds = [...new Set(
    entries.map(e => e.meal_id).filter(id => id && !userMealIds.has(id))
  )];

  // Load foreign meals
  const sharedMeals = foreignMealIds.map(id =>
    db.prepare('SELECT * FROM meals WHERE id = ?').get(id)
  ).filter(Boolean).map(rowToMeal);

  // Get collaborators
  const collaborators = db.prepare(`
    SELECT u.id, u.email FROM plan_collaborators pc
    JOIN users u ON u.id = pc.user_id
    WHERE pc.plan_id = ?
  `).all(plan.id);

  const ownerRow = db.prepare('SELECT email FROM users WHERE id = ?').get(plan.user_id);

  res.json({
    ...rowToPlan(plan, req.userId),
    ownerEmail: ownerRow?.email || null,
    entries: entries.map(rowToEntry),
    sharedMeals,
    collaborators,
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

  const updated = db.prepare('SELECT mp.*, u.email AS owner_email FROM meal_plans mp JOIN users u ON u.id = mp.user_id WHERE mp.id = ?').get(plan.id);
  res.json(rowToPlan(updated, req.userId));
});

// Delete plan (owner) or leave plan (collaborator)
router.delete('/:planId', (req, res) => {
  const plan = getPlanForUser(req.params.planId, req.userId);
  if (!plan) {
    return res.status(404).json({ error: 'Plan nicht gefunden' });
  }

  if (plan.user_id === req.userId) {
    // Owner: delete plan entirely
    db.prepare('DELETE FROM meal_plans WHERE id = ?').run(plan.id);
  } else {
    // Collaborator: leave plan
    db.prepare('DELETE FROM plan_collaborators WHERE plan_id = ? AND user_id = ?').run(plan.id, req.userId);
  }

  res.json({ ok: true });
});

// Add meal to slot
router.post('/:planId/entries', (req, res) => {
  const plan = getPlanForUser(req.params.planId, req.userId);
  if (!plan) {
    return res.status(404).json({ error: 'Plan nicht gefunden' });
  }

  try {
    const { date, mealType, mealId, servings } = req.body;
    if (!date || !mealType || !mealId) {
      return res.status(400).json({ error: 'date, mealType und mealId sind erforderlich' });
    }

    const result = db.prepare(
      'INSERT INTO meal_plan_entries (plan_id, date, meal_type, meal_id, servings) VALUES (?, ?, ?, ?, ?)'
    ).run(plan.id, date, mealType, mealId, servings ?? 2);

    const row = db.prepare('SELECT * FROM meal_plan_entries WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(rowToEntry(row));
  } catch (err) {
    console.error('Add entry error:', err);
    res.status(500).json({ error: 'Eintrag konnte nicht erstellt werden' });
  }
});

// Update entry
router.put('/:planId/entries/:entryId', (req, res) => {
  const plan = getPlanForUser(req.params.planId, req.userId);
  if (!plan) {
    return res.status(404).json({ error: 'Plan nicht gefunden' });
  }

  try {
    const entry = db.prepare('SELECT * FROM meal_plan_entries WHERE id = ? AND plan_id = ?')
      .get(req.params.entryId, plan.id);
    if (!entry) {
      return res.status(404).json({ error: 'Eintrag nicht gefunden' });
    }

    const { servings, enabled } = req.body;
    db.prepare(
      'UPDATE meal_plan_entries SET servings = ?, enabled = ? WHERE id = ?'
    ).run(
      servings !== undefined ? servings : entry.servings,
      enabled !== undefined ? (enabled ? 1 : 0) : entry.enabled,
      entry.id
    );

    const row = db.prepare('SELECT * FROM meal_plan_entries WHERE id = ?').get(entry.id);
    res.json(rowToEntry(row));
  } catch (err) {
    console.error('Update entry error:', err);
    res.status(500).json({ error: 'Eintrag konnte nicht aktualisiert werden' });
  }
});

// Delete entry
router.delete('/:planId/entries/:entryId', (req, res) => {
  const plan = getPlanForUser(req.params.planId, req.userId);
  if (!plan) {
    return res.status(404).json({ error: 'Plan nicht gefunden' });
  }

  const entry = db.prepare('SELECT * FROM meal_plan_entries WHERE id = ? AND plan_id = ?')
    .get(req.params.entryId, plan.id);
  if (!entry) {
    return res.status(404).json({ error: 'Eintrag nicht gefunden' });
  }

  db.prepare('DELETE FROM meal_plan_entries WHERE id = ?').run(entry.id);
  res.json({ ok: true });
});

// Move entry to another slot
router.put('/:planId/entries/:entryId/move', (req, res) => {
  const plan = getPlanForUser(req.params.planId, req.userId);
  if (!plan) {
    return res.status(404).json({ error: 'Plan nicht gefunden' });
  }

  try {
    const entry = db.prepare('SELECT * FROM meal_plan_entries WHERE id = ? AND plan_id = ?')
      .get(req.params.entryId, plan.id);
    if (!entry) {
      return res.status(404).json({ error: 'Eintrag nicht gefunden' });
    }

    const { toDate, toMealType } = req.body;
    if (!toDate || !toMealType) {
      return res.status(400).json({ error: 'toDate und toMealType sind erforderlich' });
    }

    db.prepare(
      'UPDATE meal_plan_entries SET date = ?, meal_type = ? WHERE id = ?'
    ).run(toDate, toMealType, entry.id);

    const row = db.prepare('SELECT * FROM meal_plan_entries WHERE id = ?').get(entry.id);
    res.json(rowToEntry(row));
  } catch (err) {
    console.error('Move entry error:', err);
    res.status(500).json({ error: 'Eintrag konnte nicht verschoben werden' });
  }
});

// --- Share management (owner only) ---

// Create share link
router.post('/:planId/share', (req, res) => {
  const plan = getPlanForUser(req.params.planId, req.userId);
  if (!plan) {
    return res.status(404).json({ error: 'Plan nicht gefunden' });
  }
  if (!isOwner(req.params.planId, req.userId)) {
    return res.status(403).json({ error: 'Nur der Besitzer kann den Plan teilen' });
  }

  try {
    // Check if share already exists
    const existing = db.prepare('SELECT * FROM plan_shares WHERE plan_id = ?').get(plan.id);
    if (existing) {
      const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      return res.json({
        token: existing.token,
        url: `${baseUrl}/share/${existing.token}`,
        expiresAt: existing.expires_at,
      });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const expiresInDays = req.body.expiresInDays || 30;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(
      'INSERT INTO plan_shares (plan_id, token, created_by, expires_at) VALUES (?, ?, ?, ?)'
    ).run(plan.id, token, req.userId, expiresAt);

    const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.status(201).json({
      token,
      url: `${baseUrl}/share/${token}`,
      expiresAt,
    });
  } catch (err) {
    console.error('Create share error:', err);
    res.status(500).json({ error: 'Teilen fehlgeschlagen' });
  }
});

// Get share info
router.get('/:planId/share', (req, res) => {
  const plan = getPlanForUser(req.params.planId, req.userId);
  if (!plan) {
    return res.status(404).json({ error: 'Plan nicht gefunden' });
  }
  if (!isOwner(req.params.planId, req.userId)) {
    return res.status(403).json({ error: 'Nur der Besitzer kann Teilungsinfo sehen' });
  }

  const share = db.prepare('SELECT * FROM plan_shares WHERE plan_id = ?').get(plan.id);
  if (!share) {
    return res.json(null);
  }

  const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  res.json({
    token: share.token,
    url: `${baseUrl}/share/${share.token}`,
    expiresAt: share.expires_at,
  });
});

// Revoke share link
router.delete('/:planId/share', (req, res) => {
  const plan = getPlanForUser(req.params.planId, req.userId);
  if (!plan) {
    return res.status(404).json({ error: 'Plan nicht gefunden' });
  }
  if (!isOwner(req.params.planId, req.userId)) {
    return res.status(403).json({ error: 'Nur der Besitzer kann den Link widerrufen' });
  }

  db.prepare('DELETE FROM plan_shares WHERE plan_id = ?').run(plan.id);
  res.json({ ok: true });
});

// Remove collaborator (owner only)
router.delete('/:planId/collaborators/:userId', (req, res) => {
  if (!isOwner(req.params.planId, req.userId)) {
    return res.status(403).json({ error: 'Nur der Besitzer kann Mitarbeiter entfernen' });
  }

  db.prepare('DELETE FROM plan_collaborators WHERE plan_id = ? AND user_id = ?')
    .run(req.params.planId, req.params.userId);
  res.json({ ok: true });
});

export default router;
