import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// All admin routes require admin privileges
router.use(requireAdmin);

// GET /api/admin/ai-usage — detailed AI usage with filters
router.get('/ai-usage', (req, res) => {
  try {
    const { from, to, userId, endpoint, groupBy } = req.query;

    // Summary: grouped by endpoint, user, or day
    if (groupBy === 'endpoint') {
      let sql = `
        SELECT endpoint, model,
          COUNT(*) as call_count,
          SUM(prompt_tokens) as total_prompt_tokens,
          SUM(completion_tokens) as total_completion_tokens,
          SUM(total_tokens) as total_tokens,
          SUM(cost_usd) as total_cost
        FROM ai_usage WHERE 1=1
      `;
      const params = [];
      if (from) { sql += ' AND created_at >= ?'; params.push(from); }
      if (to) { sql += ' AND created_at <= ?'; params.push(to + ' 23:59:59'); }
      if (userId) { sql += ' AND user_id = ?'; params.push(Number(userId)); }
      sql += ' GROUP BY endpoint, model ORDER BY total_cost DESC';
      const rows = db.prepare(sql).all(...params);
      return res.json({ data: rows });
    }

    if (groupBy === 'user') {
      let sql = `
        SELECT u.email, a.user_id,
          COUNT(*) as call_count,
          SUM(a.prompt_tokens) as total_prompt_tokens,
          SUM(a.completion_tokens) as total_completion_tokens,
          SUM(a.total_tokens) as total_tokens,
          SUM(a.cost_usd) as total_cost
        FROM ai_usage a JOIN users u ON u.id = a.user_id WHERE 1=1
      `;
      const params = [];
      if (from) { sql += ' AND a.created_at >= ?'; params.push(from); }
      if (to) { sql += ' AND a.created_at <= ?'; params.push(to + ' 23:59:59'); }
      if (endpoint) { sql += ' AND a.endpoint = ?'; params.push(endpoint); }
      sql += ' GROUP BY a.user_id ORDER BY total_cost DESC';
      const rows = db.prepare(sql).all(...params);
      return res.json({ data: rows });
    }

    if (groupBy === 'day') {
      let sql = `
        SELECT date(created_at) as day,
          COUNT(*) as call_count,
          SUM(prompt_tokens) as total_prompt_tokens,
          SUM(completion_tokens) as total_completion_tokens,
          SUM(total_tokens) as total_tokens,
          SUM(cost_usd) as total_cost
        FROM ai_usage WHERE 1=1
      `;
      const params = [];
      if (from) { sql += ' AND created_at >= ?'; params.push(from); }
      if (to) { sql += ' AND created_at <= ?'; params.push(to + ' 23:59:59'); }
      if (userId) { sql += ' AND user_id = ?'; params.push(Number(userId)); }
      if (endpoint) { sql += ' AND endpoint = ?'; params.push(endpoint); }
      sql += ' GROUP BY day ORDER BY day DESC';
      const rows = db.prepare(sql).all(...params);
      return res.json({ data: rows });
    }

    // Default: return individual records (newest first, limited)
    let sql = `
      SELECT a.*, u.email
      FROM ai_usage a JOIN users u ON u.id = a.user_id WHERE 1=1
    `;
    const params = [];
    if (from) { sql += ' AND a.created_at >= ?'; params.push(from); }
    if (to) { sql += ' AND a.created_at <= ?'; params.push(to + ' 23:59:59'); }
    if (userId) { sql += ' AND a.user_id = ?'; params.push(Number(userId)); }
    if (endpoint) { sql += ' AND a.endpoint = ?'; params.push(endpoint); }
    sql += ' ORDER BY a.created_at DESC LIMIT 500';
    const rows = db.prepare(sql).all(...params);

    // Also return total summary
    let sumSql = `
      SELECT COUNT(*) as call_count,
        SUM(prompt_tokens) as total_prompt_tokens,
        SUM(completion_tokens) as total_completion_tokens,
        SUM(total_tokens) as total_tokens,
        SUM(cost_usd) as total_cost
      FROM ai_usage WHERE 1=1
    `;
    const sumParams = [];
    if (from) { sumSql += ' AND created_at >= ?'; sumParams.push(from); }
    if (to) { sumSql += ' AND created_at <= ?'; sumParams.push(to + ' 23:59:59'); }
    if (userId) { sumSql += ' AND user_id = ?'; sumParams.push(Number(userId)); }
    if (endpoint) { sumSql += ' AND endpoint = ?'; sumParams.push(endpoint); }
    const summary = db.prepare(sumSql).get(...sumParams);

    res.json({ data: rows, summary });
  } catch (err) {
    console.error('Admin AI usage error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der AI-Nutzungsdaten' });
  }
});

// GET /api/admin/ai-usage/summary — quick totals
router.get('/ai-usage/summary', (_req, res) => {
  try {
    const total = db.prepare(`
      SELECT COUNT(*) as call_count, SUM(cost_usd) as total_cost, SUM(total_tokens) as total_tokens
      FROM ai_usage
    `).get();

    const today = db.prepare(`
      SELECT COUNT(*) as call_count, SUM(cost_usd) as total_cost
      FROM ai_usage WHERE date(created_at) = date('now')
    `).get();

    const thisMonth = db.prepare(`
      SELECT COUNT(*) as call_count, SUM(cost_usd) as total_cost
      FROM ai_usage WHERE created_at >= date('now', 'start of month')
    `).get();

    res.json({ total, today, thisMonth });
  } catch (err) {
    console.error('Admin summary error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Zusammenfassung' });
  }
});

// GET /api/admin/users — list all users
router.get('/users', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, email, is_admin, is_approved, created_at
      FROM users ORDER BY created_at DESC
    `).all();
    res.json({ users });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Benutzerliste' });
  }
});

// PATCH /api/admin/users/:id/approve — approve a user
router.patch('/users/:id/approve', (req, res) => {
  try {
    const userId = Number(req.params.id);
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }
    db.prepare('UPDATE users SET is_approved = 1 WHERE id = ?').run(userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin approve error:', err);
    res.status(500).json({ error: 'Fehler beim Freischalten des Benutzers' });
  }
});

// DELETE /api/admin/users/:id — delete a user
router.delete('/users/:id', (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (userId === req.userId) {
      return res.status(400).json({ error: 'Du kannst dich nicht selbst löschen' });
    }
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Fehler beim Löschen des Benutzers' });
  }
});

export default router;
