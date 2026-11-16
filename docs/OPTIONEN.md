# Optionen und Forecast

Die Optionsansichten kennzeichnen den Anbieter ausdrücklich mit „Option kommt von“.
In den Details stehen Beschriftung und Wert auch auf schmalen Ansichten nebeneinander.
„Incoterms 2020“ wird in der kompakten Lieferbedingung ausgeblendet; die gespeicherte
Angabe und angebotene Alternativen bleiben erhalten. Die Blöcke „Verladung/Hinweise“
und „Prüf- und Importhinweise“ werden weder im Angebotskopf noch an den Positionen
angezeigt. Auch die Optionszeilen der VL zeigen keine Import- oder
Normalisierungshinweise. Die Originalbelege bleiben zugänglich; gespeicherte
Quelldaten und die Prüfungen im Bestellablauf bleiben erhalten.

Verpackungsbezeichnungen werden für die Anzeige aus der vorhandenen zweisprachigen
BMS-Liste `dbo.tblSprachenTexte` (Gruppe 1, Ort `BE, AB`) übersetzt. Beispielsweise
wird „BAGS“ zu „Sackware“ und „Bags and / or Bulk“ zu „Sackware und/oder Siloware“;
„Big Bags“ bleibt eine eigene Art. Gewichte, Zusätze, unbekannte Bezeichnungen und
angebotene Alternativen bleiben erhalten. Die Übersetzung wählt keine Verpackung
aus und verändert weder Originalangaben noch Berechnungen oder gespeicherte Daten.

„Mail anzeigen“ öffnet den gespeicherten Mailtext in einer isolierten Ansicht
ohne Skripte oder externe Ressourcen. Referenzierte Inline-Grafiken werden vom
OptionReader in `op_QuelleMailbilderJson` gesichert und als lokale Bilddaten angezeigt.
„PDF öffnen“ zeigt das unveränderte Original mit PDF.js innerhalb der App, einschließlich
XFA-Formularen. Nur wenn Abruf, Einlesen oder Darstellung des Originals scheitern,
wird die erzeugte lesbare Vorschau geladen und ausdrücklich als Ersatzansicht bezeichnet.
Bei fehlender Berechtigung wird keine Ersatzdatei angefordert.
Die API lädt Inhalte erst bei Bedarf über
`GET /options/:id/source/mail` bzw. `/source/file`; es gelten dieselben Pilot- und
Mandantenprüfungen sowie dieselbe gemeinsame Sichtbarkeit aktueller Optionen wie
für die Optionsdetails. Der gezielte Nachimport über OptionReader ist unten beschrieben.

## Positionsansicht und Quellen (16.11.2026)

Jede Position öffnet eine eigene Ansicht unter `/options/:id/positions/:positionId`.
Die Liste verwendet BMS-Kategorien, insbesondere PPCP als PP Copo, und ergänzt den
vorliegenden MFI einmal mit Leerzeichen im Titel. Ein einzelner widerspruchsfreier
Artikelkandidat erscheint klein darunter; bei null oder mehreren fehlt die Zeile.
Die Messmethode erscheint nur bei vorhandenem Quellenwert.

Löschen verlangt einen Bestätigungsdialog und `confirmed:true` beim positionsbezogenen
DELETE. `opp_GeloeschtAm` und `opp_GeloeschtVon` entfernen nur die betreffende Position
aus Anzeige, Bestellauswahl und Hintergrundabgleich. Originalbelege und Referenzen
bestehender Bestellungen bleiben gespeichert. Fokuswechsel am selben Geschäftstag
setzt die Ansicht oder einen geöffneten Bestelldialog nicht mehr zurück.

Schema: `apps/backend/sql/add_option_position_sources.sql`. Diese additive Migration
enthält die Bildablage und das logische Löschen einzelner Positionen. Die Pilot- und
Mandantenprüfungen gelten unverändert. Quellen werden weiterhin nur bei Bedarf geladen.

Für die PDF-Ansicht nach dem Pull `npm ci` und `npm run build` im Hauptverzeichnis
ausführen. Der Build kopiert die PDF.js-Schriften, Zeichentabellen und WASM-Dateien
in die statischen Assets. Die Ansicht benötigt keinen nativen PDF-Browser-Plugin.
Die unveränderten Original-PDFs bleiben für einen späteren Bearbeitungs- und
Bestellanhang-Ablauf erhalten. Dieser Schritt enthält ausschließlich die Anzeige;
Formulare werden nicht als bearbeitet oder an Bestellungen angehängt gespeichert.

Im OptionReader prüft `node --openssl-legacy-provider scripts/backfill-mail-images.js`
die Originalmails der aktuell gültigen Optionen im konfigurierten Mailarchiv.
`--apply` übernimmt die gefundenen referenzierten Grafiken nach Sicherung und
Quellvergleich. Es werden keine neuen Angebote angelegt, keine KI-Neuauswertung
ausgelöst und keine Mails verschoben oder versendet. Berichte und Sicherungen liegen
im ignorierten `outputs/mail-images-...`-Ordner des Readers.

Optionen sind eingehende Lieferantenangebote. Die App liest sie aus der zentralen
DB04-Datenbank `BMS`, Schema `BMSApp`. `tblOptionen` enthält den Angebotskopf,
`tblOptionenPositionen` die angebotenen Materialien oder Chargen. Eine Option
kann mehrere Positionen haben. Alle Spalten tragen `op_` beziehungsweise `opp_`.

## Gemeinsamer Lieferantenbestand (29.10.2026)

Optionen gelten mandantenübergreifend. `op_MandantID` dokumentiert weiterhin
die Importherkunft und den Kontext bestehender Artikelabgleiche; es begrenzt
die Sichtbarkeit von Optionen nicht. Optionsübersicht, Details und die
Optionszeilen der VL lesen den gemeinsamen Bestand. Lagerbestände behalten
ihre bisherigen Mandantengrenzen. Die bestehende Pilotfreigabe bleibt bestehen.

In der Lieferantenansicht steht ein zunächst geschlossenes Accordion „Optionen“
über „Bestellungen“. `/customers/:id/options` prüft die Sichtbarkeit des geöffneten
Firmenkontos und ermittelt dessen Lieferantenfamilie aus Namen bzw. Domain.
Bekannte Namensvarianten (etwa Total und Total Petrochemicals) erhalten dieselbe
Kennung. Hanwha TotalEnergies und Total-Chem bleiben getrennte Anbieter.
Für weitere Anbieter können vorhandene geprüfte Kontoverbindungen helfen.
Die Herkunftsmandanten der passenden Angebote spielen beim Abruf keine Rolle.

Die Liste lädt beim Aufklappen und zeigt gültige Materialpositionen mit Menge,
Preis und Ablaufdatum. Ein Klick öffnet die Option an der jeweiligen Position;
der Zurück-Pfeil stellt Accordion und Scrollposition wieder her und lädt neu.
Das Entfernen einer gemeinsamen Option wirkt für alle Mandanten. Artikelzuordnung,
Neuberechnung und Zugriff auf Einkaufsbelege bleiben an den jeweiligen
BMS-Datenbankkontext gebunden; fremde Optionsherkunft schaltet diese UI aus.

OptionReader verwendet denselben Lieferantenkennungsvertrag. Interne Weiterleiter
werden nicht als Ersatzlieferant gespeichert; ein unklarer Anbieter bleibt
„Unbekannter Lieferant“ mit Prüfhinweis. Widersprüche zwischen bekanntem Anbieter
und Antwortadresse gehen zur Prüfung. Dokumentempfänger und Postfach bestimmen
die Sichtbarkeit nicht. Inhaltsduplikate werden beim Speichern auch über
Herkunftsmandanten hinweg erkannt. Bereits importierte Datensätze werden durch
dieses Codeupdate nicht rückwirkend geändert oder erneut eingelesen.

## Datenvertrag für den späteren Mail-/PDF-Import

- `op_company_id` ist die technische Mandanten-ID. `op_source_key` muss je
  Mandant eindeutig und bei erneutem Import derselben Quelle identisch sein.
- Ein Import benötigt Lieferant, Eingangszeit, Beginn und Ende der Gültigkeit,
  Quellentyp, Quellschlüssel, Ersteller/Änderer und mindestens eine Position.
- Bei fehlendem Ablaufdatum soll der Import ein Ende setzen, beispielsweise
  28 Tage nach Eingang. Eine im Original genannte Frist bleibt in
  `op_source_valid_until` nachvollziehbar; bei echten Angeboten bestimmt die
  tatsächliche Lieferantenfrist `op_valid_until`.
- Neue KI-Einträge bleiben standardmäßig `op_review_status = 'pending'`.
  Die App zeigt nur `approved` und `op_business_status = 'open'` an.
- Mengen- und Preiseinheiten dürfen nicht aus Zahlen erraten werden. Die
  Originalangabe gehört in `opp_quantity_text`; ungeklärte Einheiten bleiben
  `NULL` und werden in der App als ungeklärt bezeichnet.
- Lieferantenartikel und interner Verkaufsartikel sind getrennte Felder.
  `opp_internal_article_name` bleibt leer, solange keine geprüfte Zuordnung
  vorliegt.

Die API filtert nach dem aktuellen Datum in der Zeitzone Europe/Berlin. Eine abweichende
`opp_valid_until` ersetzt die Kopf-Frist für diese Position. Beide Optionen-
Screens verwenden den gemeinsamen Bestand; die oben beschriebenen Aktionen
behalten ihren jeweiligen Kontext.

## Pilot und Beispiele

`apps/backend/src/pilot-features.js` gibt Bestellungen, Optionen und Forecast vorläufig nur
den drei geprüften FX-Identitäten AKI, MFR und NSC frei. Menü und direkte API-
Aufrufe verwenden dieselbe Regel. Die spätere allgemeine Freigabe kann diese
Funktion durch die normalen Nutzer-/Mandantenregeln ersetzen. Optionen sollen
dann für alle Berechtigten des Mandanten sichtbar sein, unabhängig vom
Lieferanten.

`apps/backend/sql/add_options.sql` legt die Tabellen wiederholbar an.
`apps/backend/sql/seed_options_examples.sql` fügt sieben Angebote mit neun
Positionen aus `C:\Projekte\Optionen` für Mandant 3 hinzu. Beim ersten Lauf
werden sie als heute eingegangen und 28 Tage gültig simuliert; die ursprünglichen
Total-Fristen bleiben getrennt erhalten. `op_is_demo = 1` kennzeichnet sie in
der App als Beispiele. Erneutes Ausführen fügt keine doppelten Angebote oder
Positionen ein. Bestehende Bestellungen werden nicht verändert.

Forecast ist derzeit ein geschützter Platzhalter ohne Datenschema. Die spätere
VL-Einbindung von Optionen ist ein eigener Schritt; die Materialkategorie und
der interne Artikelname sind dafür bereits vorgesehen.
