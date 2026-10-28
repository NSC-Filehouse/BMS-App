# Lieferantenartikel und Bestellungen

Die Lieferantendetailansicht trennt „Artikel auf VL“ und „Weitere Artikel“.
Artikel werden je Lieferant über den Artikelindex zusammengefasst; angezeigt
wird der Name aus dessen neuester nicht stornierter Einkaufsposition.
Bei gleichem Bestelldatum bestimmen Bestellindex und Positionskennung die
Reihenfolge. VL-Ware wird über ihre tatsächliche Einkaufsposition dem
Lieferanten zugeordnet. Ihre einzelnen BE-/Lagerpositionen bleiben auswählbar.

VL-Artikel gehen in den Verkaufswarenkorb für den ausgewählten Kunden. Ohne
Kunden wird zuerst die bestehende Kundenauswahl durchlaufen. Weitere Artikel
gehen in einen mandantenbezogenen Bestellwarenkorb für genau einen Lieferanten.
Erneutes Hinzufügen überschreibt keine Eingaben und fasst keine Kopien zusammen.

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

Der Ladeort ist wie die Lieferadresse beim Auftrag ein Kopffeld. Nur für alle
ausgewählten Artikel historisch belegte Orte dieses Lieferanten sind gültig.
Bei fehlendem gemeinsamen Ort sind getrennte Bestellungen nötig. Historische
Adressfreitexte sind keine technischen Adress-IDs; tb_loading_location_id bleibt
für diese Orte NULL. Andere Lieferanten- oder Mandantenadressen werden nicht
als Ersatz zugelassen.

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
