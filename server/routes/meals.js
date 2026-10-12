import { Router } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { unlinkSync, existsSync, writeFileSync } from 'fs';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { rowToMeal } from '../utils/transformers.js';
import { validateExternalUrl, isValidFilename } from '../utils/security.js';
import { parseNutrition } from '../nutritionMicros.js';
import { parseSuppliedNutrition, withHighProteinTag } from '../nutritionEstimate.js';

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
  if (!filename || !isValidFilename(filename)) return;
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

    // Invalidate nutrition cache when ingredients change — the portion weight is derived
    // from the same ingredients, so it goes stale together with the nutrition.
    const nutritionValue = ingredients ? null : meal.nutrition_per_serving;
    const portionWeightValue = ingredients ? null : meal.portion_weight_g;

    db.prepare(`
      UPDATE meals SET name = ?, ingredients = ?, shopping_ingredients = ?, default_servings = ?, starred = ?, rating = ?, category = ?, tags = ?, recipe_url = ?, comment = ?, recipe_text = ?, prep_time = ?, total_time = ?, nutrition_per_serving = ?, portion_weight_g = ?
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
      nutritionValue,
      portionWeightValue,
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

// --- Quick meals (eaten without recipe, e.g. canteen): nutrition only, optional plate photo ---

const quickPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Nur JPG, PNG und WebP Dateien sind erlaubt'));
  },
});

function handleQuickUpload(req, res, next) {
  quickPhotoUpload.single('photo')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Bild ist zu groß (max. 10 MB).' : (err.message || 'Upload fehlgeschlagen');
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

/** Validate the JSON "data" field of a quick meal create/update request. */
function parseQuickMealData(req) {
  let data;
  try { data = JSON.parse(req.body?.data || '{}'); } catch { return { error: 'Ungültige Daten' }; }
  const name = String(data.name || '').trim().slice(0, 200);
  if (!name) return { error: 'Name ist erforderlich' };
  const nutrition = parseNutrition(data.nutritionPerServing);
  if (nutrition.kcal <= 0) return { error: 'Kalorien sind erforderlich' };
  return {
    name,
    description: String(data.description || '').slice(0, 2000) || null,
    breakdown: String(data.breakdown || '').slice(0, 5000) || null,
    nutrition,
    removePhoto: !!data.removePhoto,
    isDrink: !!data.isDrink,
  };
}

/** Store an uploaded plate photo under a unique name (so browsers don't show a cached old one). */
function saveQuickPhoto(file, mealId) {
  const ext = file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg';
  const filename = `${mealId}_${Date.now()}${ext}`;
  writeFileSync(join(__dirname, '..', 'data', 'photos', filename), file.buffer);
  return `/api/photos/${filename}`;
}

router.post('/quick', handleQuickUpload, (req, res) => {
  try {
    const q = parseQuickMealData(req);
    if (q.error) return res.status(400).json({ error: q.error });

    const id = generateMealId();
    const photoUrl = req.file ? saveQuickPhoto(req.file, id) : null;
    db.prepare(`
      INSERT INTO meals (id, user_id, name, ingredients, default_servings, comment, recipe_text, photo_url, nutrition_per_serving, is_quick, is_drink)
      VALUES (?, ?, ?, '[]', 1, ?, ?, ?, ?, 1, ?)
    `).run(id, req.userId, q.name, q.description, q.breakdown, photoUrl, JSON.stringify(q.nutrition), q.isDrink ? 1 : 0);

    res.status(201).json(rowToMeal(db.prepare('SELECT * FROM meals WHERE id = ?').get(id)));
  } catch (err) {
    console.error('Create quick meal error:', err);
    res.status(500).json({ error: 'Mahlzeit konnte nicht gespeichert werden' });
  }
});

router.put('/quick/:id', handleQuickUpload, (req, res) => {
  try {
    const meal = getMealForUser(req.params.id, req.userId);
    if (!meal || !meal.is_quick) return res.status(404).json({ error: 'Mahlzeit nicht gefunden' });
    const q = parseQuickMealData(req);
    if (q.error) return res.status(400).json({ error: q.error });

    let photoUrl = meal.photo_url;
    if (req.file || q.removePhoto) {
      deletePhotoFile(meal.photo_url);
      photoUrl = req.file ? saveQuickPhoto(req.file, meal.id) : null;
    }
    db.prepare(`
      UPDATE meals SET name = ?, comment = ?, recipe_text = ?, photo_url = ?, nutrition_per_serving = ?
      WHERE id = ? AND user_id = ?
    `).run(q.name, q.description, q.breakdown, photoUrl, JSON.stringify(q.nutrition), meal.id, req.userId);

    res.json(rowToMeal(db.prepare('SELECT * FROM meals WHERE id = ?').get(meal.id)));
  } catch (err) {
    console.error('Update quick meal error:', err);
    res.status(500).json({ error: 'Mahlzeit konnte nicht gespeichert werden' });
  }
});

// When and how often each quick meal was entered in a plan (for "Zuletzt gegessen"): the latest
// day up to `today` (the client's date); only meals that are merely planned get a future day.
// Menu-course slots ("course_…") have no date and are left out.
router.get('/quick/usage', (req, res) => {
  const today = /^\d{4}-\d{2}-\d{2}$/.test(req.query.today) ? req.query.today : new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT e.meal_id AS mealId,
           COALESCE(MAX(CASE WHEN e.date <= ? THEN e.date END), MIN(e.date)) AS lastDate,
           COUNT(*) AS count
    FROM meal_plan_entries e JOIN meals m ON m.id = e.meal_id
    WHERE m.user_id = ? AND m.is_quick = 1 AND m.is_drink = 0 AND e.date NOT LIKE 'course_%'
    GROUP BY e.meal_id
  `).all(today, req.userId);
  res.json(Object.fromEntries(rows.map(r => [r.mealId, { lastDate: r.lastDate, count: r.count }])));
});

// Move a meal between recipes and quick meals. Everything else (ingredients → shopping list,
// category/tags → booster suggestions, nutrition) stays as it is, so this is reversible.
router.patch('/:id/quick', (req, res) => {
  const meal = getMealForUser(req.params.id, req.userId);
  if (!meal) return res.status(404).json({ error: 'Mahlzeit nicht gefunden' });
  const isQuick = req.body?.isQuick ? 1 : 0;
  db.prepare('UPDATE meals SET is_quick = ? WHERE id = ? AND user_id = ?').run(isQuick, meal.id, req.userId);
  res.json(rowToMeal(db.prepare('SELECT * FROM meals WHERE id = ?').get(meal.id)));
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

      // Nutrition from the file (per serving, like our own export); `nutrition` accepted as alias.
      const nutrition = parseSuppliedNutrition(recipe.nutritionPerServing ?? recipe.nutrition);
      const importedTags = Array.isArray(recipe.tags) ? recipe.tags.filter(t => typeof t === 'string') : null;
      const tags = nutrition ? withHighProteinTag(importedTags || [], nutrition) : importedTags;

      db.prepare(`
        INSERT INTO meals (id, user_id, name, ingredients, shopping_ingredients, default_servings, starred, rating, category, tags, recipe_url, comment, recipe_text, prep_time, total_time, nutrition_per_serving)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        tags ? JSON.stringify(tags) : null,
        recipe.recipeUrl || null,
        recipe.comment || null,
        recipe.recipeText || null,
        recipe.prepTime || null,
        recipe.totalTime || null,
        nutrition ? JSON.stringify(nutrition) : null
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

    // SSRF protection
    try {
      validateExternalUrl(url);
    } catch (e) {
      return res.status(400).json({ error: e.message });
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

// --- Meal share endpoints ---

function getMealShareBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

router.post('/:id/share', (req, res) => {
  const meal = getMealForUser(req.params.id, req.userId);
  if (!meal) return res.status(404).json({ error: 'Rezept nicht gefunden' });

  const existing = db.prepare('SELECT * FROM meal_shares WHERE meal_id = ?').get(meal.id);
  const baseUrl = getMealShareBaseUrl(req);
  if (existing) {
    return res.json({ token: existing.token, url: `${baseUrl}/?shared-meal=${existing.token}` });
  }
  const token = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO meal_shares (meal_id, token, created_by) VALUES (?, ?, ?)').run(meal.id, token, req.userId);
  res.json({ token, url: `${baseUrl}/?shared-meal=${token}` });
});

router.get('/:id/share', (req, res) => {
  const meal = getMealForUser(req.params.id, req.userId);
  if (!meal) return res.status(404).json({ error: 'Rezept nicht gefunden' });

  const share = db.prepare('SELECT * FROM meal_shares WHERE meal_id = ?').get(meal.id);
  if (!share) return res.json({ shared: false });
  const baseUrl = getMealShareBaseUrl(req);
  res.json({ shared: true, token: share.token, url: `${baseUrl}/?shared-meal=${share.token}` });
});

router.delete('/:id/share', (req, res) => {
  const meal = getMealForUser(req.params.id, req.userId);
  if (!meal) return res.status(404).json({ error: 'Rezept nicht gefunden' });

  db.prepare('DELETE FROM meal_shares WHERE meal_id = ?').run(meal.id);
  res.json({ ok: true });
});

export default router;
