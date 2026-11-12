# Optionen bestellen

Optionen verwenden Bestellwarenkorb, Bestellmaske, Temp-Bestellung und den
bestehenden Status-/Mailablauf. Lieferant wird nach Herkunft, Kontenzuordnung
und ERP-Daten vorgeschlagen. Der Einstieg aus einer Lieferantenseite bevorzugt
deren passendes Konto. Der Benutzer kann den Lieferanten ändern und wählt den
Artikel auch bei nur einem Treffer. Eine zusätzliche Lieferanten-Bestätigungsbox
entfällt; die Übernahme in den Bestellwarenkorb bestätigt die aktuelle Auswahl.
Eine abweichende Lieferantenauswahl
und die manuelle Artikelsuche bleiben möglich. Technische MFI-Widersprüche sperren
den Artikel; fehlende Prüfbedingungen erfordern eine ausdrückliche Bestätigung.
Die Auswahl ändert keine gemeinsame Optionszuordnung und erzeugt keine Lernregel.
Der Dialog zeigt Lieferant, Artikel, Verpackungsart und Mengenangaben von Beginn
an. Die Suchfelder für Lieferanten und Artikel sind zunächst verborgen und werden
jeweils über die Lupe rechts neben der zugehörigen Auswahlliste geöffnet.
Der Bestelldialog lädt alle Artikelvorschläge in einem Schritt. Er zeigt deren
Anzahl und bittet um die Auswahl eines Artikels; auch ein einzelner Vorschlag
wird nicht automatisch gewählt. Bei fehlenden Vorschlägen erscheint direkt der
Hinweis auf die Suche nach Namen oder Artikelnummer. Ein Nachlade-Button entfällt.
Bei einem anderen Lieferanten im bestehenden Warenkorb führt die Fehlermeldung
über "Zum Bestellwarenkorb" direkt dorthin. Der Rückweg führt zur Optionsseite und
zur betroffenen Position; der Bestelldialog wird nicht automatisch wieder geöffnet.
Der Link verändert keine vorhandenen Warenkorbpositionen.
Andere Warenkorbeinstiege behalten ihr eigenes Rücksprungziel inklusive Suchfilter,
Seite und aufgeklappten Bereichen. Das beim aktuellen Einstieg mitgegebene Ziel
hat Vorrang vor einem älteren gespeicherten Optionsziel; bei direktem Aufruf gilt
weiter das gespeicherte Ziel beziehungsweise die bisherige Lieferantenansicht.

## Fristen

OptionReader verwendet `OPTION_READER_DEFAULT_VALIDITY_WORKDAYS=3`. Eine echte
Lieferantenfrist bleibt erhalten. Sonst gelten drei Tage Montag bis Freitag ab
dem ursprünglichen Maileingang (Europe/Berlin); Eingangstag zählt nicht, Feiertage
werden mitgezählt. Gültigkeit endet am Tagesende. Die alte Variable
`OPTION_READER_DEFAULT_VALIDITY_DAYS` ist außer Betrieb.

Alle Optionsansichten schließen abgelaufene Positionen und Demos aus. Auch
`preview=1` hebt den Filter nicht mehr auf. Vorschläge, Speichern und Übergabe
prüfen die Gültigkeit ebenfalls. Bestehende übergebene Bestellungen bleiben in
der Bestellhistorie sichtbar. Die fachlichen Pilot-Berechtigungen bleiben erhalten.

## Schnittstelle für ERP/BMS

Die zentrale Tabelle `BMSApp.tbl_Temp_Best_Position` erhält:

| Spalte | Typ | Bedeutung |
| --- | --- | --- |
| `OptionID` | `INT NULL` | `NULL`: normale Bestellung; sonst `BMSApp.tblOptionen.op_id` |
| `OptionPositionID` | `INT NULL` | Konkrete `BMSApp.tblOptionenPositionen.opp_id` innerhalb dieser Option |
| `tbp_option_mfi_acknowledged` | `BIT NOT NULL` | Technische Einzelbestätigung bei unvollständiger MFI-Prüfung |

Die beiden IDs sind gemeinsam gesetzt oder gemeinsam `NULL`. Fremdschlüssel
prüfen auch ihre Zusammengehörigkeit. Es gibt kein zusätzliches Windows-Userfeld.
Die integrierte Windows-Anmeldung wird nur für die Schema-/Datenanpassung genutzt.

Positionskopien behalten die Optionsreferenzen. Änderungen, Nacharbeit und erneutes
Laden erhalten sie ebenfalls. Normale Bestellungen benötigen weiterhin einen
historischen Einkauf; bestätigte Optionspositionen dürfen aktive ERP-Artikel ohne
Einkaufshistorie verwenden. Lieferantennachweis ist die bestehende Lieferantenzuordnung,
eine vorhandene Einkaufshistorie oder eine aktive Optionskontenzuordnung im Zielmandanten.
Damit wird z.B. Borealis LF0124 trotz fehlender Kunden-Lieferanten-Verknüpfung erkannt.

Ladeorte werden über die gesamte Einkaufshistorie des Lieferanten angeboten.
Neue Ladeorte werden über das kleine Plus neben der Auswahl in einer eigenen
Maske erfasst: Firma/Lager, Straße, PLZ, Ort, Land sowie optionale Ladezeiten,
Kontakt und Hinweise. Die Länderauswahl verwendet dieselben BMS-Länder wie neue
Lieferadressen bei Aufträgen. Der vollständige Text wird in die Bestellung
übernommen; ein neuer Ladeort behält die manuelle Herkunft und keine technische
Adress-ID.
Die Auswahl verwendet dieselbe kompakte Darstellung wie Lieferadressen bei
Aufträgen: Firma fett, Ort/Adresse klein darunter. Wiederholte Adressüberschriften
und Transporthinweise erscheinen nicht als riesige Dropdown-Einträge. Über
"Adresse anzeigen" ist der vollständige gewählte Text einschließlich aller
Hinweise einsehbar; gespeichert wird weiterhin die unveränderte volle Adresse.
Ansprechpartner stehen aus den Lieferantenkontakten zur Auswahl; vorhandene
manuelle Kontakttexte bleiben erhalten und sind weiterhin eingebbar. Im
Bestellwarenkorb entfallen Artikelindex und die zusätzliche blaue Optionszeile.
"Weiter einkaufen" steht links vor "Bestellentwurf speichern".
Ein neuer Ladeort wird als Text mit `tb_loading_location_source='manual'`,
`tb_loading_location_changed=1` und technischer Adress-ID `NULL` gespeichert.

Status bleibt: 0 Entwurf, 1 an BMS übergeben, 2 durch BMS übernommen, 3 Nacharbeit.
Die CS-Mail nennt die Optionsreferenzen; die Lieferantenmail erhält keine internen
Options-IDs. Der ERP-Importer muss `OptionID` übernehmen/auswerten. Die App erfindet
keinen externen Bestellendpunkt, solange dieser nicht existiert.

## Teilmengen und Gleichzeitigkeit

Die Obergrenze gilt pro Optionsposition gemeinsam für alle Mandanten/Lieferanten.
Ein belegter Chargenbestand ist die Gesamtgrenze; sonst gilt die angebotene maximale
kg-Menge, bei einer Einzelmenge diese. Eine Mindestabnahme ist keine Gesamtmenge.
Konkrete Truck-Anzahlen werden automatisch berechnet. Eine eindeutig erkannte
Verpackungsart wird vorausgewählt: über die normierte Verpackungs-ID oder eine
eindeutige Bezeichnung aus der Bestellauswahlliste. Reine Vermutungen und Angaben
wie "Sackware / Big Bags / Octabins" gelten nicht als eindeutige Verpackungsart.
Nur bei vollständig fehlender Verpackungsangabe ist Siloware mit 25.000 kg je Truck
der Rückfallwert. Vorhandene mehrdeutige oder nicht zuordenbare Angaben lassen die
Auswahl offen; der Benutzer wählt dann die Verpackungsart ausdrücklich.
Bei Sackware und anderen Verpackungsarten gelten
24.750 kg je Truck. Eine Spanne 1–2 Trucks verwendet die Obergrenze 2. Der Dialog
zeigt direkt die kg-Gesamtmenge, ohne Einheitenauswahl und ohne zusätzliche
Mengenbestätigung. Bereits belegte kleinere kg-/Chargenmengen begrenzen weiterhin
das Angebot. Frühere manuelle Truck-Bestätigungen ändern diese feste Regel nicht.
Liste und Detailansicht berechnen ihre verfügbare Menge anhand der erkannten
Verpackung und ziehen gespeicherte Bestellungen ab. Bei mehrdeutiger Verpackung
ohne belegte kg-Menge wird kein pauschaler Silo-Bestand angezeigt. Im Bestellweg
bleibt die ausdrücklich gewählte Verpackungsart für die Mengenprüfung maßgeblich.

Steht in der Quelle nur "full truck loads" ohne Anzahl, bleibt die Anzahl offen.
Der Benutzer gibt die angebotene Truck-Anzahl ein und bestätigt sie; die App
berechnet die kg-Menge anhand der Verpackung. Auch hier gibt es keine kg-/t-Auswahl.
Nur sonstige Optionen ohne belegte kg-Gesamtmenge benötigen weiterhin eine
manuelle Menge mit ausdrücklicher kg-/t-Auswahl. Eindeutig normalisierte Mengen
benötigen diese Bestätigung nicht. Der OptionReader erkennt Originaleinheiten,
bestimmte Tabellenüberschriften und freigegebene Lieferanten-/Ladegewichtsregeln.
Ungeklärte Angaben werden nicht pauschal als kg oder Tonnen interpretiert.
Die Eingabe betrifft die gesamte Optionsposition, nicht nur eine Teilbestellung;
der Bestellpreis wird weiterhin in EUR/t eingegeben.

Die manuelle Bestätigung liegt an der Optionsposition in
`opp_GesamtmengeBestaetigtKg`, `opp_MengeBestaetigtQuellHash`,
`opp_MengeBestaetigtVon` und `opp_MengeBestaetigtAm`. Bei Truck-Optionen speichern
`opp_MengeBestaetigtVerpackungsartID` und `opp_MengeBestaetigtTrucks` zusätzlich die
gewählte Verpackung und gegebenenfalls die Truck-Anzahl. Der Hash bindet sie an die
ursprünglichen Mengenangaben. Der Hintergrundabgleich überschreibt diese Felder
nicht; bloße Änderungen am Matching-Zeitpunkt entwerten die Bestätigung nicht.
Veränderte ursprüngliche Mengen verlangen dagegen eine neue Bestätigung.
Eine manuell bestätigte Gesamtmenge kann im selben Dialog korrigiert werden,
aber nicht unter bereits verplante Mengen. Konkurrierende Korrekturen werden
über Quellsperre und Vergleich der vorher bestätigten Menge abgefangen.

Ein Verpackungswechsel berechnet konkrete Truck-Mengen sofort neu. Nur bei
manuell ergänzter Truck-Anzahl wird die Mengenbestätigung zurückgesetzt.
Die gewählte Verpackung geht in den Bestellkopf über;
die ursprüngliche Quellenverpackung bleibt als Positions-Snapshot erhalten.
Ein bereits anders verpackter Warenkorb wird nicht still überschrieben. Auch beim
Bearbeiten und Abschließen begrenzt die gewählte Verpackung die zulässige Truck-Menge.

Alle gespeicherten Temp-Positionen zählen: Entwurf, Übergabe, ERP-Übernahme und
Nacharbeit. Auch Positionskopien werden addiert. Eine eigene Änderung schließt
die bisherige Bestellung aus und prüft stattdessen ihre vollständige neue Menge.
Die Quelle wird in einer Transaktion mit `UPDLOCK,HOLDLOCK` gesperrt. So können
konkurrierende Bestellungen dieselbe Restmenge nicht doppelt vergeben.
Löschen/Reduzieren eines bearbeitbaren Entwurfs gibt Menge frei; ein Browserwarenkorb
allein reserviert noch nichts. Übernommene Temp-Zeilen müssen erhalten bleiben,
solange sie die Mengennachverfolgung bilden. ERP-Zeilen werden nicht doppelt addiert.
Ein künftiger ERP-Endpunkt benötigt dieselbe Mengen-/Idempotenzregel.

## Migration und Prüfung

`pwsh -File apps/backend/scripts/apply-option-purchases.ps1` ergänzt das Schema
wiederholbar mit dem hier angemeldeten Windows-Benutzer. Die einmalige Fristkorrektur
liegt im OptionReader: `pwsh -File scripts/migrate-option-validity.ps1`. Sie ersetzt
nur künstliche Fristen anhand des ursprünglichen Maileingangs und blendet Demos aus.
Sie protokolliert keine alten/neuen Fristwerte. Serverneustart und Deployment sind
separate Schritte.

`node apps/backend/scripts/smoke-option-purchases.js` prüft mit integrierter
Windows-Anmeldung die echten Sperren in zwei konkurrierenden Verbindungen,
mandantenübergreifende Mengen, Eigenänderungen und Übermengen. Alle Testzeilen
werden zurückgerollt; es wird nichts an BMS übergeben und keine Mail ausgelöst.
