# Optionen und Forecast

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
