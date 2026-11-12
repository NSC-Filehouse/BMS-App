# Optionen bestellen

Optionen verwenden Bestellwarenkorb, Bestellmaske, Temp-Bestellung und den
bestehenden Status-/Mailablauf. Lieferant wird nach Herkunft, Kontenzuordnung
und ERP-Daten vorgeschlagen. Der Einstieg aus einer Lieferantenseite bevorzugt
deren passendes Konto. Der Benutzer bestätigt den Lieferanten ausdrücklich und
wählt den Artikel auch bei nur einem Treffer. Eine abweichende Lieferantenauswahl
und die manuelle Artikelsuche bleiben möglich. Technische MFI-Widersprüche sperren
den Artikel; fehlende Prüfbedingungen erfordern eine ausdrückliche Bestätigung.
Die Auswahl ändert keine gemeinsame Optionszuordnung und erzeugt keine Lernregel.

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
LKW-Zahlen ohne belegtes Gewicht werden nicht automatisch in kg umgedeutet. Im
Dialog kann die angebotene Gesamtmenge eingegeben und ihre Einheit ausdrücklich
als kg oder t (Tonnen) gewählt und bestätigt werden. Die Umrechnung wird vor der
Bestätigung angezeigt; gespeichert wird einheitlich kg (z.B. 24 t = 24.000 kg).
Die Eingabe betrifft die gesamte Optionsposition, nicht nur eine Teilbestellung.
Bei einer Angabe wie "1 truck" muss auch dessen tatsächlich angebotenes Gesamtgewicht
geklärt werden; die Auswahl einer Gewichtseinheit allein genügt nicht. Die Auswahl
betrifft die Menge; der Bestellpreis wird weiterhin in EUR/t eingegeben.
Eine vorhandene LKW-Obergrenze mit bekanntem maximalem Ladegewicht darf dabei nicht
überschritten werden. Eine belegte Gesamtmenge aus der Quelle ist nicht überschreibbar.

Die manuelle Bestätigung liegt an der Optionsposition in
`opp_GesamtmengeBestaetigtKg`, `opp_MengeBestaetigtQuellHash`,
`opp_MengeBestaetigtVon` und `opp_MengeBestaetigtAm`. Der Hash bindet sie an die
ursprünglichen Mengenangaben. Der Hintergrundabgleich überschreibt diese Felder
nicht; bloße Änderungen am Matching-Zeitpunkt entwerten die Bestätigung nicht.
Veränderte ursprüngliche Mengen verlangen dagegen eine neue Bestätigung.
Eine manuell bestätigte Gesamtmenge kann im selben Dialog korrigiert werden,
aber nicht unter bereits verplante Mengen. Konkurrierende Korrekturen werden
über Quellsperre und Vergleich der vorher bestätigten Menge abgefangen.

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
