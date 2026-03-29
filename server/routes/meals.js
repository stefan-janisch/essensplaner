import { Router } from 'express';
import multer from 'multer';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { unlinkSync, existsSync, writeFileSync } from 'fs';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { rowToMeal } from '../utils/transformers.js';

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

function getMealForUser(mealId, userId) {
  return db.prepare('SELECT * FROM meals WHERE id = ? AND user_id = ?').get(mealId, userId);
}

function deletePhotoFile(photoUrl) {
  if (!photoUrl) return;
  const filename = photoUrl.split('/').pop();
  const photoPath = join(__dirname, '..', 'data', 'photos', filename);
  if (existsSync(photoPath)) {
    try { unlinkSync(photoPath); } catch { /* ignore */ }
  }
}

async function downloadAndSavePhoto(url, mealId) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Essensplaner/1.0)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;

  const contentType = response.headers.get('content-type') || '';
  let ext = '.jpg';
  if (contentType.includes('png')) ext = '.png';
  else if (contentType.includes('webp')) ext = '.webp';

  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = `${mealId}${ext}`;
  const filePath = join(__dirname, '..', 'data', 'photos', filename);
  writeFileSync(filePath, buffer);

  const photoUrl = `/api/photos/${filename}`;
  db.prepare('UPDATE meals SET photo_url = ? WHERE id = ?').run(photoUrl, mealId);
  return photoUrl;
}

// List all meals
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM meals WHERE user_id = ? ORDER BY name').all(req.userId);
  res.json(rows.map(rowToMeal));
});

// Create meal
router.post('/', (req, res) => {
  try {
    const { name, ingredients, shoppingIngredients, defaultServings, starred, rating, category, tags, recipeUrl, comment, recipeText, prepTime, totalTime } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name ist erforderlich' });
    }

    const id = generateMealId();

    db.prepare(`
      INSERT INTO meals (id, user_id, name, ingredients, shopping_ingredients, default_servings, starred, rating, category, tags, recipe_url, comment, recipe_text, prep_time, total_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.userId,
      name,
      JSON.stringify(ingredients || []),
      shoppingIngredients ? JSON.stringify(shoppingIngredients) : null,
      defaultServings || 2,
      starred ? 1 : 0,
      rating || null,
      category || null,
      tags ? JSON.stringify(tags) : null,
      recipeUrl || null,
      comment || null,
      recipeText || null,
      prepTime || null,
      totalTime || null
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
    const meal = getMealForUser(req.params.id, req.userId);
    if (!meal) {
      return res.status(404).json({ error: 'Mahlzeit nicht gefunden' });
    }

    const { name, ingredients, shoppingIngredients, defaultServings, starred, rating, category, tags, recipeUrl, comment, recipeText, prepTime, totalTime } = req.body;

    db.prepare(`
      UPDATE meals SET name = ?, ingredients = ?, shopping_ingredients = ?, default_servings = ?, starred = ?, rating = ?, category = ?, tags = ?, recipe_url = ?, comment = ?, recipe_text = ?, prep_time = ?, total_time = ?
      WHERE id = ? AND user_id = ?
    `).run(
      name ?? meal.name,
      ingredients ? JSON.stringify(ingredients) : meal.ingredients,
      shoppingIngredients !== undefined ? (shoppingIngredients ? JSON.stringify(shoppingIngredients) : null) : meal.shopping_ingredients,
      defaultServings ?? meal.default_servings,
      starred != null ? (starred ? 1 : 0) : meal.starred,
      rating !== undefined ? rating : meal.rating,
      category !== undefined ? category : meal.category,
      tags !== undefined ? (tags ? JSON.stringify(tags) : null) : meal.tags,
      recipeUrl !== undefined ? recipeUrl : meal.recipe_url,
      comment !== undefined ? comment : meal.comment,
      recipeText !== undefined ? recipeText : meal.recipe_text,
      prepTime !== undefined ? (prepTime || null) : meal.prep_time,
      totalTime !== undefined ? (totalTime || null) : meal.total_time,
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
  const meal = getMealForUser(req.params.id, req.userId);
  if (!meal) {
    return res.status(404).json({ error: 'Mahlzeit nicht gefunden' });
  }

  deletePhotoFile(meal.photo_url);

  db.prepare('DELETE FROM meals WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

// Toggle star
router.patch('/:id/star', (req, res) => {
  const meal = getMealForUser(req.params.id, req.userId);
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

    const meals = db.prepare('SELECT id, ingredients, shopping_ingredients FROM meals WHERE user_id = ?').all(req.userId);

    const updateStmt = db.prepare('UPDATE meals SET ingredients = ?, shopping_ingredients = ? WHERE id = ?');

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

        let shoppingIngredients = meal.shopping_ingredients ? JSON.parse(meal.shopping_ingredients) : null;
        if (shoppingIngredients) {
          for (const ing of shoppingIngredients) {
            if (ing.name === oldName) {
              ing.name = newName;
              changed = true;
            }
          }
        }

        if (changed) {
          updateStmt.run(
            JSON.stringify(ingredients),
            shoppingIngredients ? JSON.stringify(shoppingIngredients) : meal.shopping_ingredients,
            meal.id
          );
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
    const meal = getMealForUser(req.params.id, req.userId);
    if (!meal) {
      return res.status(404).json({ error: 'Mahlzeit nicht gefunden' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }

    deletePhotoFile(meal.photo_url);

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
  const meal = getMealForUser(req.params.id, req.userId);
  if (!meal) {
    return res.status(404).json({ error: 'Mahlzeit nicht gefunden' });
  }

  deletePhotoFile(meal.photo_url);

  db.prepare('UPDATE meals SET photo_url = NULL WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Import recipes from export file
router.post('/import', async (req, res) => {
  try {
    const { recipes } = req.body;
    if (!Array.isArray(recipes) || recipes.length === 0) {
      return res.status(400).json({ error: 'recipes Array ist erforderlich' });
    }

    // Get existing meal names for duplicate check
    const existingNames = new Set(
      db.prepare('SELECT name FROM meals WHERE user_id = ?').all(req.userId).map(r => r.name.toLowerCase())
    );

    const createdMeals = [];
    const skippedNames = [];

    for (const recipe of recipes) {
      if (!recipe.name) continue;

      // Skip duplicates by name
      if (existingNames.has(recipe.name.toLowerCase())) {
        skippedNames.push(recipe.name);
        continue;
      }

      const id = generateMealId();

      db.prepare(`
        INSERT INTO meals (id, user_id, name, ingredients, shopping_ingredients, default_servings, starred, rating, category, tags, recipe_url, comment, recipe_text, prep_time, total_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        req.userId,
        recipe.name,
        JSON.stringify(recipe.ingredients || []),
        recipe.shoppingIngredients ? JSON.stringify(recipe.shoppingIngredients) : null,
        recipe.defaultServings || 2,
        0,
        recipe.rating || null,
        recipe.category || null,
        recipe.tags ? JSON.stringify(recipe.tags) : null,
        recipe.recipeUrl || null,
        recipe.comment || null,
        recipe.recipeText || null,
        recipe.prepTime || null,
        recipe.totalTime || null
      );

      // Try to download photo if URL provided
      if (recipe.photoUrl) {
        try {
          await downloadAndSavePhoto(recipe.photoUrl, id);
        } catch {
          // Photo download failed, continue without photo
        }
      }

      const row = db.prepare('SELECT * FROM meals WHERE id = ?').get(id);
      createdMeals.push(rowToMeal(row));
    }

    res.status(201).json({ imported: createdMeals, skipped: skippedNames });
  } catch (err) {
    console.error('Import recipes error:', err);
    res.status(500).json({ error: 'Import fehlgeschlagen' });
  }
});

// Download photo from URL and save locally
router.post('/:id/photo-from-url', async (req, res) => {
  try {
    const meal = getMealForUser(req.params.id, req.userId);
    if (!meal) {
      return res.status(404).json({ error: 'Mahlzeit nicht gefunden' });
    }

    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL ist erforderlich' });
    }

    deletePhotoFile(meal.photo_url);

    const photoUrl = await downloadAndSavePhoto(url, req.params.id);
    if (!photoUrl) {
      return res.status(400).json({ error: 'Foto konnte nicht heruntergeladen werden' });
    }

    res.json({ photoUrl });
  } catch (err) {
    console.error('Download photo from URL error:', err);
    res.status(500).json({ error: 'Foto konnte nicht heruntergeladen werden' });
  }
});

export default router;
