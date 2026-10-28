# Lieferantenartikel und Bestellungen

Die Lieferantendetailansicht zeigt eine gemeinsame, alphabetisch sortierte Liste
„Bereits eingekaufte Artikel“. Artikel werden je Lieferant über den Artikelindex
zusammengefasst. In der Liste steht nur die eigene Artikelbezeichnung aus dem
Artikelstamm; fehlt diese, dient der neueste nicht stornierte Einkauf als Ersatz.
Ein Klick auf den Artikelnamen öffnet kein zusätzliches Popup.
Aktuelle VL-Bestände werden klein
unter dem jeweiligen Artikel mit Menge, Lager und aktueller BE aufgeführt.

Die VL-Bestände gehen in den Verkaufswarenkorb für den ausgewählten Kunden.
Ohne Kunden wird zuerst die bestehende Kundenauswahl durchlaufen. Über das
Warenkorbsymbol am Artikel wird eine neue Bestellung angelegt. Es gibt keine
Mehrfachauswahl. Pro Bestellung ist nur eine Artikelart (Artikelindex) zulässig;
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

Der Ladeort ist wie die Lieferadresse beim Auftrag ein Kopffeld. Für die eine
Artikelart stehen sämtliche bisherigen Abholadressen dieses Lieferanten aus
allen zugehörigen, nicht stornierten Einkaufspositionen zur Auswahl. Dazu werden
be_AdresseAbhol und be_AdresseSP_Abhol ausgewertet; gleiche Adressen erscheinen
nur einmal. Lange Adressen werden im Dropdown mehrzeilig dargestellt. Historische
Adressfreitexte sind keine technischen Adress-IDs; tb_loading_location_id bleibt
für diese Orte NULL. Andere Lieferanten- oder Mandantenadressen werden nicht
als Ersatz zugelassen.

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
Die bestehende interne Mail-Outbox wird bei der Übergabe verwendet. Die
Lieferantenmail wird weiterhin erst bei Status 2 ausgelöst. Ein lokaler Test
weist weder tatsächlichen Mail-/Push-Versand noch die externe Übernahme nach.

Historische BE-Nummern und Positionskennungen werden bei neuen Bestellungen
nicht in tbp_source_bestellindex / tbp_source_position_id / tbp_source_order_date
geschrieben. Bestehende historische Daten werden nicht gelöscht. Die API,
Bestellansicht, Mails und neue Timeline-Einträge verwenden diese Altreferenzen
nicht. tb_bestellindex ist ausschließlich die später zugeordnete neue
BMS-Bestellnummer. Beim Verkaufsweg bleiben aktuelle VL-BE-Referenzen erhalten.

## Datenbank- und BMS-Voraussetzungen

Vor dem Einsatz des neuen Backends im zentralen BMS ausführen:
`apps/backend/sql/upgrade_temp_purchase_order_shopping.sql`.
Bei Neuinstallation zuerst `add_temp_purchase_order.sql`, danach das Upgrade.
Das Upgrade ist wiederholbar und ergänzt nur:

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
werden weiterhin von dieser Übernahme gesetzt. Das SQL-Upgrade, produktive
Datenänderungen und ein Serverneustart werden durch einen Code-Push nicht
automatisch ausgeführt.
