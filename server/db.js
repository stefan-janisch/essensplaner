import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'data', 'essensplaner.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// Migrations
const version = db.pragma('user_version', { simple: true });

if (version < 1) {
  console.log('Running migration v1: multi-meal slots...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS meal_plan_entries_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch', 'dinner')),
      meal_id TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
      servings INTEGER NOT NULL DEFAULT 2,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO meal_plan_entries_new (id, plan_id, date, meal_type, meal_id, servings, enabled)
      SELECT id, plan_id, date, meal_type, meal_id, servings, enabled
      FROM meal_plan_entries WHERE meal_id IS NOT NULL;
    DROP TABLE meal_plan_entries;
    ALTER TABLE meal_plan_entries_new RENAME TO meal_plan_entries;
    CREATE INDEX idx_entries_plan_id ON meal_plan_entries(plan_id);
    CREATE INDEX idx_entries_slot ON meal_plan_entries(plan_id, date, meal_type);
  `);
  db.pragma('user_version = 1');
  console.log('✓ Migration v1 complete');
}

if (version < 2) {
  console.log('Running migration v2: cooking times...');
  // Check if columns already exist (fresh DB has them from schema)
  const cols = db.prepare("PRAGMA table_info(meals)").all().map(c => c.name);
  if (!cols.includes('prep_time')) {
    db.exec('ALTER TABLE meals ADD COLUMN prep_time INTEGER');
  }
  if (!cols.includes('total_time')) {
    db.exec('ALTER TABLE meals ADD COLUMN total_time INTEGER');
  }
  db.pragma('user_version = 2');
  console.log('✓ Migration v2 complete');
}

if (version < 3) {
  console.log('Running migration v3: dual ingredient lists + conversion cache...');
  const cols = db.prepare("PRAGMA table_info(meals)").all().map(c => c.name);
  if (!cols.includes('shopping_ingredients')) {
    db.exec('ALTER TABLE meals ADD COLUMN shopping_ingredients TEXT');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS ingredient_conversions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_name TEXT NOT NULL,
      from_unit TEXT NOT NULL,
      to_unit TEXT NOT NULL,
      factor REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(ingredient_name, from_unit, to_unit)
    );
    CREATE INDEX IF NOT EXISTS idx_conv_name ON ingredient_conversions(ingredient_name);
  `);
  db.pragma('user_version = 3');
  console.log('✓ Migration v3 complete');
}

if (version < 4) {
  console.log('Running migration v4: archived meal plans...');
  const cols = db.prepare("PRAGMA table_info(meal_plans)").all().map(c => c.name);
  if (!cols.includes('archived')) {
    db.exec('ALTER TABLE meal_plans ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
  }
  db.pragma('user_version = 4');
  console.log('✓ Migration v4 complete');
}

if (version < 5) {
  console.log('Running migration v5: extras meal types (snacks, drinks, misc)...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS meal_plan_entries_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch', 'dinner', 'snacks', 'drinks', 'misc')),
      meal_id TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
      servings INTEGER NOT NULL DEFAULT 2,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO meal_plan_entries_new (id, plan_id, date, meal_type, meal_id, servings, enabled)
      SELECT id, plan_id, date, meal_type, meal_id, servings, enabled
      FROM meal_plan_entries;
    DROP TABLE meal_plan_entries;
    ALTER TABLE meal_plan_entries_new RENAME TO meal_plan_entries;
    CREATE INDEX idx_entries_plan_id ON meal_plan_entries(plan_id);
    CREATE INDEX idx_entries_slot ON meal_plan_entries(plan_id, date, meal_type);
  `);
  db.pragma('user_version = 5');
  console.log('✓ Migration v5 complete');
}

if (version < 6) {
  console.log('Running migration v6: plan extras table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS plan_extras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
      category TEXT NOT NULL CHECK(category IN ('snacks', 'drinks', 'misc')),
      name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT 'Stück',
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_extras_plan_id ON plan_extras(plan_id);
  `);
  db.pragma('user_version = 6');
  console.log('✓ Migration v6 complete');
}

if (version < 7) {
  console.log('Running migration v7: menu plans + courses...');
  const cols = db.prepare("PRAGMA table_info(meal_plans)").all().map(c => c.name);
  if (!cols.includes('plan_type')) {
    db.exec("ALTER TABLE meal_plans ADD COLUMN plan_type TEXT NOT NULL DEFAULT 'weekly'");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS menu_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      comment TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_menu_courses_plan_id ON menu_courses(plan_id);
  `);
  db.pragma('user_version = 7');
  console.log('✓ Migration v7 complete');
}

if (version < 8) {
  console.log('Running migration v8: extend meal_type + extras for menu plans...');
  // Rebuild meal_plan_entries with 'food' added to CHECK
  db.exec(`
    CREATE TABLE IF NOT EXISTS meal_plan_entries_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch', 'dinner', 'snacks', 'drinks', 'misc', 'food')),
      meal_id TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
      servings INTEGER NOT NULL DEFAULT 2,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO meal_plan_entries_new (id, plan_id, date, meal_type, meal_id, servings, enabled)
      SELECT id, plan_id, date, meal_type, meal_id, servings, enabled
      FROM meal_plan_entries;
    DROP TABLE meal_plan_entries;
    ALTER TABLE meal_plan_entries_new RENAME TO meal_plan_entries;
    CREATE INDEX idx_entries_plan_id ON meal_plan_entries(plan_id);
    CREATE INDEX idx_entries_slot ON meal_plan_entries(plan_id, date, meal_type);
  `);
  // Rebuild plan_extras with 'food' category + course_id
  db.exec(`
    CREATE TABLE IF NOT EXISTS plan_extras_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
      category TEXT NOT NULL CHECK(category IN ('snacks', 'drinks', 'misc', 'food')),
      name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT 'Stück',
      enabled INTEGER NOT NULL DEFAULT 1,
      course_id INTEGER REFERENCES menu_courses(id) ON DELETE CASCADE
    );
    INSERT INTO plan_extras_new (id, plan_id, category, name, amount, unit, enabled)
      SELECT id, plan_id, category, name, amount, unit, enabled
      FROM plan_extras;
    DROP TABLE plan_extras;
    ALTER TABLE plan_extras_new RENAME TO plan_extras;
    CREATE INDEX idx_extras_plan_id ON plan_extras(plan_id);
  `);
  db.pragma('user_version = 8');
  console.log('✓ Migration v8 complete');
}

if (version < 9) {
  console.log('Running migration v9: admin flag + AI usage tracking...');
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('is_admin')) {
    db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
  }
  // Set admin for janisch.stef@gmail.com
  db.prepare("UPDATE users SET is_admin = 1 WHERE email = ?").run('janisch.stef@gmail.com');
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON ai_usage(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage(created_at);
  `);
  db.pragma('user_version = 9');
  console.log('✓ Migration v9 complete');
}

if (version < 10) {
  console.log('Running migration v10: nutrition estimation cache + user targets...');
  const mealCols = db.prepare("PRAGMA table_info(meals)").all().map(c => c.name);
  if (!mealCols.includes('nutrition_per_serving')) {
    db.exec('ALTER TABLE meals ADD COLUMN nutrition_per_serving TEXT');
  }
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('nutrition_targets')) {
    db.exec('ALTER TABLE users ADD COLUMN nutrition_targets TEXT');
  }
  db.pragma('user_version = 10');
  console.log('✓ Migration v10 complete');
}

if (version < 11) {
  console.log('Running migration v11: meals per day setting...');
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('meals_per_day')) {
    db.exec('ALTER TABLE users ADD COLUMN meals_per_day INTEGER NOT NULL DEFAULT 3');
  }
  db.pragma('user_version = 11');
  console.log('✓ Migration v11 complete');
}

if (version < 12) {
  console.log('Running migration v12: nutrition profile + weight history...');
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('nutrition_profile')) {
    db.exec('ALTER TABLE users ADD COLUMN nutrition_profile TEXT');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS weight_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      weight REAL NOT NULL,
      body_fat REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_weight_history_user ON weight_history(user_id, date);
  `);
  db.pragma('user_version = 12');
  console.log('✓ Migration v12 complete');
}

if (version < 13) {
  console.log('Running migration v13: default servings per plan...');
  const planCols = db.prepare("PRAGMA table_info(meal_plans)").all().map(c => c.name);
  if (!planCols.includes('default_servings')) {
    db.exec('ALTER TABLE meal_plans ADD COLUMN default_servings INTEGER');
  }
  db.pragma('user_version = 13');
  console.log('✓ Migration v13 complete');
}

if (version < 14) {
  console.log('Running migration v14: optimal portions toggle...');
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('use_optimal_portions')) {
    db.exec('ALTER TABLE users ADD COLUMN use_optimal_portions INTEGER DEFAULT 0');
  }
  db.pragma('user_version = 14');
  console.log('✓ Migration v14 complete');
}

if (version < 15) {
  console.log('Running migration v15: user approval...');
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('is_approved')) {
    db.exec('ALTER TABLE users ADD COLUMN is_approved INTEGER NOT NULL DEFAULT 0');
  }
  // Auto-approve all existing users
  db.exec('UPDATE users SET is_approved = 1');
  db.pragma('user_version = 15');
  console.log('✓ Migration v15 complete');
}

if (version < 16) {
  console.log('Running migration v16: reorganize tags (gesund/entzündungshemmend → ernährung, drop kalorienarm)...');
  const meals = db.prepare('SELECT id, tags FROM meals WHERE tags IS NOT NULL').all();
  const update = db.prepare('UPDATE meals SET tags = ? WHERE id = ?');
  const RENAME = {
    'eigenschaft:gesund': 'ernährung:gesund',
    'eigenschaft:entzündungshemmend': 'ernährung:entzündungshemmend',
    'eigenschaft:entzündungshemmend+': 'ernährung:entzündungshemmend+',
  };
  const DROP = new Set(['eigenschaft:kalorienarm']);
  let touched = 0;
  for (const m of meals) {
    let arr;
    try { arr = JSON.parse(m.tags); } catch { continue; }
    if (!Array.isArray(arr)) continue;
    const next = [];
    for (const t of arr) {
      if (DROP.has(t)) continue;
      next.push(RENAME[t] || t);
    }
    const deduped = [...new Set(next)];
    const before = JSON.stringify(arr);
    const after = JSON.stringify(deduped);
    if (before !== after) {
      update.run(after, m.id);
      touched++;
    }
  }
  db.pragma('user_version = 16');
  console.log(`✓ Migration v16 complete (${touched} meals updated)`);
}

if (version < 17) {
  console.log('Running migration v17: plan slot notes...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS plan_slot_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      meal_type TEXT NOT NULL,
      note TEXT NOT NULL,
      UNIQUE(plan_id, date, meal_type)
    );
    CREATE INDEX IF NOT EXISTS idx_slot_notes_plan ON plan_slot_notes(plan_id);
  `);
  db.pragma('user_version = 17');
  console.log('✓ Migration v17 complete');
}

if (version < 18) {
  console.log('Running migration v18: pantry + fresh ingredients...');
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('pantry_staples')) {
    db.exec('ALTER TABLE users ADD COLUMN pantry_staples TEXT');
  }
  if (!userCols.includes('fresh_ingredients')) {
    db.exec('ALTER TABLE users ADD COLUMN fresh_ingredients TEXT');
  }
  db.pragma('user_version = 18');
  console.log('✓ Migration v18 complete');
}

if (version < 19) {
  console.log('Running migration v19: nutrition log toggle + nutrition_logs table...');
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('nutrition_log_enabled')) {
    db.exec('ALTER TABLE users ADD COLUMN nutrition_log_enabled INTEGER NOT NULL DEFAULT 0');
  }
  // Immutable snapshot log: only user_id cascades. meal_id/entry_id/plan_id are plain
  // columns (no FK), and meal_name + nutrition_per_serving are denormalized copies, so a
  // log row survives deletion of the plan, entry, or recipe it came from.
  db.exec(`
    CREATE TABLE IF NOT EXISTS nutrition_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id INTEGER NOT NULL,
      entry_id INTEGER NOT NULL,
      meal_id TEXT,
      meal_name TEXT,
      date TEXT NOT NULL,
      meal_type TEXT,
      servings INTEGER NOT NULL,
      persons INTEGER NOT NULL,
      nutrition_per_serving TEXT,
      logged_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, entry_id)
    );
    CREATE INDEX IF NOT EXISTS idx_nutrition_logs_user_date ON nutrition_logs(user_id, date);
  `);
  db.pragma('user_version = 19');
  console.log('✓ Migration v19 complete');
}

if (version < 20) {
  console.log('Running migration v20: monthly report notification log...');
  // Idempotency for the monthly push. Push is a single broadcast (not per-user), so one row
  // per month. If per-user email is added later, switch to UNIQUE(month, user_id).
  db.exec(`
    CREATE TABLE IF NOT EXISTS report_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(month)
    );
  `);
  db.pragma('user_version = 20');
  console.log('✓ Migration v20 complete');
}

export default db;
