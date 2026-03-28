import { Router } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const BCRYPT_ROUNDS = 12;

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' }
});

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'E-Mail und Passwort sind erforderlich' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen lang sein' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'Diese E-Mail-Adresse ist bereits registriert' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = db.prepare(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)'
    ).run(email.toLowerCase(), passwordHash);

    req.session.userId = result.lastInsertRowid;

    res.status(201).json({
      id: result.lastInsertRowid,
      email: email.toLowerCase(),
      defaultServings: 2
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registrierung fehlgeschlagen' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'E-Mail und Passwort sind erforderlich' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Ungültige E-Mail oder Passwort' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Ungültige E-Mail oder Passwort' });
    }

    req.session.userId = user.id;

    res.json({
      id: user.id,
      email: user.email,
      defaultServings: user.default_servings
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Anmeldung fehlgeschlagen' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Abmeldung fehlgeschlagen' });
    }
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, default_servings FROM users WHERE id = ?').get(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }
  res.json({
    id: user.id,
    email: user.email,
    defaultServings: user.default_servings
  });
});

// Migration endpoint: upload localStorage data
router.post('/migrate', requireAuth, (req, res) => {
  try {
    const { meals, plan, defaultServings } = req.body;

    const migrate = db.transaction(() => {
      // Update default servings
      if (defaultServings != null) {
        db.prepare('UPDATE users SET default_servings = ? WHERE id = ?')
          .run(defaultServings, req.userId);
      }

      // Insert meals
      if (Array.isArray(meals)) {
        const insertMeal = db.prepare(`
          INSERT OR IGNORE INTO meals (id, user_id, name, ingredients, default_servings, starred, recipe_url, comment, recipe_text)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const meal of meals) {
          insertMeal.run(
            meal.id,
            req.userId,
            meal.name,
            JSON.stringify(meal.ingredients || []),
            meal.defaultServings || 2,
            meal.starred ? 1 : 0,
            meal.recipeUrl || null,
            meal.comment || null,
            meal.recipeText || null
          );
        }
      }

      // Create a meal plan and insert entries
      if (plan && plan.startDate && plan.endDate && Array.isArray(plan.entries)) {
        const planResult = db.prepare(
          'INSERT INTO meal_plans (user_id, name, start_date, end_date) VALUES (?, ?, ?, ?)'
        ).run(req.userId, 'Importierter Plan', plan.startDate, plan.endDate);

        const planId = planResult.lastInsertRowid;

        const insertEntry = db.prepare(`
          INSERT OR IGNORE INTO meal_plan_entries (plan_id, date, meal_type, meal_id, servings, enabled)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const entry of plan.entries) {
          insertEntry.run(
            planId,
            entry.date,
            entry.mealType,
            entry.mealId || null,
            entry.servings || 2,
            entry.enabled ? 1 : 0
          );
        }
      }
    });

    migrate();

    res.json({ ok: true });
  } catch (err) {
    console.error('Migration error:', err);
    res.status(500).json({ error: 'Migration fehlgeschlagen' });
  }
});

export default router;
