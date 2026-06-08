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

- [x] Es sollte die Möglichkeit zum Filtern nach 0 Sternen geben


- [x] AI-Kosten-Tracking in DB: Pro AI Endpoint und User werden die Kosten und Anzahl der Aufrufe getrackt -> Admin-Account hat Admin-Tab mit eigenem Sidebar-Menü. Unter API-Kosten kann er eine detaillierte Aufstellung einsehen.

- [x] Auf aktuelle Modelle umsteigen (GPT 5.2 und GPT 5 mini).

- [x] Im Meal Plan: Spalte hinzufügen, die Grün/Gelb/Rot-Bewertung für Nährstoffe für diesen Tag anzeigt. Beim Hovern wird eine detaillierte Aufschlüsselung der Nährstoffe angezeigt. Überlege dir, wie wir das gut in die Mobile-Version integrieren können. Vielleicht als klickbares Popup?

- [x] Bild ändern funktioniert derzeit nur mit Bild entfernen, speichern, neues Bild hochladen, speichern. Es sollte möglich sein, direkt ein neues Bild hochzuladen und damit das alte zu ersetzen.

- [x] Bei einigen Inputs wird automatisch 1 gesetzt, wenn man die Zahl löscht. Das verhindert jedoch die Neueingabe einer Zahl, da beim Löschen immer sofort 1 kommt.

- [x] Gesamtbewertung Nährwerrte Rezepte: Sollte auf Idealportion bezogen sein.

- [x] Beim Parsen, egal aus welcher Quelle, sollten Informationen wie "Make-ahead" oder "Storage" oder Alternativen erkannt und am Ende des Rezepttextes  mit jeweiliger Überschrift ausgegeben werden.

- [x] Überarbeite die KI Prompts. In der User-facing UZutatenliste sollten Zutaten wire Salz und Pfeffer nicht entfernt werden, nur in der Einkaufslistenseitigen Zutatenliste. Außerdem sollten alle volumetrischen Einheiten in Gewichtseinheiten umgerechnet werden. Überlege dir, ob zur Umrechnung der Einheiten ein eigener API Call sinnvoll ist, damit die Umrechnungen in einer Datenbank gespeichert werden können und nicht jedes Mal neu berechnet werden müssen. Ich bilde mir ein, es gibt für die Einkaufsliste schon eine änhliche Datenbank. Sieh dir das an.

- [x] Ich möchte ein optionales Log pro User (ein-/ausschaltbar in den Einstellungen). Es soll alle abgehakten Rezepte und Portionsgrößen, normalisiert auf die Anzahl der Personen im jeweiligen Plan, enthalten. So könnte man am Ende jedes Monats einen Bericht generieren, der die Nährstoffaufnahme des Monats zusammenfasst. Ich möchte die Nährstoffe der Rezepte um Vitamine und Spurenelemente erweitern. Diese sollen nicht in der UI aufscheinen, aber im Hintergrund mitgeloggt werden. Du solltest die Vitamin- und Spurenelementeroutine ausführlch testen, damit sie plausible Werte ausspuckt. Brainstorme zunächst mit mir, welche Vitamine und andere Nährstoffe noch fehlen, implementiere dann die Erweiterung der Nährstoffe und dann das Log. Um die Berichtslegung kümmern wir uns in einem nächsten Schritt.

- [x] Lass uns an einer Berichtsfunktion arbeiten, die auf dem Log basiert. Es soll einen Monatsbericht geben, der die Nährstoffaufnahme des Monats zusammenfasst und mögliche Mängel aufzeigt. Er soll also sowohl Makros als auch Mikros abdecken. Überlege dir, welche Informationen in so einem Bericht sinnvoll wären und wie wir sie am besten visualisieren können. Dafür sollte es einen eigenen Tab auf der Website geben, wo der User sich jederzeit über den laufenden Monat und vergangene informieren kann. Außerdem soll einmal monatlich eine Benachrichtigung mit einem Link zum aktuellen Monatsbericht verschickt werden. In /opt gibt es einen Nachrichtenservice, den du dafür nutzen kannst.

- [x] Ich möchte einige Funktionen zum Skalieren von Rezeptmengen direkt in der Rezeptansicht hinzufügen:
    - Die Anzahl der Personen, für die das Rezept gedacht ist, soll editierbar sein. Die Zutatenmengen passen sich dann automatisch an.
    - Jede Zutatenmenge soll per Klick editierbar sein. Die restlichen Zutatenmengen passen sich dann automatisch an (Use-case: Ich habe genau 500 g Zucchini, und möchte wissen, wie ich die anderen Zutaten anpassen muss, um die Zucchini komplett zu verbrauchen).
    - Ein Klick auf "Empfohlene Portionsgröße: X× (XXX kcal) — klicken zum Anwenden" unten in der Nährstoffansicht soll die empfohlene Portionsgröße, multipliziert mit der Anzahl Personen im aktuellen Meal Plan, auf die Zutatenmengen anwenden.
    - Beim Schließen des Rezeptes soll der User gefragt werden, ob er die geänderte Menge in den jeweiligen Meal Plan-Eintrag übernehmen oder verwerfen möchte.

- [x] Füge der Rezeptansicht eine ausklappbare Detailansicht zu den Nährwerten hinzu, die die Vitamine etc. enthält.

- [x] Wir haben ja bereits Nährwerte für die Rezepte hinterlegt. Überlege dir einen sinnvollen Nutritional Score von 0-100 für die Rezepte, der auf den Nährwerten basiert. Dann implementiere die Möglichkeit, die Rezepte danach zu sortieren.

- [x] Favoriten sollten in der Rezepte Sidebar nicht automatisch immer ganz oben angezeigt werden. Sortiere standardmäßig nach Nutritional Score

- [ ] Meal Plan Auto-Optimizer
  Ein Button im Meal Plan, der für alle Einträge eines Tages die Portionsgrößen
  gleichzeitig optimiert — nicht einzeln pro Rezept, sondern so dass die
  Tagessumme die Ziele trifft. Rezept A bekommt 0.7×, Rezept B bekommt 1.2×,
  insgesamt passt der Tag.


- [ ] Wochenplan-Scoring als Info-Button mit Popup
  Gesamtbewertung für die Woche: "Dein Wochenplan deckt 94% deiner Ziele — mit
  optimierten Portionen wären es 98%". Ein-Klick-Optimierung für den ganzen Plan.