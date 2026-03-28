CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  default_servings INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ingredients TEXT NOT NULL DEFAULT '[]',
  default_servings INTEGER NOT NULL DEFAULT 2,
  starred INTEGER NOT NULL DEFAULT 0,
  rating INTEGER,
  category TEXT,
  tags TEXT,
  photo_url TEXT,
  recipe_url TEXT,
  comment TEXT,
  recipe_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_meals_user_id ON meals(user_id);

CREATE TABLE IF NOT EXISTS meal_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_id ON meal_plans(user_id);

CREATE TABLE IF NOT EXISTS meal_plan_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch', 'dinner')),
  meal_id TEXT REFERENCES meals(id) ON DELETE SET NULL,
  servings INTEGER NOT NULL DEFAULT 2,
  enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE(plan_id, date, meal_type)
);
CREATE INDEX IF NOT EXISTS idx_entries_plan_id ON meal_plan_entries(plan_id);
