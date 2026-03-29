import toml from '@iarna/toml';
import SqliteStore from 'better-sqlite3-session-store';
import cors from 'cors';
import express from 'express';
import session from 'express-session';

import { readFileSync } from 'fs';
import OpenAI from 'openai';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import db from './db.js';
import { requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import mealsRoutes from './routes/meals.js';
import plansRoutes from './routes/plans.js';
import settingsRoutes from './routes/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Trust proxy (for Nginx)
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: [CLIENT_URL, 'https://dev.essensplaner.stefanjanisch.net'],
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

// Parse ingredients endpoint — returns both display and shopping ingredient lists
app.post('/api/parse-ingredients', requireAuth, async (req, res) => {
  try {
    const { ingredientText } = req.body;

    if (!ingredientText || typeof ingredientText !== 'string') {
      return res.status(400).json({ error: 'ingredientText is required' });
    }

    console.log('Parsing ingredients (dual lists)...');

    // Run both AI calls in parallel
    const [displayCompletion, shoppingCompletion] = await Promise.all([
      // Call 1: Display ingredients — preserve original units
      openaiClient.chat.completions.create({
        model: 'gpt-4.1',
        messages: [
          {
            role: 'system',
            content: `Du bist ein Assistent, der Zutatenlisten aus Rezepten parst.
Extrahiere die Zutaten und die Anzahl der Portionen.
Gib das Ergebnis als JSON-Objekt zurück: { "ingredients": [...], "servings": number }

ingredients-Array: Jedes Element hat die Struktur { "name": string, "amount": number, "unit": string }

WICHTIG: Bewahre die EXAKTEN Mengenangaben und Einheiten aus dem Text! Ändere KEINE Zahlen und konvertiere KEINE Einheiten!
WICHTIG: Übersetze alle Zutatennamen ins Deutsche!

Regeln:
- "name" ist der Name der Zutat auf Deutsch (z.B. "Zwiebeln", "Mehl", "Salz")
  - Wenn die Zutat in einer anderen Sprache angegeben ist, übersetze sie ins Deutsche
  - Beispiele: "onions" → "Zwiebeln", "flour" → "Mehl", "salt" → "Salz"
  - Immer im Plural, z.B. "2 Zwiebeln" → "Zwiebeln", "1 Zitrone" → "Zitronen"
  - Bevorzuge z.B. "Petersilie frisch" statt "Frische Petersilie"
- "amount" ist die EXAKTE Menge als Zahl aus dem Text
- "unit" ist die ORIGINALE Einheit aus dem Text. Erlaubte Einheiten:
  - Gewicht: "g", "kg"
  - Volumen: "ml", "l", "EL", "TL"
  - Stückzahlen: "Stück", "Zehe", "Zehen", "Scheibe", "Scheiben"
  - Packungen: "Bund", "Dose", "Packung", "Becher", "Beutel", "Glas"
  - Sonstiges: "Prise", "Handvoll", "Würfel"
  - Falls keine Einheit angegeben (z.B. "2 Zwiebeln"), verwende "Stück"
  - Konvertiere NICHT zwischen Einheiten! Behalte "2 EL" als amount: 2, unit: "EL"
- Bei ungenauen Mengen wie "etwas", "nach Geschmack" oder "nach Belieben" verwende amount: 1 und unit: "NB"
- "servings" ist die Anzahl der Portionen (z.B. "für 4 Personen" → 4, "2 Portionen" → 2)
- Falls keine Portionsangabe gefunden wird, verwende null
- Ignoriere Zubereitungshinweise, nur Zutaten extrahieren
- Antworte NUR mit dem JSON-Objekt, ohne zusätzlichen Text`
          },
          { role: 'user', content: ingredientText }
        ],
        temperature: 0,
      }),
      // Call 2: Shopping ingredients — normalize to g/ml/Stück with purchasable substitutions
      openaiClient.chat.completions.create({
        model: 'gpt-4.1',
        messages: [
          {
            role: 'system',
            content: `Du bist ein Assistent, der Zutatenlisten für eine Einkaufsliste optimiert.
Dein Ziel: Konvertiere Rezept-Zutaten in das, was man tatsächlich im Supermarkt kaufen muss.
Gib das Ergebnis als JSON-Objekt zurück: { "ingredients": [...], "servings": number }

ingredients-Array: Jedes Element hat die Struktur { "name": string, "amount": number, "unit": string }

WICHTIG: Übersetze alle Zutatennamen ins Deutsche!

## Schritt 1: Konvertiere zu einkaufbaren Zutaten
Manche Rezept-Zutaten kann man nicht direkt kaufen. Konvertiere sie zur einkaufbaren Form:
- "Eigelb" → "Eier" (1 Eigelb = 1 Stück Eier)
- "Eiweiß" → "Eier" (1 Eiweiß = 1 Stück Eier)
- "Zitronensaft" → "Zitronen" (1 Zitrone liefert ca. 40-50ml Saft, also 2 EL ≈ 30ml ≈ 1 Stück)
- "Zitronenschale" / "Zitronenabrieb" → "Zitronen" (1 Zitrone = 1 Stück)
- "Limettensaft" → "Limetten" (1 Limette ≈ 30ml Saft)
- "Orangensaft frisch" → "Orangen" (1 Orange ≈ 80-100ml Saft)
- "Knoblauchzehe" / "Zehe Knoblauch" → "Knoblauch" (1 Knolle hat ca. 10 Zehen, also 3 Zehen ≈ 0.3 Stück)
- Wenn die gleiche Zutat aus verschiedenen Teilen stammt (z.B. Saft UND Schale einer Zitrone), zusammenfassen!
- Zutaten die man direkt kaufen kann (Mehl, Öl, Butter etc.) bleiben unverändert im Namen.

## Schritt 2: Konvertiere Einheiten
NUR erlaubte Einheiten: "g", "ml", "Stück"
- Feste/pulvrige Zutaten → "g" (1kg = 1000g, 1 EL Mehl ≈ 10g, 1 EL Zucker ≈ 13g, 1 EL Butter ≈ 15g)
- Flüssige Zutaten IMMER → "ml" (1L = 1000ml, 1 EL = 15ml, 1 TL = 5ml)
- Zählbare Einzelstücke → "Stück" (Zwiebeln, Eier, Dosen, Packungen)
- "Bund" ist KEINE Stückzahl! Konvertiere zu "g": 1 Bund Petersilie ≈ 30g, 1 Bund Schnittlauch ≈ 25g, 1 Bund Dill ≈ 25g, 1 Bund Basilikum ≈ 30g, 1 Bund Koriander ≈ 30g, 1 Bund Minze ≈ 25g, 1 Bund Suppengrün ≈ 400g, 1 Bund Radieschen ≈ 200g, 1 Bund Frühlingszwiebeln ≈ 150g
- WICHTIG: 1 TL ≈ 5g/5ml, 1 EL ≈ 15ml (aber Gewicht variiert je nach Zutat!)
- Für Knoblauch in Knollen: Zehen ÷ 10 = Stück (NICHT aufrunden! 2 Zehen = 0.2 Stück, 3 Zehen = 0.3 Stück)
- WICHTIG: "amount" darf Dezimalzahlen sein! NICHT aufrunden! Beispiele: 0.2, 0.5, 1.5 sind alle gültig.
  Die Einkaufsliste summiert die Mengen mehrerer Rezepte — Genauigkeit ist wichtiger als runde Zahlen.

## Schritt 3: Name
- Immer im Plural: "Zwiebeln", "Zitronen", "Eier"
- Auf Deutsch
- Bevorzuge "Petersilie frisch" statt "Frische Petersilie"

## Sonstiges
- "Prise" ist KEINE ungenaue Menge! Konvertiere zu g.
- Bei ungenauen Mengen ("etwas", "nach Geschmack", "nach Belieben"): amount: 1, unit: "NB"
- "servings": Portionsanzahl aus dem Text, oder null
- Ignoriere Zubereitungshinweise
- Antworte NUR mit dem JSON-Objekt, ohne zusätzlichen Text`
          },
          { role: 'user', content: ingredientText }
        ],
        temperature: 0,
      }),
    ]);

    function parseAIResponse(completion) {
      const responseText = completion.choices[0]?.message?.content || '{"ingredients":[],"servings":null}';
      const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanedText);

      if (!parsed.ingredients || !Array.isArray(parsed.ingredients)) {
        throw new Error('Ungültiges Format der KI-Antwort');
      }

      const validatedIngredients = parsed.ingredients
        .map(ing => ({
          name: String(ing.name || ''),
          amount: Number(ing.amount) || 0,
          unit: String(ing.unit || ''),
        }))
        .filter(ing => {
          const nameLower = ing.name.toLowerCase().trim();
          return nameLower !== 'salz' && nameLower !== 'pfeffer';
        });

      return { ingredients: validatedIngredients, servings: parsed.servings ? Number(parsed.servings) : null };
    }

    let displayResult, shoppingResult;
    try {
      displayResult = parseAIResponse(displayCompletion);
    } catch (e) {
      console.error('Failed to parse display ingredients:', e);
      return res.status(500).json({ error: 'Fehler beim Parsen der Rezept-Zutaten' });
    }
    try {
      shoppingResult = parseAIResponse(shoppingCompletion);
    } catch (e) {
      console.error('Failed to parse shopping ingredients:', e);
      return res.status(500).json({ error: 'Fehler beim Parsen der Einkaufslisten-Zutaten' });
    }

    const servings = displayResult.servings ?? shoppingResult.servings;

    console.log(`✓ Parsed ${displayResult.ingredients.length} display + ${shoppingResult.ingredients.length} shopping ingredients${servings ? ` for ${servings} servings` : ''}`);

    res.json({
      ingredients: displayResult.ingredients,
      shoppingIngredients: shoppingResult.ingredients,
      servings,
    });

  } catch (error) {
    console.error('Error parsing ingredients:', error);
    res.status(500).json({
      error: 'Fehler beim Parsen der Zutaten',
      details: error.message
    });
  }
});

// Clean up recipe text with AI
app.post('/api/clean-recipe-text', requireAuth, async (req, res) => {
  try {
    const { recipeText } = req.body;

    if (!recipeText || typeof recipeText !== 'string') {
      return res.status(400).json({ error: 'recipeText is required' });
    }

    console.log('Cleaning recipe text...');

    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'system',
          content: `Du bist ein Assistent, der Rezept-Zubereitungstexte aufräumt und in ein sauberes, einheitliches Nur-Text-Format bringt.

AUFGABE:
Bereinige den eingegebenen Rezepttext und bringe ihn in folgendes Format:

FORMAT:
- Nummerierte Schritte (1., 2., 3., ...), durchgehend nummeriert
- Ein Schritt = eine Aktion. Teile lange Schritte mit mehreren Aktionen auf.
- Optionale Abschnittsüberschriften (z.B. "Vorbereitung", "Kochen", "Anrichten") in eigener Zeile OHNE Nummerierung — nur verwenden wenn es sinnvoll ist und der Text lang genug ist
- Leerzeile zwischen Abschnitten
- Zeitangaben in Klammern wo relevant: (ca. 3 Min.)
- Temperaturangaben wo relevant: bei 180°C Ober-/Unterhitze

BEREINIGUNG:
- Entferne ALLES was kein Rezepttext ist: Bild-Alt-Texte, URLs, HTML-Tags, Werbung, Affiliate-Links, Cookie-Hinweise, Kommentare, Social-Media-Buttons etc.
- Entferne Einleitungstexte und persönliche Anekdoten die nichts mit der Zubereitung zu tun haben
- Behalte NUR die eigentlichen Zubereitungsschritte
- Übersetze ins Deutsche falls der Text in einer anderen Sprache ist
- Korrigiere offensichtliche Tipp-/OCR-Fehler
- Verwende klare, prägnante Sprache

WICHTIG:
- Antworte NUR mit dem bereinigten Rezepttext, ohne zusätzliche Erklärungen oder Kommentare
- Kein Markdown, kein HTML — nur reiner Text
- Wenn der Text bereits sauber ist, gib ihn trotzdem im einheitlichen Format zurück`
        },
        { role: 'user', content: recipeText }
      ],
      temperature: 0,
    });

    const cleanedText = completion.choices[0]?.message?.content?.trim() || '';

    if (!cleanedText) {
      return res.status(500).json({ error: 'Leere Antwort von der KI' });
    }

    console.log('✓ Recipe text cleaned');
    res.json({ cleanedText });

  } catch (error) {
    console.error('Error cleaning recipe text:', error);
    res.status(500).json({
      error: 'Fehler beim Bereinigen des Rezepttexts',
      details: error.message
    });
  }
});

// Convert units endpoint — batch conversion with DB caching
app.post('/api/convert-units', requireAuth, async (req, res) => {
  try {
    const { conversions } = req.body;
    if (!Array.isArray(conversions) || conversions.length === 0) {
      return res.status(400).json({ error: 'conversions Array ist erforderlich' });
    }

    const findStmt = db.prepare(
      'SELECT factor FROM ingredient_conversions WHERE ingredient_name = ? AND from_unit = ? AND to_unit = ?'
    );
    const insertStmt = db.prepare(
      'INSERT OR IGNORE INTO ingredient_conversions (ingredient_name, from_unit, to_unit, factor) VALUES (?, ?, ?, ?)'
    );

    const results = [];

    for (const { ingredient, fromUnit, toUnit } of conversions) {
      if (!ingredient || !fromUnit || !toUnit) continue;
      if (fromUnit === toUnit) {
        results.push({ ingredient, fromUnit, toUnit, factor: 1 });
        continue;
      }

      const normalizedName = ingredient.toLowerCase().trim();

      // Check cache
      const cached = findStmt.get(normalizedName, fromUnit, toUnit);
      if (cached) {
        results.push({ ingredient, fromUnit, toUnit, factor: cached.factor });
        continue;
      }

      // Call OpenAI for conversion
      try {
        const completion = await openaiClient.chat.completions.create({
          model: 'gpt-4.1-mini',
          messages: [
            {
              role: 'system',
              content: `Du bist ein Küchenrechner. Beantworte NUR mit einer Zahl (dem Umrechnungsfaktor).
Frage: Wie viel ${toUnit} entspricht 1 ${fromUnit} "${ingredient}"?
Antworte NUR mit der Zahl, ohne Einheit und ohne Text. Wenn die Umrechnung nicht möglich ist, antworte mit 0.`
            },
            {
              role: 'user',
              content: `1 ${fromUnit} ${ingredient} = ? ${toUnit}`
            }
          ],
          temperature: 0,
        });

        const factorText = completion.choices[0]?.message?.content?.trim() || '0';
        const factor = parseFloat(factorText) || 0;

        if (factor > 0) {
          insertStmt.run(normalizedName, fromUnit, toUnit, factor);
          // Also cache the reverse
          if (factor !== 0) {
            insertStmt.run(normalizedName, toUnit, fromUnit, 1 / factor);
          }
        }

        results.push({ ingredient, fromUnit, toUnit, factor });
      } catch (aiError) {
        console.error(`Conversion AI error for ${ingredient} ${fromUnit}->${toUnit}:`, aiError.message);
        results.push({ ingredient, fromUnit, toUnit, factor: 0 });
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('Convert units error:', error);
    res.status(500).json({ error: 'Fehler bei der Einheitenkonvertierung' });
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

  <script async src="https://platform.getbring.com/widgets/import.js"></script>
  <div data-bring-import data-bring-language="de" data-bring-theme="dark" style="display:none">
    <a href="https://www.getbring.com">Bring!</a>
  </div>

  <h1>Einkaufsliste</h1>
  <ul>
${ingredientsListHtml}
  </ul>

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
