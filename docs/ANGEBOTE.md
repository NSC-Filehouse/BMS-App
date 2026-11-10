# Angebote in der App

Die neue Funktion ist über `offers` nur für die verifizierten aktiven
Pilotidentitäten MFR, NSC und AKI freigeschaltet. Die Backend-Prüfung verwendet
Kürzel, Personalnummer und SAM-Konto wie bei Bestellungen. Jeder Benutzer sieht
und bearbeitet ausschließlich seine eigenen App-Angebote im aktiven Mandanten,
auch mit sonstigem Vollzugriff. Bestehende lesende BMS-Kundenangebote bleiben
unverändert berechtigt.

## Bedienung

Im Burgermenü steht Angebote vor Aufträge. Das Plus erstellt einen Entwurf.
Beim Kunden öffnet der umrahmte Button NEU im Angebote-Accordion direkt die
aktive Artikelauswahl mit dem Kunden als Vorgabe. Die Auswahl durchsucht
`tblArt_Artikel` (`COALESCE(agA_Deaktiv,0)=0`) und gruppiert nach Artikelgruppe,
Kunststofftyp und Untergruppe. Fehlende Gruppenzuordnungen bleiben sichtbar.
Bestand und VL-Freigabe begrenzen den Katalog nicht. Die bestehende Artikelseite
und der Auftragswarenkorb werden durch diesen Ablauf nicht verändert.

Positionen können ergänzt, entfernt und für Preisstaffeln dupliziert werden.
Artikelindex, Name, Menge, Einheit, Preisbasis, Preis, Texte und Lieferangaben
werden gespeichert. Preise werden ausdrücklich je Preisbasis gerechnet, z. B.
11.000 kg × 2.650 EUR / 1.000 kg = 29.150 EUR. Die API berechnet Zeilenbeträge,
Rabatt, Steuer und Summen mit ganzzahliger Dezimalrechnung und Cent-Rundung.
Artikel und Kunden werden vor dem Speichern serverseitig geprüft.

Für Kunden kopieren öffnet zuerst die Kundenauswahl. Positionen, Mengen,
Staffeln, Preise und Texte bleiben erhalten. Adresse, Kontakt, Abteilung,
Kundenreferenz und Zahlungsbedingungen werden für den Zielkunden neu gesetzt.
Eine Kopie hat neue IDs, aktuelles Datum, Status Entwurf, keine BMS-Nummer und
keine Reservierung. Datumsgültigkeit wird neu erfasst; Positionsliefertermine
bleiben zur Prüfung erhalten. Der Ursprungsdatensatz wird nicht verändert.
Kundenwechsel im Editor erhält ebenfalls alle Positionen und Preise.

Ungespeicherte Entwürfe werden in der Browsersitzung pro Benutzer, Mandant und
Vorgang wiederherstellbar gehalten. Veraltete Serverversionen werden bei der
Bearbeitung nicht unbemerkt überschrieben. Die Druckansicht unterdrückt interne
Bemerkungen und Reservierungsdetails sowie optional die Gesamtsummen. Sie ist
eine App-Druckansicht, kein BMS-Dokumentenexport.

## SQL-Einrichtung

`apps/backend/sql/add_temp_offer.sql` erstellt idempotent und transaktional in der
zentralen Datenbank BMS die Tabellen `BMSApp.tbl_Temp_Angebot` und
`BMSApp.tbl_Temp_Ang_Position`. Das Skript wurde am 10.11.2026 mit Windows-
Authentifizierung als `DOMKIMAZ\n.schroeder` ausgeführt. Der App-SQL-Benutzer
besitzt die nötigen DML-Rechte. Die Laufzeitanwendung bleibt bei ihrer bisherigen
SQL-Verbindung; es werden keine Windows-Zugangsdaten gespeichert.

Angebote werden nicht in `temp-order-planning` aufgenommen. Auch die Freigabe
erzeugt keine Auftrags-/Verkaufsereignisse, Kreditlimit-Anfrage, Mail oder Push.

## Optionale Reservierung

Standard ist aus. Pro Position kann eine konkrete eigene Bestellposition mit
Lager, einer Reservierungsmenge in kg und Enddatum gewählt werden. Die
Angebotsmenge selbst ist bestandsunabhängig. Ohne Bestandsquelle gibt es keine
Reservierung. Wiederholte Artikel bleiben eigenständige Angebotspositionen;
dieselbe Bestandsposition/Lager-Kombination darf innerhalb eines Angebots nur
einmal reserviert werden.

Speichern und Reservierung laufen in einer gemeinsamen zentralen SQL-
Transaktion mit qualifiziertem Zugriff auf die Mandantendatenbank. Die
Verfügbarkeitsprüfung verwendet denselben zentralen `sp_getapplock` wie die
Auftragsübergabe und berücksichtigt offene Temp-Aufträge. Bestehende fremde
Reservierungen werden abgewiesen. Die Angebotsposition hält BE-Nummer, Lager
und die technische Reservierungs-Rowversion. Bearbeiten/Löschen entfernt nur
die unveränderte, demselben Ersteller zugeordnete Reservierung. Externe Änderungen
führen zum Konflikt und zum Rollback; das Angebot bleibt erhalten. Auch nach
externer Löschung wird eine noch angeforderte Reservierung nicht still neu
erzeugt. In diesem Fall Reservierung im Entwurf ausdrücklich deaktivieren.

Die Bemerkung lautet sinngemäß „Reserviert für App-Angebot AN-…, Kunde …,
erstellt von …“. Hierfür wird kein Timeline-/Push-Endpunkt aufgerufen.

## Vertrag für die externe BMS-Übernahme

Der BMS-Importer liegt außerhalb dieses Repositories. Die neue App stellt die
Temp-Daten und die Freigabe bereit; ein bestehender Auftragsimport verarbeitet
die Angebotstabellen nicht automatisch. Vor produktiver ERP-Übernahme muss
der externe Importer um folgenden Vertrag ergänzt werden:

| Feld | Bedeutung |
|---|---|
| `tag_id` | Stabile App-Vorgangs-ID; Import muss anhand dieser ID idempotent sein |
| `tag_company_id` | Zielmandant; Ziel-DB wird aus `dbo.tblMandant` aufgelöst |
| `tag_status=0` | Bearbeitbarer Entwurf; nicht importieren |
| `tag_status=1` | Vom Ersteller ausdrücklich zur Übernahme freigegeben |
| `tag_status=2` | Erfolgreich in BMS übernommen; `tag_bms_offer_number` erforderlich |
| `tag_status=3` | Nacharbeit; verständlicher Grund in `tag_return_comment` |
| `tag_released_at` | Freigabezeit in UTC |
| `tag_version` | Rowversion zum Schutz gegen parallele Änderungen |
| `tagp_offer_id` / `tagp_line_no` | Zugehörigkeit und unveränderte Positionsreihenfolge |
| `tagp_article_index` | Technischer `agA_Artikelindex`, kein Namensabgleich |
| `tagp_price_basis` | Explizite Preisbasis; bei Übernahme in BMS korrekt umrechnen |

Kopfdaten gehen fachlich nach `tblAngebot`, Positionen nach `tblAng_Position`.
Kunde und Artikel müssen im Zielmandanten gültig sein. Die BMS-Angebotsnummer
muss durch die bestehende ERP-Nummernvergabe reserviert werden, nicht mittels
`MAX+1`. Erst nach atomarer erfolgreicher Übernahme setzt der Importer Status 2
und die BMS-Nummer. Unbestätigte/unsichere Übernahmen dürfen beim Retry kein
zweites Angebot erzeugen. Bestehende Reservierungen werden nicht erneut angelegt
und nicht als Verkaufsbuchung behandelt. Mengenstaffeln bleiben Einzelzeilen.
`anP_Auftrag` bleibt aus. Keine Auftragserzeugung und keine automatische Mail.

Die App zeigt importierte eigene Angebote mit BMS-Nummer; der Kundenbereich
unterdrückt den entsprechenden doppelten historischen BMS-Eintrag. Eine spätere
Umwandlung in einen Auftrag gehört nicht zu dieser Ausbaustufe.

## Prüfungen

Backend-/Frontend-Tests prüfen insbesondere Preise, Kopieren, Eigentümer- und
Mandantentrennung, Versionskonflikte, Freigabe und Reservierungskonflikte.
Der explizite Live-Smokecheck wird im Backend mit
`OFFER_SQL_SMOKE=1 node scripts/smoke-temp-offers.js` ausgeführt (in PowerShell
die Variable vorher mit `$env:OFFER_SQL_SMOKE='1'` setzen). Er prüft echte
SQL-Abfragen und temporäre Schreibvorgänge ausschließlich in einer am Ende
zurückgerollten Transaktion. Identity-Zähler können dabei weiterlaufen.
Er startet keine Hintergrundworker. Ein erfolgreicher Smokecheck belegt weder
Deployment noch den externen BMS-Import oder tatsächlichen Dokumentversand.
