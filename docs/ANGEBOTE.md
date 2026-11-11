# Angebote in der App

Die Funktion ist ausschließlich für die verifizierten aktiven Identitäten MFR,
NSC und AKI freigeschaltet. Jeder sieht nur eigene App-Angebote im aktiven
Mandanten, auch mit sonstigem Vollzugriff. Die bestehende lesende Anzeige von
BMS-Angeboten beim Kunden behält ihre Berechtigungen.

## Bedienung wie beim Auftrag

Im Burgermenü steht Angebote vor Aufträge. Die Liste verwendet wie die
Auftragsliste eine Suche, Statusschaltflächen, Zeitraum-Radiobuttons,
Seitennavigation und das Plus. Beim Kunden startet der eingerahmte Button NEU.

Der Editor folgt dem Auftragsformular: Kunden-Autocomplete, Kundenname,
Adresse, Ansprechpartner, Kundenreferenz, Incoterm, Verpackungsart,
Liefer-/Abholadresse, aktuelle Zahlungsbedingung und optionale abweichende
Zahlungsbedingung. Danach folgen interne Bemerkungen und Positionen in einem
Formularfluss. Verpackung und Zahlungsbedingungen stammen aus denselben
BMS-Stammdaten wie beim Auftrag. Der doppelte Zahlungstext als Freitextfeld
entfällt. Der Kontakt wird mit Top 1, ersatzweise Top 2, dann Top 3 vorbelegt.
Unbewertete Kontakte werden nicht automatisch ausgewählt: Bitte wählen.

Der Unterschied zur Auftragserfassung ist die Quelle: Die Artikelauswahl liest
alle aktiven Artikel aus dbo.tblArt_Artikel, unabhängig von VL und Bestand.
In der Oberfläche heißt sie einfach Artikel. Suchfeld und Seitennavigation
bleiben außerhalb des scrollbaren Ergebnisbereichs stehen. Suchergebnisse
werden mit resolveProductGroup wie in der gruppierten VL nach Stammbuchartikel
zusammengefasst. Lieferantenbezeichnung, frühere Bezeichnung, Produktnummer und
Handelsname werden ebenfalls durchsucht. Produktcodes wie ML1803, ML 1803
und ML-1803 werden unabhängig von diesen Trennzeichen gefunden. ML1803 liefert
in den geprüften Mandanten beide aktiven Artikel 01298 und 01299; der inaktive
Artikel 05787 bleibt ausgeschlossen. Allgemeine Artikelgruppen ersetzen keine
konkreten Artikeltreffer.

Das Plus im Positionsbereich öffnet die Artikelauswahl und anschließend den
Hinzufügen-Dialog mit Menge, Verkaufspreis, Liefer-/Valutadatum, EP und
WPZ-Anweisung. Positionen sind wie beim Auftrag aufklappbar. Der Artikelname
lässt sich mit dem Stiftsymbol bearbeiten; der Papierkorb steht unten rechts.
Das Löschen der letzten gespeicherten Position bestätigt die Löschung des
Angebots mitsamt seiner eigenen unveränderten Reservierungen.

Kopieren fragt nach dem Zielkunden. Artikel, Mengen, Preise, Liefertermine und
WPZ-Anweisungen bleiben erhalten. Kundenbezogene Kontakte, Referenz,
Adressen und Zahlungsbedingungen werden für den Zielkunden neu gesetzt.
Reservierungen, Angebotsnummer und technische Positions-IDs werden nicht kopiert.
Jede Preisstaffel bleibt eine eigene Position. Angebote werden nicht automatisch
zu Aufträgen. Entwürfe werden pro Benutzer, Mandant und Vorgang in der
Browsersitzung wiederherstellbar gehalten; Versionskonflikte verhindern
unbemerktes Überschreiben.

## Datenmodell und Umstellung am 11.11.2026

Das Modell enthält die Auftrags-relevanten Kopf-/Positionsdaten sowie die
separate Angebotssteuerung. Dokumentensprache, Anfrage-Metadaten, Abteilung,
Angebotstitel, Gültigkeit, Währungsauswahl, Einleitungs-/Schlusstext,
Rabatt-/Steuer-/Druckfelder, Muster-/Abgelehnt-Markierungen und alternative
Positionstexte wurden aus dem App-Modell entfernt. Preise bleiben Dezimalwerte;
Einheit und Preisbasis sind intern für die korrekte Betragsberechnung nötig.
Die Währung ist wie beim Auftrag EUR. Summen werden aus Positionen berechnet.

1. Neue Installation: apps/backend/sql/add_temp_offer.sql erstellt direkt die
   gekürzten Tabellen BMSApp.tbl_Temp_Angebot und BMSApp.tbl_Temp_Ang_Position.
2. Bestehende Installation: prepare_temp_offer_order_layout.sql vor dem
   Backendwechsel anwenden. Es ergänzt die Auftragsfelder und macht veraltete
   Pflichtspalten nullable, damit alter und neuer Backendstand während der
   Umstellung funktionieren. Dieses Skript wurde bereits mit der Windows-
   Anmeldung DOMKIMAZ\n.schroeder angewendet.
3. Danach neuen Backend-/Frontendstand bereitstellen und den Backendprozess
   regulär neu starten. Die App führt keinen automatischen Produktionsneustart aus.
4. Erst danach compact_temp_offer_order_layout.sql mit Windows-Authentifizierung
   auf BMS ausführen. Es entfernt die veralteten Spalten. Noch vorhandene
   Legacy-Werte führen zum Abbruch, damit keine Daten still verloren gehen;
   diese Werte müssen zuerst exportiert bzw. bewusst migriert werden.

Die endgültige Kürzung wird nicht vor dem Backendwechsel ausgeführt, weil der
noch laufende alte Code diese Spalten liest. Der neue Code verwendet die alten
Spalten nicht mehr. Die Kürzung ist idempotent und mit minimaler Kopf-/Positions-
Speicherung in einer Windows-SQL-Transaktion geprüft und zurückgerollt.
Das Prüfskript ist apps/backend/scripts/check-temp-offer-layout.ps1.

## Reservierung und externer BMS-Import

Ohne ausdrücklich aktivierte Reservierung beeinflussen Angebote keine
Verfügbarkeiten. Eine Reservierung benötigt BE-Position, Lager, passende Menge
in kg und Enddatum. Sie ist standardmäßig aus. Bestehende fremde Reservierungen
werden nicht überschrieben; die Zuordnung enthält die technische Rowversion.
Änderungen außerhalb des Angebots führen zum Konflikt. Speichern und
Reservieren erfolgen atomar unter demselben zentralen Verfügbarkeits-Lock wie
Auftragsübergaben. Offene Temp-Aufträge werden bei der Reservierung abgezogen.
Kopieren legt keine Reservierung an. Es entstehen keine Verkaufsereignisse,
Mails, Pushs oder Kreditlimit-Anfragen.

Der externe BMS-Importer liegt außerhalb dieses Repositories. Die Freigabe
setzt tag_status=1; Status 0 ist Entwurf, 2 erfolgreich übernommen und
3 Nacharbeit. Bei Erfolg muss der Importer tag_bms_offer_number setzen, bei
Nacharbeit tag_return_comment. Der Import muss über tag_id idempotent sein.
Die Zielmandanten-ID ist tag_company_id; Kunde und Artikel sind technische
Schlüssel des Zielmandanten. Die Nummernvergabe muss den bestehenden ERP-
Mechanismus verwenden, niemals MAX+1. Angebotsdatum wird aus tag_created_at
abgeleitet. Zahlungs-, Verpackungs- und Incoterm-IDs werden serverseitig geprüft;
Lieferadress-IDs sind technische kdL_ID-Werte, bei manuellen/Abholadressen NULL.
Positionsdaten umfassen Menge, Einheit, Preisbasis, VK, EP, Liefer-/Valutadatum
und WPZ-Anweisung. BMS-Muster-/Auftrag-/Abgelehnt-Flags bleiben bei Neuanlage aus.
Preisstaffeln dürfen nicht zusammengeführt werden. Die Übernahme erzeugt keinen
Verkauf und keine zweite Reservierung.

## Prüfungen

Backend-/Frontend-Tests prüfen Preisberechnung, Kontakt-Rangfolge, Kundenwechsel,
Kopieren, Eigentümer-/Mandantentrennung, Versions- und Reservierungskonflikte.
OFFER_SQL_SMOKE=1 node scripts/smoke-temp-offers.js im Backend prüft echte
SQL-Abfragen und den Speichervorgang inklusive ML1803-Suche in einer am Ende
zurückgerollten Transaktion. Identity-Zähler können dabei weiterlaufen.
Der Windows-Strukturtest führt auch das Kürzungsskript nur im Rollback aus.
Beide Prüfungen starten keine Hintergrundworker. Lokale Tests belegen kein
Deployment und keine tatsächliche Übernahme durch den externen Importer.
