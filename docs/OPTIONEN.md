# Optionen und Forecast

Die Optionsansichten kennzeichnen den Anbieter mit „Anbieter“.
In den Details stehen Beschriftung und Wert auch auf schmalen Ansichten nebeneinander.
Mail- und PDF-Symbole stehen klein direkt am Anbieternamen. Ein eindeutig belegter
Ansprechpartner steht darunter ohne eigene Beschriftung; eine vorhandene Telefon-
oder Mobilnummer ist über das Telefonsymbol per `tel:` erreichbar. Fehlt die
Nummer im Angebot, wird sie vom eindeutig zugeordneten BMS-Ansprechpartner im
aktiven Mandanten ergänzt (Telefon, ersatzweise Privattelefon oder Mobilnummer).
Die Zuordnung bleibt auf passende Lieferantenkonten beschränkt; mehrdeutige
Kontakte oder widersprüchliche Telefonnummern werden nicht automatisch verwendet.
Die ursprünglichen Angebotskontakte und BMS-Kontaktdaten bleiben unverändert. Ohne Person
entfällt die Kontaktzeile vollständig.
Nach der Gültigkeit folgen Produktname, kleiner Artikelname und Preis, darunter
Incoterm/Abholort, Verpackung, Menge, MFI und optionale Charge sowie weitere Angaben.
Die Prüfmethode steht ohne Präfix in Klammern hinter dem MFI. Der Trennstrich vor
dem Produkt entfällt. „Bestellen“ steht unten rechts neben dem hellen, zunächst
funktionslosen Button „Gegenangebot“. Ungeklärte Verpackung heißt „ungeklärt“.
Truck-Mengen erscheinen etwa als „1–2 LKW (24.750–49.500 kg)“; bei ungeklärter
Verpackung gilt zunächst Sackware mit 24.750 kg je LKW als Berechnungsstandard.
Steht nur „full truck loads“ ohne Anzahl und ohne belegte Gesamtmenge in der
Quelle, zeigt die App „Volle LKW · Gesamtmenge offen“. Daraus wird keine
Lieferanten-Gesamtmenge abgeleitet.
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

Das Mail-Symbol öffnet den gespeicherten Mailtext in einer isolierten Ansicht
ohne Skripte oder externe Ressourcen. Referenzierte Inline-Grafiken werden vom
OptionReader in `op_QuelleMailbilderJson` gesichert und als lokale Bilddaten angezeigt.
Das PDF-Symbol zeigt das unveränderte Original mit PDF.js innerhalb der App, einschließlich
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

`apps/backend/src/pilot-features.js` gibt Bestellungen, Optionen und Forecast
für die vier Geschäftsführer und die drei geprüften FX-Identitäten AKI, MFR
und NSC frei. Menü und direkte API-Aufrufe verwenden dieselbe Regel.
Für die Geschäftsführer schließt die gemeinsame Optionsansicht Daten mit
Herkunftsmandant `TES` aus.

Die [Schema-Installation](INSTALLATION.md) legt keine Demo-Angebote an und
übernimmt keine standortspezifischen Kontenzuordnungen. Historische Test-Seeds
sind in der Git-Historie verfügbar.

Forecast ist ein geschützter Platzhalter ohne eigenes Datenschema.
## Kundenangebote aus der VL

Die Käuferkarte verwendet den Artikelindex des Herkunftsmandanten. Fremde
VL-Positionen sind bei vorhandenen Kundenrechten lesbar. Nach der BMSApp-
Basisinstallation ergänzt `apps/backend/sql/upgrades/stock-offers.sql` die Spalte
`StockPositionKey` in der gemeinsamen Versandwarteschlange. `OfferJson`
enthält `stockOrderPosition` und `stockStorageId` für den externen
BMS-Ausgabeprozess. Nach dessen Prüfung und einem Testversand kann der
Artikelversand zusätzlich mit `BMS_STOCK_OFFER_MAIL_ENABLED=true` freigegeben werden.

## Kundenangebote aus einer Option

Die Kundenkarte nutzt Käufer aus der Verkaufshistorie des im aktiven Mandanten
zugeordneten Artikels. Normale Benutzer sehen ihre Kunden anhand
`kd_Aussendienst`. Explizite mandantenbezogene AD-Vollrechte oder die
bestehende App-Vollzugriffsregel schalten den Filter für weitere sichtbare AD
frei. Die Vorauswahl ist das Kürzel des angemeldeten Benutzers.
Diese Einschränkung gilt für die Käuferkarten in Optionsdetails und VL-Artikeldetails.

Im Angebotsdialog ist CFR anhand des Kürzels vorausgewählt. Der angezeigte
Text stammt aus den BMS-Lieferbedingungen. Bei FCA ist der benannte Abholort
Pflicht. Die Menge startet mit 24.750 kg und die bekannte Restmenge begrenzt
die Eingabe. Der Versand verwendet serverseitig geprüfte Daten.

### Produktiver Versand

Der produktive Versand wird mit `BMS_OPTION_OFFER_MAIL_ENABLED=true`
freigegeben, sobald der folgende BMS-Ausgabeweg und „Senden als“ für den
Außendienst mit dem MailService verifiziert sind. Ein Datensatz in
`BMSApp.OptionOfferMailOutbox` entspricht genau einem Kunden je Option und
Mandant. Die zugehörige Zeile in `BMSApp.OptionOfferDocument` enthält die
unveränderlichen Angebotsdaten in `OfferJson`. `nonBinding=true` beschreibt
das freibleibende Angebot. Die separate Angebots-XML folgt dem
[XML-Schema für Kundenangebote](option-offer-v1.xsd).

Der externe BMS-Prozess liest offene Versandaufträge mit leerem
`BmsDocumentJson` und erzeugt daraus das freigegebene Kundenangebots-PDF
sowie den originalen Mailbetreff und -text. Der Freibleibend-Hinweis muss in
der verwendeten Originalvorlage enthalten sein. Der Prozess übergibt das
Ergebnis in `BmsDocumentJson` mit den Eigenschaften `source` (Wert `bms`),
`messageKey` (aus `OfferJson`), `number`, `subject`, `body`, `isBodyHtml`,
`pdfBase64` und optional `attachments` (je `fileName`, `contentType`,
`contentBase64`). Beim Schreiben muss der Prozess sicherstellen, dass
`BmsDocumentJson` weiterhin leer und `OfferJson.messageKey` identisch ist.
Damit kann ein verspätetes BMS-Ergebnis eine neue Anforderung nicht
überschreiben.

Die App ergänzt die separate Angebots-XML sowie drei `mailto:`-Links an den
Außendienst. Zuerst steht „Angebot annehmen“, gefolgt von „Gegenangebot machen“
und „Angebot nicht interessant“. Der MailService erhält je Angebotsnummer
genau einen Empfänger.
Die stabil aus `messageKey` abgeleitete `ClientMessageId` hält Wiederholungen
derselben Anfrage zusammen. Erst bestätigter Status `Sent` erzeugt in einer
Transaktion die Sanduhr und die Zeile in `BMSApp.tbl_Temp_Aktivitaet`.
Unbestätigte Versandfälle ohne MailService-ID bleiben zur Klärung gesperrt.
Der externe BMS-Import übernimmt die Aktivität anhand ihrer eindeutigen ID
in die Kundenhistorie und meldet Aktivitäts-ID und Übernahmezeit zurück.
`ActivityDate` ist in UTC gespeichert.
