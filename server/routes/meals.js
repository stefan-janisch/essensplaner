import { Router } from 'express';
import multer from 'multer';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { unlinkSync, existsSync } from 'fs';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();
router.use(requireAuth);

// Photo upload config
const storage = multer.diskStorage({
  destination: join(__dirname, '..', 'data', 'photos'),
  filename: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    cb(null, `${req.params.id}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Nur JPG, PNG und WebP Dateien sind erlaubt'));
    }
  }
});

function generateMealId() {
  const rand = Math.random().toString(36).substring(2, 15);
  return `meal_${Date.now()}_${rand}`;
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
  };
}

// List all meals
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM meals WHERE user_id = ? ORDER BY name').all(req.userId);
  res.json(rows.map(rowToMeal));
});

// Create meal
router.post('/', (req, res) => {
  try {
    const { name, ingredients, defaultServings, starred, rating, category, tags, recipeUrl, comment, recipeText } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name ist erforderlich' });
    }

    const id = generateMealId();

    db.prepare(`
      INSERT INTO meals (id, user_id, name, ingredients, default_servings, starred, rating, category, tags, recipe_url, comment, recipe_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.userId,
      name,
      JSON.stringify(ingredients || []),
      defaultServings || 2,
      starred ? 1 : 0,
      rating || null,
      category || null,
      tags ? JSON.stringify(tags) : null,
      recipeUrl || null,
      comment || null,
      recipeText || null
    );

    const row = db.prepare('SELECT * FROM meals WHERE id = ?').get(id);
    res.status(201).json(rowToMeal(row));
  } catch (err) {
    console.error('Create meal error:', err);
    res.status(500).json({ error: 'Mahlzeit konnte nicht erstellt werden' });
  }
});

// Update meal
router.put('/:id', (req, res) => {
  try {
    const meal = db.prepare('SELECT * FROM meals WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!meal) {
      return res.status(404).json({ error: 'Mahlzeit nicht gefunden' });
    }

    const { name, ingredients, defaultServings, starred, rating, category, tags, recipeUrl, comment, recipeText } = req.body;

    db.prepare(`
      UPDATE meals SET name = ?, ingredients = ?, default_servings = ?, starred = ?, rating = ?, category = ?, tags = ?, recipe_url = ?, comment = ?, recipe_text = ?
      WHERE id = ? AND user_id = ?
    `).run(
      name ?? meal.name,
      ingredients ? JSON.stringify(ingredients) : meal.ingredients,
      defaultServings ?? meal.default_servings,
      starred != null ? (starred ? 1 : 0) : meal.starred,
      rating !== undefined ? rating : meal.rating,
      category !== undefined ? category : meal.category,
      tags !== undefined ? (tags ? JSON.stringify(tags) : null) : meal.tags,
      recipeUrl !== undefined ? recipeUrl : meal.recipe_url,
      comment !== undefined ? comment : meal.comment,
      recipeText !== undefined ? recipeText : meal.recipe_text,
      req.params.id,
      req.userId
    );

    const row = db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id);
    res.json(rowToMeal(row));
  } catch (err) {
    console.error('Update meal error:', err);
    res.status(500).json({ error: 'Mahlzeit konnte nicht aktualisiert werden' });
  }
});

// Delete meal
router.delete('/:id', (req, res) => {
  const meal = db.prepare('SELECT * FROM meals WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!meal) {
    return res.status(404).json({ error: 'Mahlzeit nicht gefunden' });
  }

  // Delete photo file if exists
  if (meal.photo_url) {
    const photoPath = join(__dirname, '..', 'data', 'photos', meal.photo_url.split('/').pop());
    if (existsSync(photoPath)) {
      try { unlinkSync(photoPath); } catch { /* ignore */ }
    }
  }

  db.prepare('DELETE FROM meals WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

// Toggle star
router.patch('/:id/star', (req, res) => {
  const meal = db.prepare('SELECT * FROM meals WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!meal) {
    return res.status(404).json({ error: 'Mahlzeit nicht gefunden' });
  }

  const newStarred = meal.starred === 1 ? 0 : 1;
  db.prepare('UPDATE meals SET starred = ? WHERE id = ?').run(newStarred, req.params.id);

  res.json({ starred: newStarred === 1 });
});

// Rename ingredient across all meals
router.put('/rename-ingredient', (req, res) => {
  try {
    const { oldName, newName } = req.body;
    if (!oldName || !newName) {
      return res.status(400).json({ error: 'oldName und newName sind erforderlich' });
    }

    const meals = db.prepare('SELECT id, ingredients FROM meals WHERE user_id = ?').all(req.userId);

    const updateStmt = db.prepare('UPDATE meals SET ingredients = ? WHERE id = ?');

    const rename = db.transaction(() => {
      for (const meal of meals) {
        const ingredients = JSON.parse(meal.ingredients);
        let changed = false;
        for (const ing of ingredients) {
          if (ing.name === oldName) {
            ing.name = newName;
            changed = true;
          }
        }
        if (changed) {
          updateStmt.run(JSON.stringify(ingredients), meal.id);
        }
      }
    });

    rename();

    // Return updated meals
    const rows = db.prepare('SELECT * FROM meals WHERE user_id = ? ORDER BY name').all(req.userId);
    res.json(rows.map(rowToMeal));
  } catch (err) {
    console.error('Rename ingredient error:', err);
    res.status(500).json({ error: 'Umbenennung fehlgeschlagen' });
  }
});

// Upload photo
router.post('/:id/photo', upload.single('photo'), (req, res) => {
  try {
    const meal = db.prepare('SELECT * FROM meals WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!meal) {
      return res.status(404).json({ error: 'Mahlzeit nicht gefunden' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }

    // Delete old photo if exists
    if (meal.photo_url) {
      const oldPath = join(__dirname, '..', 'data', 'photos', meal.photo_url.split('/').pop());
      if (existsSync(oldPath)) {
        try { unlinkSync(oldPath); } catch { /* ignore */ }
      }
    }

    const photoUrl = `/api/photos/${req.file.filename}`;
    db.prepare('UPDATE meals SET photo_url = ? WHERE id = ?').run(photoUrl, req.params.id);

    res.json({ photoUrl });
  } catch (err) {
    console.error('Upload photo error:', err);
    res.status(500).json({ error: 'Foto konnte nicht hochgeladen werden' });
  }
});

// Delete photo
router.delete('/:id/photo', (req, res) => {
  const meal = db.prepare('SELECT * FROM meals WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!meal) {
    return res.status(404).json({ error: 'Mahlzeit nicht gefunden' });
  }

  if (meal.photo_url) {
    const photoPath = join(__dirname, '..', 'data', 'photos', meal.photo_url.split('/').pop());
    if (existsSync(photoPath)) {
      try { unlinkSync(photoPath); } catch { /* ignore */ }
    }
  }

  db.prepare('UPDATE meals SET photo_url = NULL WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
