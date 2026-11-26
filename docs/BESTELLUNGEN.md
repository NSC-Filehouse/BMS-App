# Lieferantenartikel und Bestellungen

Die Lieferantendetailansicht zeigt eine gemeinsame, alphabetisch sortierte Liste
„Bereits eingekaufte Artikel“. Artikel werden je Lieferant über den Artikelindex
zusammengefasst. In der Liste steht nur die eigene Artikelbezeichnung aus dem
Artikelstamm; fehlt diese, dient der neueste nicht stornierte Einkauf als Ersatz.
Ein Klick auf den Artikelnamen öffnet kein zusätzliches Popup.
Aktuelle VL-Bestände werden klein
unter dem jeweiligen Artikel mit Menge, Lager und aktueller BE aufgeführt.

Die VL-Bestände gehen in den Verkaufswarenkorb für den ausgewählten Kunden.
In der aufgeklappten VL-Liste können mehrere Positionen per Checkbox ausgewählt
und gemeinsam über das Warenkorbsymbol in einen Auftrag übernommen werden.
Positionen ohne verfügbaren Bestand sind gesperrt. Die Auswahl gilt je Artikel;
beim Zurückkehren bleiben Auswahl und aufgeklappte VL-Bereiche erhalten.
Ohne Kunden wird zuerst die bestehende Kundenauswahl durchlaufen. Über das
Warenkorbsymbol am Artikel wird eine neue Bestellung angelegt. Die Auswahl für
neue Bestellungen erfolgt weiterhin einzeln. Pro Bestellung ist nur eine
Artikelart (Artikelindex) zulässig;
mehrere unabhängig bearbeitbare Positionen derselben Artikelart bleiben möglich.
Diese Regel wird im Warenkorb und serverseitig bei Anlage, Bearbeitung und
Finalisierung geprüft. Bestehende gemischte Entwürfe müssen vor dem Speichern
auf eine Artikelart reduziert werden. Erneutes Hinzufügen desselben Artikels
überschreibt keine Eingaben und fasst keine Kopien zusammen.

## Kopf und Positionen

Am Bestellkopf stehen Lieferant, Ansprechpartner, Zahlungsziel, Incoterm,
gemeinsamer Ladeort, gewählte Verpackung und Sonstiges. Die Verpackungs- und
Incotermoptionen stammen aus denselben SQL-Katalogen wie bei Aufträgen.
Das Zahlungsziel wird bei der Anlage aus der letzten Lieferantenbestellung
serverseitig ermittelt; beim Bearbeiten bleibt der gespeicherte Wert erhalten.
Der Ansprechpartner mit Rang 1 wird vorbelegt; gibt es nur einen benannten
Kontakt, wird wie beim Auftrag dieser verwendet.

Jede Position enthält Artikel, Menge in kg, EK in EUR je Tonne, Liefertermin,
Reserviert-für-Text und Positionshinweis. Die ursprüngliche Verpackung wird
serverseitig aus dem letzten Einkauf ermittelt und je Position festgehalten.
Der Änderungsindikator vergleicht sie mit der gemeinsamen Kopfverpackung.
Kopien erhalten eigene Kennungen und behalten sämtliche bearbeiteten Werte.

Neue Positionen beginnen mit 25.000 kg für Silo und 24.750 kg für andere
Verpackungen. EK, Liefertermin und Freitexte bleiben leer. Menge, EK und
Liefertermin sind beim Speichern erforderlich. Historischer EK und historischer
Liefertermin werden separat aus derselben letzten Einkaufsposition angezeigt.
Die Nettosumme berechnet sich als Summe aus Menge in kg / 1.000 * EK je Tonne.
Bei fehlenden Preisen wird die Summe als unvollständig angezeigt.
Pflichtfelder tragen ein rotes Sternchen. Fehlende Eingaben werden erst nach
einem Speicherversuch rot markiert und mit „Pflichtfelder fehlen“ gemeldet.
Ältere Browserwarenkörbe ohne Vorbelegungsversion werden einmal auf leere
EK-/Termin-/Freitextfelder und die Verpackungs-Standardmenge umgestellt.
Danach bleiben manuelle Eingaben erhalten. Bei einer unklaren Speicherantwort
bleibt der eingefrorene ursprüngliche Inhalt vollständig unverändert.

Der Ladeort ist wie die Lieferadresse beim Auftrag ein Kopffeld. Bei FCA und
EXW stehen die Abholadressen aus dem Lieferantenstamm zur Auswahl. Das blaue
Plus öffnet „Neuer Ladeort“. Die Bestellung speichert die vollständige
eingegebene Adresse einschließlich optionaler Ladezeiten, Kontakt und Hinweise.
Bei dieser manuellen Adresse bleiben die technischen Adress-IDs leer.

Über den Positionen stehen die geschätzte LKW-Anzahl und die Schaltflächen
„Alle Löschen“ und „Aufteilen“. Der Reset behält die erste Position mit den
Einstiegsvorgaben und leert den Liefertermin. Im Aufteilungsdialog stehen
25.000, 24.750 und 23.375 kg je LKW zur Wahl. Weitere Lieferungen ziehen ihre
Teilmengen von der ersten Lieferung ab. Die App übernimmt je Lieferung den
Termin und die VL-Bemerkung in die erzeugten LKW-Positionen.

## Dateianhänge

Bestellwarenkorb und Bestellbearbeitung verwenden wie Aufträge die Büroklammer
oben rechts, die Mehrfachauswahl und die Dateiliste am Kopf. Erlaubt sind PDFs
und Bilder einschließlich HEIC/HEIF, mit höchstens 10 MB je Datei und 100 MB je
Upload. Neue Dateien können vor dem Speichern entfernt werden; das Entfernen
gespeicherter Dateien kann bis zum Speichern rückgängig gemacht werden.

Die Dateien werden zusammen mit der Bestellung gespeichert. Positionskopien
vervielfachen die Anhänge nicht. Die Detailansicht bietet dieselbe Dateiliste
mit Download wie Aufträge; Downloads berücksichtigen Mandant, Eigentümer und
gelöschte Anhänge. Bei vollständigem Löschen einer Bestellung werden auch ihre
Anhänge gelöscht. Einzelne Entfernungen werden mit Zeitpunkt und Benutzer
festgehalten und aus Anzeige, Downloads und Mailversand ausgeschlossen.

Beim Weiter-Einkaufen bleiben ausgewählte Dateien im Speicher des Browsertabs.
Nach einem Neuladen müssen noch nicht hochgeladene Dateien erneut ausgewählt
werden; darauf weist die Oberfläche wie beim Auftragsentwurf hin. Eine unklare
Speicherantwort wird mit derselben Anfragekennung geprüft. Wurde die Bestellung
bereits gespeichert, werden keine Dateien doppelt angelegt. Fehlen bei einer
noch nicht gespeicherten Wiederholung Dateien, wird die Anlage abgewiesen und
die erneute Auswahl angefordert.

Die interne CS-Mail bei Übergabe enthält die aktiven Anhänge.

## Übersicht, Detailansicht und Löschen

Bestellübersicht und Detailansicht folgen der Auftragsdarstellung: Ersteller,
Lieferant, Status und nummerierte Positionen mit Menge, EK und Liefertermin.
Die Übersicht bietet dieselben Status-, Ersteller- und Zeitraumfilter.
Die Aktionen stehen unter den Daten; auf dem Handy werden sie in zwei Spalten
mit umbrechendem Text angezeigt. Die grünen Einkaufswarenkörbe am Lieferanten
kennzeichnen Artikel, die bereits im Bestellwarenkorb liegen; blaue Warenkörbe
stehen für noch nicht hinzugefügte Artikel. Der Tooltip erklärt diesen Zustand.

Entwürfe und Bestellungen zur Nacharbeit können vollständig gelöscht werden.
Das Entfernen ihrer letzten Position löscht unmittelbar die gesamte Bestellung;
bei weiteren Positionen werden Zeilenänderungen erst beim Speichern übernommen.
Im ungespeicherten Warenkorb leert die letzte Position nur den lokalen Warenkorb.
Nach dem Löschen einer gespeicherten Bestellung geht es zur Bestellübersicht
mit den bisherigen Filtern zurück, niemals zur gelöschten Detailansicht.

Kopf, Positionen und vorhandene Mail-Outboxeinträge werden in einer Transaktion
gelöscht. Mandant, Eigentümer und bearbeitbarer Status werden unter Sperre
geprüft; Status 1 und 2 bleiben gegen Löschen geschützt. Wiederholtes DELETE nach
verlorener Antwort ist unschädlich. Ein Löschfehler rollt alle Löschungen zurück
und lässt die eingegebenen Formulardaten stehen. Explizites Speichern mit einer
leeren Positionsliste verwendet denselben vollständigen Löschvorgang.

## Speicherung und Übergabe

Die Anlage speichert eine stabile Client-Anfragekennung. Wiederholungen nach
einem Verbindungsabbruch liefern dieselbe Bestellung. Solange der Ausgang
ungeklärt ist, hält die Oberfläche den ursprünglich gesendeten Inhalt fest.
Kopf, Positionen und vollständige Antwort werden innerhalb einer Transaktion
ermittelt; ein Lesefehler vor dem Commit rollt die Anlage zurück.

Status: 0 Entwurf, 1 an BMS übergeben, 2 von BMS übernommen, 3 Nacharbeit.
Bei der Übergabe wird ausschließlich die interne CS-Mail ausgelöst.
Die Statusänderung auf 2 löst keinen Mailversand an den Lieferanten aus.

Historische BE-Nummern und Positionskennungen werden bei neuen Bestellungen
nicht in tbp_source_bestellindex / tbp_source_position_id / tbp_source_order_date
geschrieben. Bestehende historische Daten werden nicht gelöscht. Die API,
Bestellansicht, Mails und neue Timeline-Einträge verwenden diese Altreferenzen
nicht. tb_bestellindex ist ausschließlich die später zugeordnete neue
BMS-Bestellnummer. Beim Verkaufsweg bleiben aktuelle VL-BE-Referenzen erhalten.

## Datenbank- und BMS-Voraussetzungen

Alle Bestell-, Positions-, Anhangs- und Versandtabellen werden über
[`install_BMSApp.sql`](../apps/backend/sql/install_BMSApp.sql) eingerichtet.
Es gibt keine separate Reihenfolge alter Upgrade-Skripte mehr; siehe
[INSTALLATION.md](INSTALLATION.md). Anhänge verwenden den technischen INT-Schlüssel
`tbl_Temp_Bestellung.tb_id`. Die API-Konfiguration heißt
`tempPurchaseOrderAttachment`, optional überschreibbar über
`BMS_SQL_APP_TABLE_TEMP_PURCHASE_ORDER_ATTACHMENT`.

Das aktuelle Schema enthält unter anderem:

- Kopf: tb_packaging_type_id (INT NULL).
- Position: tbp_original_packaging_type (NVARCHAR(200) NULL),
  tbp_original_packaging_type_id (INT NULL),
  tbp_packaging_type_changed (BIT NOT NULL, Standard 0).

Für Bestellungen ohne ursprünglichen Verpackungssnapshot wird beim Bearbeiten
der bisherige Kopfwert als Ausgangswert verwendet. Der allgemeine Kopfwert
tb_packaging_type bleibt die gewählte Verpackung für die gesamte neue BE.

Die externe BMS-Übernahme liegt außerhalb dieses Repositories. Vor Freigabe
prüfen, dass sie den Kopf und alle einzelnen Positionen übernimmt, eigenständige
Positionskopien erhält, die gewählte Kopfverpackung verwendet und nicht auf
historische tbp_source_*-Felder angewiesen ist. Status 2 und tb_bestellindex
werden weiterhin von dieser Übernahme gesetzt. Schema-Installation, produktive
Datenänderungen und ein Serverneustart werden durch einen Code-Push nicht
automatisch ausgeführt.

## Kundenauftrag mit vorgelagerter Beschaffung (NSC-Pilot)

Beim Speichern legt die App den Kundenauftrag und je zu beschaffender
Auftragsposition eine Bestellung mit den beidseitigen Positionsreferenzen in
einer Transaktion an. Eine bewusst gewählte VL-Teilmenge bleibt eine eigene
Auftragsposition. Die App übergibt die Bestellung über den bestehenden
CS-Ablauf. Nach einem Übergabefehler kann der AD die gespeicherte Bestellung
über den Auftrag öffnen und senden.

Die BMS-Übernahme muss für jede App-Position den daraus erzeugten
`dbo.tblBest_Position.beP_BEposID` in
`BMSApp.tbl_Temp_Best_Position.tbp_bms_position_id` zur ursprünglichen
`tbp_id` zurückschreiben. Dazu gehören der neue Kopfindex
`tb_bestellindex` und `tb_status = 2`. Bei genau einer Position in der
App-Bestellung und genau einer Position unter dem bestätigten BMS-Kopf
kann die App die Position über diesen Kopf auflösen, wenn Lieferant und
Artikel übereinstimmen. Mehrdeutige Rückgaben warten auf eine eindeutige
Positions-ID. Die historischen `tbp_source_*`-Felder behalten ihre Bedeutung.

Der Abgleich wartet auf die VL-Position und den dafür verfügbaren Bestand im
aktiven Mandanten. Danach kann der AD den Kundenauftrag über dessen
bestehende Abschlussaktion an BMS übergeben. Der normale Entwurfs-Reminder
überspringt verknüpfte Entwürfe. Für NSC zählt er zusätzlich eigenständige
Bestellentwürfe.

Für den Pilotstart den aktuellen Installer in der zentralen Testdatenbank
anwenden. Die Rückgabe im Testmandanten mit Status 2, Einzel- und
Mehrfachpositionen, verzögerter VL und dem bestehenden Mail-/Push-Ablauf
prüfen.

## Lieferantenbezeichnungen und Rechnungen (29.10.2026)

In „Bereits eingekaufte Artikel“ ist die Lieferantenbezeichnung führend. Fehlt sie im Artikelstamm, wird die letzte beim Lieferanten verwendete Bestellbezeichnung genutzt. Unsere interne Bezeichnung bleibt ein separates Feld und erscheint nur beim Bestellen bzw. in Bestellansichten klein unter der Lieferantenbezeichnung. Speichern, Kopieren und Finalisieren übernehmen den Lieferantennamen in tbp_article; vorhandene Entwürfe mit unserer aktuellen Stammdatenbezeichnung werden vor der Übergabe korrigiert. Bereits finalisierte Datensätze werden dabei nicht umgeschrieben. Die interne Bezeichnung wird lesend aus dem jeweiligen Mandanten ergänzt; neue Spalten sind nicht erforderlich.

NT-Artikel werden ausschließlich aus der Einkaufsliste ausgeblendet. Erkannt wird NT als separates Kennzeichen im Gruppennamen, Stammdaten-, Lieferanten- oder letzten Einkaufsnamen. Bestehende Bestellungen, Rechnungen und Optionen bleiben sichtbar.

Das Rechnungs-Accordion lädt weiterhin nur Eingangsbelege (tblBelege.be_EinAus=2) des geöffneten Lieferantenkontos. Die Suche filtert innerhalb des gewählten Zeit-/Zahlungsstatus nach Rechnungsnummer, BE-/Positionsnummer und Materialbezeichnungen. Die Verknüpfung verwendet Lieferantenkonto plus beP_LiefRGnr; ein vorhandenes Positions-Rechnungsdatum muss zum Belegdatum passen. Dadurch werden gleichlautende Nummern anderer Lieferanten bzw. Jahre nicht vermischt. Ein Beleg ohne verknüpfte Position bleibt über seine Rechnungsnummer auffindbar; eine fehlende BE-Zuordnung wird nicht aus Freitext erraten.

Keine Schema-/DDL-Migration für diese Erweiterung erforderlich.
