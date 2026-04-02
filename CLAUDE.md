# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev (client + server):** `npm run dev`
- **Dev client only:** `npm run dev:client` (Vite on port 5173)
- **Dev server only:** `npm run dev:server` (Express on port 3001)
- **Build:** `npm run build` (runs `tsc -b && vite build`)
- **Lint:** `npm run lint`
- **Production start:** `npm start` (serves built client from `dist/`)
- **Restart production server:** `./restart.sh` (builds, kills old server, starts new one, verifies health)
- **Start dev server:** `./dev.sh` (kills old processes, runs `npm run dev`)

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
- `server/routes/meals.js` — CRUD + star toggle + rename-ingredient + photo upload/delete
- `server/routes/plans.js` — plan CRUD + bulk entry upsert + slot update + swap
- `server/routes/settings.js` — get/update defaultServings

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
