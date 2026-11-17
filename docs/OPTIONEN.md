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

### Ansprechpartner

Der OptionReader lässt die KI den vollständigen Namen und vorhandene Kontaktdaten
aus der Anbieter-Signatur bzw. ursprünglichen Absenderzeile lesen. Wörtliche
Personen- und Lieferantenbelege werden gegen die Originalquelle geprüft und in
`op_AnbieterKontaktJson` gespeichert (gemeinsames Installationsschema). Interne
Weiterleiter und CC-Empfänger werden nicht übernommen. Automatische Postfächer
ersetzen keinen ausdrücklich genannten persönlichen Ansprechpartner.

Beim Bestellen wird im gewählten Lieferantenkonto nach der exakten Mailadresse
gesucht, anschließend nach dem eindeutigen vollständigen Namen. Bei abweichender
Mailadresse wird die Namensübereinstimmung ausdrücklich zur Prüfung angezeigt;
gespeicherte Kontaktdaten werden dadurch nicht verändert.
Mehrdeutige Treffer bleiben zur Auswahl offen; ein Standardkontakt nach Ranking
ersetzt keine fehlende Quellenzuordnung. Der Benutzer kann auswählen oder leeren.
Unbekannte Personen öffnen einen vorausgefüllten `ContactCreateDialog` ohne Scanner,
mit bestehender ERP-Vorprüfung, Dublettenprüfung und Idempotenz. Erst die bestätigte
Anlage speichert einen echten Kontakt. Nach Anlage/Übernahme wird er ausgewählt
und sein Name in den Bestellwarenkorb und den bestehenden Bestellablauf übernommen.
Die Kontakt-IDs werden serverseitig gegen das gewählte Lieferantenkonto geprüft.
Für reine Lieferantenkontakte gilt zusätzlich die Einkaufs-Pilotfreigabe.

### Materialregeln und Bestandsabgleich

`ex Sabic` ergibt aufgrund der ausdrücklich freigegebenen Geschäftsregel NT;
`ex Feluy` oder andere ex-Angaben tun dies nicht. Reader und App verwenden denselben
Materialprüfer. Der Reader dokumentiert diese Regel als `business-rule-ex-sabic`.
Der gesicherte rückwirkende Abgleich erfolgt über
`OptionReader/scripts/rebuild-material-facts.js`; vor Übernahme müssen Reader und
Matcher die aktuelle Version nachweisen. Manuelle Zuordnungen und Originaldaten
bleiben erhalten, technische Widersprüche werden gekennzeichnet.

### Darstellung

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

Das gemeinsame [Installationsschema](../apps/backend/sql/install_BMSApp.sql) enthält
Bildablage, Kontaktvorschläge und logisches Löschen einzelner Positionen. Die Pilot-
und Mandantenprüfungen gelten unverändert. Quellen werden nur bei Bedarf geladen.

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

## Datenvertrag des OptionReaders

- `op_MandantID` dokumentiert die technische Importherkunft; Optionen sind gemeinsam sichtbar.
- `op_QuelleSchluessel` und der Inhaltsfingerabdruck dienen der Wiederholungssicherung.
- Lieferant, Originaleingang und mindestens eine Position gehören zum Angebot.
- Eine ausdrücklich genannte Lieferantenfrist bleibt erhalten; sonst gelten drei
  Arbeitstage ab ursprünglichem Eingang nach den Reader-Regeln.
- Mengen-/Messwerte benötigen Quellenbelege. Fehlende Werte bleiben unbekannt.
  Die freigegebene Regel für EUR-Preise ab 100 ohne Preisbezug ist im Reader umgesetzt.
- Lieferantenbezeichnung und interne Artikelzuordnung bleiben getrennt.
- Rohdaten und Originalbelege bleiben nachvollziehbar erhalten.

## Pilot

`apps/backend/src/pilot-features.js` gibt Bestellungen, Optionen und Forecast vorläufig nur
den drei geprüften FX-Identitäten AKI, MFR und NSC frei. Menü und direkte API-
Aufrufe verwenden dieselbe Regel. Die spätere allgemeine Freigabe kann diese
Funktion durch die normalen Nutzer-/Mandantenregeln ersetzen. Optionen sollen
dann für alle Berechtigten des Mandanten sichtbar sein, unabhängig vom
Lieferanten.

Die [Schema-Installation](INSTALLATION.md) legt keine Demo-Angebote an und
übernimmt keine standortspezifischen Kontenzuordnungen. Historische Test-Seeds
sind in der Git-Historie verfügbar.

Forecast ist ein geschützter Platzhalter ohne eigenes Datenschema.
