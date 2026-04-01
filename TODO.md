- [x] Add server-side persistence of data via a database
- [x] Add user accounts and authentication to allow users to save meal plans and recipes and access them across devices
- [x] Implement sharing of meal plans between users
- [x] Add a comprehensive recipe management suite
    - [x] Add recipe management site to add/edit/delete recipes. Adding should use the same form as "Rezept hinzufügen" in the meal plan. Don't code it twice.
    - [x] Add recipe categories
    - [x] Add recipe tags
    - [x] Add recipe search and filter functionality
    - [x] Add recipe star ratings
    - [x] Add photos to meals and let LLM identify suitable photo when web parsing recipes
- [x] Add recipe sharing - this should copy the recipe to the other user's DB and not be collaborative.
- [x] Add preparation time and total cooking time to recipes
- [x] AI parsing should include setting a category and tags and cooking time. We should discuss a proper tagging system first. Ideas/examples:
    - küche:französisch
    - schwierigkeit:leicht
    - Do you have more ideas on helpful tags?

- [x] Everytime I refresh the page, it switches

- [x] Change shopping list behaviour. use ultrathink.
    - Momentanes Verhalten: Das Parsing der Zutaten nimmt eine Konvertierung vor, die dafür gedacht ist, das Zusammenstellen der Einkaufsliste zu erleichtern (z.B. 1 EL -> 15 g). Das führt zu ungenauen Einträgen in der Rezeptansicht.
    - Neues Verhalten: Das KI-Parsing erstellt zwei Zutatenlisten: Eine für die User-Ansicht und eine für die Einkaufsliste.
        - User-Ansicht: Übernimmt die Angaben aus dem Rezept wörtlich
        - Einkaufsliste: Konvertiert Angaben in g, ml und Stück. Zutaten, die so nicht gekauft werden können, wie "Eigelb", werden zu einkaufbaren Zutaten, wie "Eier" konvertiert. Dies sollte mit einem eigenen OpenAI API-Call passieren.
        - Beide Listen werden im Rezept-Editor nebeneinander angezeigt. So kann der User die Richtigkeit der Angaben überprüfen.
    - Momentanes Verhalten: Werden Zutaten mit verschiedenen Einheiten hinzugefügt, werden sie in der Einkaufsliste z.B. als "15 g, 230 ml Olivenöl" zusammengefasst. Das ist unübersichtlich und führt zu Problemen beim Bring-Export.
    - Neues Verhalten: Zutaten mit verschiedenen Einheiten werden in der Einkaufsliste vereinheitlicht.
        - Neue Datenbank für Zutatenkonversionen anlegen. Diese ist zu Beginn leer, und wird sukzessive durch KI mit Einträgen gefüllt:
            - Pro Zutat Einträge: Bevorzugte Einheit und danach andere vorkommende Einheiten mit Konversionsfaktor. Das sollte so angelegt sein, dass neue Einheiten bei Bedarf ergänzt werden können.
            - Wenn eine Zutat mit verschiedenen Einheiten in der Einkaufsliste auftaucht -> Datenbankabfrage, ob die benötigte Konversion für Zutat und Einheit existiert. 
                - Wenn ja -> Konversionsfaktor aus DB verwenden. 
                - Wenn nein -> OpenAI-API Call, um die Konversion zu ermitteln. Das Ergebnis wird in der DB gespeichert, damit es beim nächsten Mal direkt verfügbar ist.
        - Das passiert zur Laufzeit, wenn der User die Einkaufsliste öffnet.
    - Beim Editieren von Zutatennamen in der Einkaufsliste soll ein Warnhinweis angezeigt werden, dass das den entsprechenden Eintrag im Rezept ändert.
    - Zusätzlicher Button bei Zutaten in Einkaufsliste: Öffnet ein Infofenster mit allen Rezepten, die die Zutat enthalten, und den jeweiligen Mengen.

- [x] Fix problem with parsing: "2 Zehen Knoblauch" gets parsed to "1 Stück Knoblauch", which will sum up to too much Knoblauch in the shopping list. Change the API call so it can return fractal numbers for quantities.
- [x] Some ingredients (like fresh herbs) can appear in units of "Bund". These need to be converted to grams.
- [x] In the meal plan view, make the date appear under the meal plan name instead of beside it.

- [x] Suche für meal plans

- [x] date picker beim erstellen: einer für start- und enddatum zusammen

- [x] Archivfunktion für alte meal plans

- [x] KI-gestütztes Beautifying und cleaning (zB alt texte von bildern/bilder) von eingefügten Rezepttexten

- [x] Funktion für Menüplanung mit user-defined anzahl der gänge plus getränkebegleitung (abgeleitet von meal plan, aber mit gängen statt tagen)

- [x] Zusätzliches Feld im mealPlan für Sonstiges (Snacks, Getränke, Kaffee etc.)


- [x] Check for prompt hacking
- [x] Check for SQL injection at the database interaction level. That way, all queries are caught.

- [x] Make mobile version

- [ ] Es sollte die Möglichkeit zum Filtern nach 0 Sternen geben


- [ ] AI-Kosten-Tracking in DB: Pro AI Endpoint und User werden die Kosten und Anzahl der Aufrufe getrackt -> Admin-Account hat Admin-Tab mit eigenem Sidebar-Menü. Unter API-Kosten kann er eine detaillierte Aufstellung einsehen.