import toml from '@iarna/toml';
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import SqliteStore from 'better-sqlite3-session-store';

import crypto from 'crypto';
import { readFileSync } from 'fs';
import OpenAI from 'openai';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import db from './db.js';
import authRoutes from './routes/auth.js';
import mealsRoutes from './routes/meals.js';
import plansRoutes from './routes/plans.js';
import settingsRoutes from './routes/settings.js';
import { requireAuth } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Trust proxy (for Nginx)
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: CLIENT_URL,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
const BetterSqlite3Store = SqliteStore(session);
app.use(session({
  store: new BetterSqlite3Store({
    client: db,
    expired: { clear: true, intervalMs: 900000 } // clean expired sessions every 15 min
  }),
  secret: process.env.SESSION_SECRET || 'essensplaner-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

// Serve static files from dist directory in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '..', 'dist')));
}

// Serve uploaded photos
app.use('/api/photos', express.static(join(__dirname, 'data', 'photos')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/meals', mealsRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/settings', settingsRoutes);

// Read OpenAI API key from TOML
let openaiClient;
try {
  const configPath = join(__dirname, '..', 'openai_credentials.toml');
  const configContent = readFileSync(configPath, 'utf-8');
  const config = toml.parse(configContent);

  if (!config.key) {
    throw new Error('OpenAI API key not found in config');
  }

  openaiClient = new OpenAI({
    apiKey: config.key,
  });

  console.log('✓ OpenAI client initialized');
} catch (error) {
  console.error('Failed to initialize OpenAI:', error.message);
  process.exit(1);
}

// Parse recipe from URL endpoint
app.post('/api/parse-recipe-url', requireAuth, async (req, res) => {
  try {
    const { url, existingTags } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Collect existing tags for AI context
    const existingTagsList = Array.isArray(existingTags) ? [...new Set(existingTags)].sort() : [];

    console.log('Fetching recipe from URL:', url);

    // Fetch the webpage
    const webResponse = await fetch(url);
    if (!webResponse.ok) {
      return res.status(400).json({ error: 'Failed to fetch URL' });
    }

    const htmlContent = await webResponse.text();

    console.log('Parsing recipe with OpenAI...');

    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'system',
          content: `Du bist ein Assistent, der Rezepte aus HTML-Seiten extrahiert.

Gib das Ergebnis als JSON-Objekt zurück:
{ "name": string, "ingredientText": string, "recipeText": string, "servings": number, "photoUrl": string | null, "category": string | null, "tags": string[], "prepTime": number | null, "totalTime": number | null }

Regeln:
- "name" ist der Name des Rezepts
- "ingredientText" ist die KOMPLETTE Zutatenliste als Text, GENAU wie sie auf der Seite steht
  - Kopiere die Zutaten 1:1 ohne Umrechnungen
  - Jede Zutat in einer neuen Zeile (mit \\n getrennt)
  - Behalte die originalen Mengenangaben bei (z.B. "2 EL", "500g", "1 TL", "2 Zwiebeln")
- "recipeText" ist die komplette Zubereitungsanleitung als Text
  - Kopiere die Schritte GENAU wie sie auf der Seite stehen
  - Falls es nummerierte Schritte gibt, behalte die Nummerierung bei
  - Trenne Schritte mit \\n\\n (zwei Zeilenumbrüche)
- "servings" ist die Anzahl der Portionen (z.B. "für 4 Personen" → 4)
  - Falls keine Portionsangabe gefunden wird, verwende 2 als Standard
- "photoUrl" ist die URL des Hauptfotos des Rezepts
  - Suche nach og:image Meta-Tag, schema.org image Property, oder das größte/prominenteste Bild im Hauptinhalt
  - Gib die vollständige absolute URL zurück (nicht relative Pfade)
  - Falls kein passendes Foto gefunden wird, verwende null
- "category" ist die Kategorie, einer von: hauptgericht, beilage, vorspeise, suppe, salat, dessert, snack, fruehstueck, getraenk, brot_gebaeck, sauce_dip, sonstiges. Falls unklar, verwende null
- "tags" ist ein Array von strukturierten Tags im Format "schlüssel:wert". Verwende bevorzugt bereits existierende Tags des Benutzers (siehe unten). Erstelle nur neue Tags wenn keiner der existierenden passt.
  Erlaubte Schlüssel und Beispielwerte:
  - küche: italienisch, französisch, asiatisch, mexikanisch, indisch, griechisch, türkisch, deutsch, österreichisch, ungarisch, russisch, japanisch, thailändisch, orientalisch, mediterran, amerikanisch
  - schwierigkeit: leicht, mittel, anspruchsvoll
  - ernährung: vegetarisch, vegan, glutenfrei, laktosefrei, low-carb, high-protein (nur wenn zutreffend)
  - eigenschaft: schnell, günstig, kinderfreundlich, meal-prep, einfrierbar, one-pot, kalorienarm, gesund, haute-cuisine (nur wenn zutreffend)
  - Verwende nur Tags die eindeutig auf das Rezept zutreffen
- "prepTime" ist die aktive Zeit in Minuten (Hands-on-Zeit, aktives Arbeiten), null falls nicht angegeben
- "totalTime" ist die Gesamtzeit in Minuten (inkl. Kochen/Backen), null falls nicht angegeben
- Ignoriere Werbung, Navigation und Kommentare
- Antworte NUR mit dem JSON-Objekt, ohne zusätzlichen Text${existingTagsList.length > 0 ? `

Bereits existierende Tags des Benutzers (bevorzugt diese verwenden):
${existingTagsList.join(', ')}` : ''}`
        },
        {
          role: 'user',
          content: `Hier ist der HTML-Inhalt der Rezeptseite:\n\n${htmlContent.substring(0, 50000)}`
        }
      ],
      temperature: 0,
    });

    const responseText = completion.choices[0]?.message?.content || '{"name":"","ingredientText":"","recipeText":"","servings":2}';

    // Try to parse the JSON response
    let parsed;
    try {
      const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', responseText);
      return res.status(500).json({ error: 'Fehler beim Parsen der KI-Antwort' });
    }

    // Validate the structure — if no ingredients found, return a helpful error
    if (!parsed.ingredientText || typeof parsed.ingredientText !== 'string') {
      console.error('No ingredients in AI response. Parsed keys:', Object.keys(parsed), 'Name:', parsed.name || '(none)');
      return res.status(400).json({ error: parsed.name
        ? `Keine Zutaten auf der Seite gefunden. Möglicherweise wird die Seite dynamisch geladen und kann nicht geparst werden.`
        : `Die Seite konnte nicht geparst werden. Möglicherweise ist sie hinter einem Login oder wird dynamisch geladen.`
      });
    }

    const name = String(parsed.name || '');
    const ingredientText = String(parsed.ingredientText || '');
    const recipeText = String(parsed.recipeText || '');
    const servings = parsed.servings ? Number(parsed.servings) : 2;
    const photoUrl = parsed.photoUrl || null;
    const category = parsed.category || null;
    const tags = Array.isArray(parsed.tags) ? parsed.tags : [];
    const prepTime = parsed.prepTime ? Number(parsed.prepTime) : null;
    const totalTime = parsed.totalTime ? Number(parsed.totalTime) : null;

    console.log(`✓ Parsed recipe: ${name} for ${servings} servings${photoUrl ? ' (with photo)' : ''} [${tags.length} tags]`);

    res.json({ name, ingredientText, recipeText, servings, photoUrl, category, tags, prepTime, totalTime });

  } catch (error) {
    console.error('Error parsing recipe from URL:', error);
    res.status(500).json({
      error: 'Fehler beim Parsen des Rezepts',
      details: error.message
    });
  }
});

// Parse ingredients endpoint
app.post('/api/parse-ingredients', requireAuth, async (req, res) => {
  try {
    const { ingredientText } = req.body;

    if (!ingredientText || typeof ingredientText !== 'string') {
      return res.status(400).json({ error: 'ingredientText is required' });
    }

    console.log('Parsing ingredients...');

    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'system',
          content: `Du bist ein Assistent, der Zutatenlisten aus Rezepten parst.
Extrahiere die Zutaten und die Anzahl der Portionen.
Gib das Ergebnis als JSON-Objekt zurück: { "ingredients": [...], "servings": number }

ingredients-Array: Jedes Element hat die Struktur { "name": string, "amount": number, "unit": string }

WICHTIG: Bewahre die EXAKTEN Mengenangaben aus dem Text! Ändere KEINE Zahlen!
WICHTIG: Übersetze alle Zutatennamen ins Deutsche!

Regeln:
- "name" ist der Name der Zutat auf Deutsch (z.B. "Zwiebeln", "Mehl", "Salz")
  - Wenn die Zutat in einer anderen Sprache angegeben ist, übersetze sie ins Deutsche
  - Beispiele: "onions" → "Zwiebeln", "flour" → "Mehl", "salt" → "Salz"
  - Immer im Plural, z.B. "2 Zwiebeln" → "Zwiebeln", "1 Zitrone" → "Zitronen"
  - Bevorzuge z.B. "Petersilie frisch" statt "Frische Petersilie"
- "amount" ist die EXAKTE Menge als Zahl aus dem Text (z.B. wenn "30 g" im Text steht → amount: 30, NICHT 20!)
- "unit" ist die Einheit - Erlaubte Einheiten: "g", "ml", "Stück"
  - Feste/pulvrige Zutaten → "g" (z.B. 1kg → 1000g, 2 EL Mehl → 30g)
  - Flüssige Zutaten → "ml" (z.B. 1L → 1000ml, 2 EL Öl → 30ml)
  - Stückzahlen → "Stück" (z.B. "2 Zwiebeln" → 2 Stück, "1 Zitrone" → 1 Stück)
  - 1 TL ≈ 5g/5ml, 1 EL ≈ 15g/15ml
  - Wenn bereits "g" oder "ml" im Text steht, übernimm die EXAKTE Zahl!
- Für Knoblauch: 1 Zehe entspricht 0.1 Stück!
- Bei ungenauen Mengen wie "etwas", "nach Geschmack" oder "nach Belieben" verwende amount: 1 und unit: "Nach Belieben"
- "servings" ist die Anzahl der Portionen (z.B. "für 4 Personen" → 4, "2 Portionen" → 2)
- Falls keine Portionsangabe gefunden wird, verwende null
- Ignoriere Zubereitungshinweise, nur Zutaten extrahieren
- Antworte NUR mit dem JSON-Objekt, ohne zusätzlichen Text`
        },
        {
          role: 'user',
          content: ingredientText
        }
      ],
      temperature: 0,
    });

    const responseText = completion.choices[0]?.message?.content || '{"ingredients":[],"servings":null}';

    // Try to parse the JSON response
    let parsed;
    try {
      // Remove markdown code blocks if present
      const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', responseText);
      return res.status(500).json({ error: 'Fehler beim Parsen der KI-Antwort' });
    }

    // Validate the structure
    if (!parsed.ingredients || !Array.isArray(parsed.ingredients)) {
      return res.status(500).json({ error: 'Ungültiges Format der KI-Antwort' });
    }

    // Ensure all ingredients have the required fields
    const validatedIngredients = parsed.ingredients
      .map(ing => ({
        name: String(ing.name || ''),
        amount: Number(ing.amount) || 0,
        unit: String(ing.unit || ''),
      }))
      // Filter out Salz and Pfeffer
      .filter(ing => {
        const nameLower = ing.name.toLowerCase().trim();
        return nameLower !== 'salz' && nameLower !== 'pfeffer';
      });

    const servings = parsed.servings ? Number(parsed.servings) : null;

    console.log(`✓ Parsed ${validatedIngredients.length} ingredients${servings ? ` for ${servings} servings` : ''}`);

    res.json({ ingredients: validatedIngredients, servings });

  } catch (error) {
    console.error('Error parsing ingredients:', error);
    res.status(500).json({
      error: 'Fehler beim Parsen der Zutaten',
      details: error.message
    });
  }
});

// Bring! export - in-memory store for exported shopping lists
const bringExports = new Map();

function buildBringHtml(shoppingList) {
  const recipeIngredients = shoppingList.map(item => {
    const amountsStr = item.amounts.map(a => {
      if (a.unit === 'Stück') {
        return `${a.amount}`;
      }
      return `${a.amount} ${a.unit}`;
    }).join(' + ');
    return `${amountsStr} ${item.name}`;
  });

  const ingredientsListHtml = recipeIngredients
    .map(text => `    <li>${text}</li>`)
    .join('\n');

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "Einkaufsliste",
    "recipeIngredient": recipeIngredients
  };

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Einkaufsliste - Bring!</title>
  <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
  </script>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 20px;
      max-width: 600px;
      margin: 0 auto;
    }
    h1 { color: #333; }
    ul {
      list-style-type: none;
      padding: 0;
    }
    li {
      margin: 8px 0;
      padding: 8px;
      border-bottom: 1px solid #eee;
    }
  </style>
</head>
<body>

  <h1>Einkaufsliste</h1>
  <ul>
${ingredientsListHtml}
  </ul>

  <script async src="https://platform.getbring.com/widgets/import.js"></script>
  <div data-bring-import data-bring-language="de" data-bring-theme="dark" style="display:none">
    <a href="https://www.getbring.com">Bring!</a>
  </div>

</body>
</html>`;
}

// POST: store shopping list and redirect to a GET-able URL
app.post('/api/bring-export', (req, res) => {
  try {
    let shoppingList;
    if (typeof req.body.shoppingList === 'string') {
      shoppingList = JSON.parse(req.body.shoppingList);
    } else {
      shoppingList = req.body.shoppingList;
    }

    if (!shoppingList || !Array.isArray(shoppingList)) {
      return res.status(400).json({ error: 'shoppingList array is required' });
    }

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    bringExports.set(id, { shoppingList, createdAt: Date.now() });

    // Clean up exports older than 1 hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [key, value] of bringExports) {
      if (value.createdAt < oneHourAgo) bringExports.delete(key);
    }

    res.redirect(303, `/api/bring-export/${id}`);
  } catch (error) {
    console.error('Error generating Bring! export:', error);
    res.status(500).json({ error: 'Fehler beim Erstellen der Bring!-Export-Seite' });
  }
});

// GET: serve the stored shopping list as HTML (Bring's parser fetches this)
app.get('/api/bring-export/:id', (req, res) => {
  const entry = bringExports.get(req.params.id);
  if (!entry) {
    return res.status(404).send('Export not found or expired.');
  }

  const html = buildBringHtml(entry.shoppingList);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// --- Share link routes ---

// GET /share/:token — server-side join flow
app.get('/share/:token', (req, res) => {
  const share = db.prepare('SELECT * FROM plan_shares WHERE token = ?').get(req.params.token);

  if (!share) {
    if (process.env.NODE_ENV === 'production') {
      return res.redirect('/?shareError=notfound');
    }
    return res.status(404).json({ error: 'Link ungültig oder abgelaufen' });
  }

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    if (process.env.NODE_ENV === 'production') {
      return res.redirect('/?shareError=expired');
    }
    return res.status(410).json({ error: 'Link abgelaufen' });
  }

  // Not logged in → redirect to frontend with share param
  if (!req.session || !req.session.userId) {
    return res.redirect(`/?share=${req.params.token}`);
  }

  // Already logged in → add as collaborator and redirect
  const userId = req.session.userId;
  const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(share.plan_id);

  if (!plan) {
    return res.redirect('/?shareError=notfound');
  }

  // Don't add owner as collaborator
  if (plan.user_id !== userId) {
    db.prepare(
      'INSERT OR IGNORE INTO plan_collaborators (plan_id, user_id) VALUES (?, ?)'
    ).run(plan.id, userId);
  }

  res.redirect(`/?joined=${plan.id}`);
});

// POST /api/share/:token/join — API-based join (for frontend after login)
app.post('/api/share/:token/join', requireAuth, (req, res) => {
  try {
    const share = db.prepare('SELECT * FROM plan_shares WHERE token = ?').get(req.params.token);

    if (!share) {
      return res.status(404).json({ error: 'Link ungültig oder abgelaufen' });
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Link abgelaufen' });
    }

    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(share.plan_id);
    if (!plan) {
      return res.status(404).json({ error: 'Plan nicht gefunden' });
    }

    // Don't add owner as collaborator
    if (plan.user_id !== req.userId) {
      db.prepare(
        'INSERT OR IGNORE INTO plan_collaborators (plan_id, user_id) VALUES (?, ?)'
      ).run(plan.id, req.userId);
    }

    res.json({ planId: plan.id, planName: plan.name });
  } catch (err) {
    console.error('Join error:', err);
    res.status(500).json({ error: 'Beitritt fehlgeschlagen' });
  }
});

// SPA catch-all (production only, must be after all API routes)
if (process.env.NODE_ENV === 'production') {
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Client URL: ${CLIENT_URL}`);
});
