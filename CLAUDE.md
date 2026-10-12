# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev (client + server):** `npm run dev` — its server exits while production holds :3001 (only one server per port)
- **Dev client only:** `npm run dev:client` (Vite on port 5173)
- **Dev server only:** `npm run dev:server` (Express on port 3001)
- **Build:** `npm run build` (runs `tsc -b && vite build`)
- **Lint:** `npm run lint`
- **Production start:** `npm start` (serves built client from `dist/`)
- **Production server** runs as systemd unit `essensplaner.service` (loads `.env`; logs: `journalctl -u essensplaner`). Never start it with `nohup` — the server does not read `.env` itself.
- **Restart production server:** `./restart.sh` (builds, restarts the systemd unit, frees :3001 from strays, verifies health)
- **Start dev client:** `./dev.sh` (restarts Vite only; the dev client's API is production via `VITE_API_URL`, so backend changes need `./restart.sh`)

No test framework is configured.

## Architecture

German-language meal planning app ("Essensplaner"). React/TypeScript frontend + Express backend with SQLite database.

### Frontend (src/)

- **Auth:** `AuthContext` checks session on load via `GET /api/auth/me`. Shows `AuthForm` (login/register) when unauthenticated. Supports one-time localStorage migration on first login.
- **State management:** Two React contexts — `AuthContext` (auth state) and `MealPlanContext` (meals + plans). `MealPlanContext` fetches data from the API on mount and uses optimistic updates with server sync.
- **API client:** `src/api/client.ts` — thin fetch wrapper with `credentials: 'include'`, automatic 401 handling.
- **Multi-plan support:** Users can have multiple meal plans. `MealPlanState` has `plans[]` and `activePlanId`. Plans are created with a name, start/end date.
- **Drag-and-drop:** Uses `@dnd-kit` — meals are dragged from `MealHistory` onto slots in `MealPlanTable`. DnD wiring lives in `App.tsx`.
- **Types:** All domain types in `src/types/index.ts` — `Meal`, `Ingredient`, `MealPlanEntry`, `MealPlan`, `MealPlanState`, `MealType`, `User`.
- **Shopping list aggregation:** `src/utils/shoppingListAggregator.ts` — scales ingredient amounts by servings and aggregates across all enabled plan entries, grouping by normalized ingredient name and unit.

### Backend (server/)

Express server (no TypeScript) with SQLite database (via `better-sqlite3`).

**Database:** `server/data/essensplaner.db` (auto-created on first run). Schema in `server/schema.sql`. Tables: `users`, `meals`, `meal_plans`, `meal_plan_entries`. Sessions stored in same DB.

**Auth:** Session-based (express-session + better-sqlite3-session-store). Email/password with bcrypt. Rate-limited auth endpoints (5 req/min/IP).

**Route files:**
- `server/routes/auth.js` — register, login, logout, me, migrate
- `server/routes/meals.js` — CRUD + star toggle + rename-ingredient + photo upload/delete + QuickMeals (`POST/PUT /quick`, `GET /quick/usage`, `PATCH /:id/quick` = Rezept ⇄ QuickMeal)
- `server/routes/plans.js` — plan CRUD + bulk entry upsert + slot update + swap
- `server/routes/settings.js` — get/update defaultServings
- `server/routes/napo.js` / `server/routes/mensa.js` — personal canteen menus (only accounts in `NAPO_EMAILS`/`MENSA_EMAILS`, flags `user.napoMenu`/`user.mensaMenu`), parsed without AI and cached 1 h. NAPO = HTML of napopizza.at/campus; Mensa Inffeldgasse = GraphQL `backend.mensen.at/api` (`menuplanCurrentWeek/NextWeek` JSON, dishes + soups, desserts dropped). Estimates in index.js (`CANTEEN_ESTIMATORS`): `POST /api/{napo,mensa}-menu/estimate` (all dishes + sides of a day, ≤ 4 items per parallel AI call), `GET …/estimate?date=` = cached only; cached in `canteen_estimates` for 24 h and at least until the menu day is over. Client: `utils/canteens.ts` + `CanteenMenus` (both canteens side by side, swipeable pages on mobile).
- `server/routes/activity.js` — Apple Health active energy: `POST /ingest` (bearer token from `users.health_token_hash`, no session — called by an iOS Shortcut), `GET /`, token create/revoke. Mounted at `/api/activity` (`/api/health` is the health check).

**Middleware:** `server/middleware/auth.js` — `requireAuth` checks `req.session.userId`.

**AI endpoints (in index.js, require auth):**
- `POST /api/parse-recipe-url` — fetches a recipe webpage, sends HTML to OpenAI GPT-4.1 to extract name, ingredients, recipe text, and servings.
- `POST /api/parse-ingredients` — sends raw ingredient text to GPT-4.1 for structured parsing into `{name, amount, unit}` objects. Filters out salt/pepper. Units normalized to g/ml/Stück.

**Bring! export (in index.js, no auth):**
- `POST /api/bring-export` + `GET /api/bring-export/:id` — generates an HTML page with schema.org Recipe JSON-LD for import into the Bring! shopping list app.

**Photos:** Uploaded via multer to `server/data/photos/`, served at `/api/photos/:filename`.

OpenAI credentials are read from `openai_credentials.toml` at the project root.
Session secret read from `SESSION_SECRET` env var.

### Key design decisions

- All LLM prompts are in German and instruct the model to return German ingredient names.
- Ingredient units are restricted to three values: `"g"`, `"ml"`, `"Stück"` (plus `"NB"` for taste-based amounts).
- Meals have `defaultServings`; plan entries have their own `servings` count — the shopping list scales proportionally.
- Ingredients stored as JSON column on meals table (not normalized).
- Meals have optional fields: `rating` (1-5), `category`, `tags` (JSON array), `photoUrl`.
- Multiple meal plans per user, each with its own date range and entries.
- Flexible sport mode (`users.flexible_sport_enabled`, toggle in Ernährungsrechner → Training): trainings are logged per day in the plan (`training_logs`, `/api/trainings`, 🏃 chip `TrainingChip.tsx`) instead of the fixed `weekDayTypes` schedule. `src/utils/sportModel.ts`: kcal = (MET − 1) × kg × h. The context's `sport` model is passed like `activity` to `getDayEnergy`/`getDayTargets`/`resolveDayTargets`: base TDEE drops the weekly training average; a day = baseline + its trainings (source `'training'`). With Apple Health, measured days keep the measurement (training already in it); unmeasured days use baseline + trainings instead of the weekday average.
- ☕ Coffee (`server/coffee.js`, `src/components/CoffeeChip.tsx`): drinks are QuickMeals with `is_drink = 1` (hidden from the QuickMeal picker). Cups are **personal** plan entries — `meal_type = 'drinks'` on a real date, `personal_user_id` = the drinker, `servings` = cups — only returned to that user (`GET /api/plans/:id`) and counted fully for them (`sumDay` skips the persons divisor; nutrition log uses persons = 1). Set via `PUT /api/plans/:id/coffee`. The daily habit (`users.coffee_habit`) is pre-filled on plan load from the client's `?today=` on (`auto_habit` entries, `coffee_habit_fill` remembers how far); changing the habit replaces only untouched future days.
- Apple Health mode (`users.health_enabled`): `src/utils/activityModel.ts` builds a 6-week per-weekday average of `activity_days`; `getDayEnergy`/`getDayTargets` in `nutritionCalculator.ts` then use BMR × 1.1 + active kcal × `health_active_factor` instead of the activity-level/training heuristic (measured value for past days, weekday average from today on). Nutrition targets are always per day: use the context's `targetsForDate(date)` (or `todayTargets` where there is no date, e.g. recipe lists) — never the stored `nutritionTargets` directly, which only apply without a nutrition profile.

## Deploy Configuration (configured by /setup-deploy)
- Platform: custom (self-hosted VPS: this machine; systemd `essensplaner.service` on :3001 behind nginx + Let's Encrypt)
- Production URL: https://essensplaner.stefanjanisch.net
- Deploy workflow: none (no CI; deploy runs manually on this host from /opt/essensplaner)
- Deploy status command: `systemctl is-active essensplaner.service`
- Merge method: squash
- Project type: web app
- Post-deploy health check: https://essensplaner.stefanjanisch.net/api/health

### Custom deploy hooks
- Pre-merge: `npx tsc -b` (type check only; `npm run build` would overwrite the live `dist/` that prod serves)
- Deploy trigger: `./restart.sh` (deploys the working tree, not origin/main; after a GitHub merge, `git pull --ff-only` first)
- Deploy status: `systemctl is-active essensplaner.service`
- Health check: https://essensplaner.stefanjanisch.net/api/health
