# BMS-App (Monorepo Scaffold)

## Kunden über die BMS-Kunden-API anlegen

Das blaue Plus neben der Seitennavigation öffnet die Kundenanlage. Es erscheint
im persönlichen Hauptmandanten des angemeldeten Mitarbeiters. Umfassender
Mandantenzugriff ersetzt diese Regel nicht. Die Entwickler AKI, MFR und NSC dürfen
das Plus in allen für sie zugänglichen Mandanten einschließlich `TES` verwenden.
Die Kunden-API kann weiterhin nicht nach `TES` kopieren; dort lässt sich die
Maske öffnen, aber die Schnittstelle unterstützt keine Anlage mit TES als Ziel.
Die API legt zentral in `PLA` an und kopiert bei Bedarf in den aktiven Mandanten.
Außendienst und Ersteller werden serverseitig aus der SSO-Identität gesetzt;
Innendienst wird mit demselben Kürzel vorbelegt und kann ausgewählt werden.

Die Maske enthält die beschreibbaren Kundenfelder einschließlich separater
Rechnungsanschrift, weiterer USt-IDs, Bankdaten, Ansprechpartner und Lieferanschriften.
Rechnungs-E-Mail und Hauptanschrift sind Pflicht. Eine USt-ID ist für EU-Firmen
Pflicht; Privatpersonen und Firmen außerhalb der EU dürfen sie weglassen.
Die EU-Zuordnung kommt aus der ERP-Länderliste. Diese Ausnahmen werden auch bei
der späteren Auftragsprüfung berücksichtigt. Die Privatpersonen-Einstufung wird
in der App-Historie aufbewahrt, da die ERP-API den Ausnahmegrund nicht speichert.
Die Ausnahme gilt nur für den mit Mandant, Nummer, Name und Land zugeordneten,
über die App angelegten Kunden, nicht für einen vorhandenen Kopie-Datensatz.

Die idempotente Migration `apps/backend/sql/add_customer_creation.sql` ist auf
`DB04 / BMS` begrenzt und legt ausschließlich drei Tabellen im bestehenden
Schema `BMSApp` an: `CustomerCreation`, `CustomerCreationMandant` und
`CustomerCreationSnapshot`. Sie speichern Vorgang, Benutzer, Mandantenresultate
und vollständige JSON-Snapshots einschließlich Ansprechpartner und Anschriften.
Die Migration wurde am 06.10.2026 mit dem angemeldeten Windows-Benutzer ausgeführt.
Der App-SQL-Login wurde danach mit zurückgerollten Schreibversuchen auf diesen
Tabellen geprüft. Es wurden keine ERP-Kunden angelegt.

Der kommentierte Konfigurationsblock steht in den lokal ignorierten Dateien
`apps/backend/.env` und `apps/backend/.env.prod`. `.env.prod` ist die gepflegte
Serverkonfiguration und wird auf dem Server als `.env` übernommen:

```dotenv
BMS_CUSTOMER_API_ENABLED=true
BMS_CUSTOMER_API_WRITE_ENABLED=false
BMS_CUSTOMER_API_BASE_ADDRESS=https://db03.domkimaz.de.local:3301/api/v1/kunden
BMS_CUSTOMER_API_KEY=<nur im Backend hinterlegen>
BMS_CUSTOMER_API_KEY_HEADER_NAME=X-Api-Key
BMS_CUSTOMER_API_CA_FILE=
BMS_CUSTOMER_API_TIMEOUT_MS=30000
BMS_CUSTOMER_API_STAMM_MANDANT=PLA
```

Node.js ab 22.19 nutzt für diesen HTTPS-Client zusätzlich den Windows-Zertifikatsspeicher.
Bei älteren Versionen oder fehlender Unternehmens-CA kann `BMS_CUSTOMER_API_CA_FILE`
eine PEM-Datei mit den vertrauenswürdigen CA-Zertifikaten angeben. Die
Zertifikatsprüfung bleibt aktiv. Der API-Schlüssel wird nicht an den Browser gegeben.

Mit gesperrten Schreibzugriffen funktionieren Formular, Stammdatenlisten,
Historie und die schreibfreie Vorprüfung über `/pruefung`. `An BMS senden`
bleibt deaktiviert; auch der Backend-Endpunkt weist echte Anlagen vor dem
Historieneintrag und dem API-Aufruf ab. Erst für einen mit dem ERP-Entwickler
abgestimmten Test darf `BMS_CUSTOMER_API_WRITE_ENABLED=true` gesetzt und das
Backend neu gestartet werden. Der Test braucht einen Benutzer mit passendem
persönlichen Hauptmandanten; `TES` ist kein Anlageziel.

Jeder Sendevorgang hat einen festen UUID-Schlüssel. Bei unklarem Ergebnis
bleiben Eingaben und Schlüssel erhalten, auch nach einem Reload desselben
Browser-Tabs. Nur derselbe Vorgang darf wiederholt werden. Bei einer
fehlgeschlagenen Kopie bleibt die zentrale Anlage erfolgreich dokumentiert;
eine neue zentrale Anlage darf daraus nicht ausgelöst werden. Bei verlorener
Browser-Sitzung zuerst die Anlagehistorie bzw. den ERP-Vorgang prüfen. Dubletten
und Warnungen werden vor der Anlage angezeigt; übersteuerbare Dubletten
benötigen eine einzelne Bestätigung mit Begründung.

Für die Auslieferung Frontend bauen, Code und `.env.prod` auf DB03 übernehmen
und die App-Dienste neu starten. Diese Bereitstellung und der abgestimmte echte
Anlagetest sind noch offen.

Dieses ZIP enthält ein Grundgerüst für die **BMS-App** als Monorepo (npm workspaces) mit:

- **Backend**: Node.js + Express, Access (ODBC) über UNC-Pfade, Mandant per `x-mandant` Header
- **Frontend**: React + Vite + Material UI (MUI), mobile-first, Burger-Menü, Liste + Detail
- **Frontend-Server (Prod)**: Express Static Server auf eigenem Port, inkl. Proxy auf das Backend (kein CORS nötig)
- **PM2 ready**: `ecosystem.config.cjs`

## Ziel-URLs (Standard)
- Frontend: `http://<server>:3090/bms-app`
- API (über Proxy, empfohlen): `http://<server>:3090/bms-app/api/...`
- API (direkt): `http://<server>:3091/api/...`

---

## Voraussetzungen
- Windows Server
- Node.js (LTS empfohlen)
- **Microsoft Access ODBC Driver** (64-bit) muss vorhanden sein
- Zugriff auf die UNC-Pfade der Access-Dateien (PM2/Service-User muss Rechte haben)

---

## Setup (Development)
1. Entpacken
2. Im Projekt-Root:
   ```bash
   npm install
   ```
3. Env-Dateien anlegen:
   - `apps/backend/.env` aus `apps/backend/.env.example` erstellen
   - `apps/frontend/.env` aus `apps/frontend/.env.example` erstellen
4. Datenbank-Konfig:
   - `apps/backend/config/databases.json` aus `apps/backend/config/databases.example.json` erstellen
   - Pfade/Passwörter anpassen (nicht ins Git committen)

5. Start (dev):
   ```bash
   npm run dev
   ```

---

## Setup (Production / ohne PM2)
1. Frontend build:
   ```bash
   npm run build
   ```
2. Start:
   ```bash
   npm run start
   ```

---

## PM2
1. Frontend bauen:
   ```bash
   npm run build
   ```
2. Start mit PM2:
   ```bash
   pm2 start ecosystem.config.cjs
   ```

---

## Mandant-Handling
- Der Hauptmandant des angemeldeten Benutzers wird beim Start automatisch ermittelt und in `localStorage` gespeichert.
- Bei AKI wird `Frupack` als Hauptmandant verwendet.
- Die Mandantenauswahl wird nur über „Mandant wechseln“ geöffnet.
- Für API Requests wird der Header gesetzt:
  - `x-mandant: MLHolding` (Beispiel)
- Mandanten-Liste kommt aus:
  - `GET /api/mandants` (Proxy: `/bms-app/api/mandants`)

---

## Hinweise zur Access-Paging-Implementierung
Die Listen-Endpunkte unterstützen `page`, `pageSize`, `q`, `sort`, `dir`.  
Paging wird über das klassische **Access TOP-Nested-Query** Muster implementiert.

---

## Projektstruktur
- `apps/backend` – API Server (Port 3091)
- `apps/frontend` – React App + Prod Static Server (Port 3090)

Viel Spaß beim Weiterbauen.

## Aufträge finalisieren und per MailService senden (EWS-Fallback)

Vor dem ersten Einsatz muss die idempotente Migration
`apps/backend/sql/add_temp_order_finalization_and_mail_outbox.sql` mit einem
DDL-berechtigten SQL-Login auf der zentralen `BMS`-Datenbank ausgeführt werden.

Für die Übergabe der ausgewählten Lieferadress-ID an die ERP-Seite muss außerdem
die idempotente Migration
`apps/backend/sql/add_temp_order_delivery_address_id.sql` auf der zentralen
`BMS`-Datenbank ausgeführt werden. Bei einer manuellen Lieferadresse bleibt
`ta_delivery_address_id` leer; bei einer Auswahl aus `tblKun_LiefAdress` wird
der technische Primärschlüssel `kdL_ID` des Lieferadress-Datensatzes gespeichert.

Das Backend benötigt folgende Werte in `apps/backend/.env`:

```dotenv
BMS_ORDER_MAIL_ENABLED=true
BMS_ORDER_MAIL_TEST_RECIPIENT=n.schroeder@filehouse.net
BMS_ORDER_MAIL_RETRY_INTERVAL_SECONDS=60
BMS_ORDER_MAIL_MAX_ATTEMPTS=10
BMS_MANDANT_MAIL_DISTRIBUTORS=frupack-europe@frupack.de|3
EWS_USERNAME=
EWS_PASSWORD=
EWS_EXCHANGE_VERSION=7
EWS_URL_EXTERN=
INVOICE_ROUTER_ADDRESS_MAP=
EWS_SHARED_MAILBOXES=
BMS_CREDIT_LIMIT_MAIL_ENABLED=true
BMS_CREDIT_LIMIT_MAIL_COOLDOWN_MONTHS=6
BMS_CREDIT_LIMIT_MAIL_RETRY_INTERVAL_SECONDS=60
BMS_CREDIT_LIMIT_MAIL_MAX_ATTEMPTS=10
```

`BMS_MANDANT_MAIL_DISTRIBUTORS` ordnet Verkaufsmails nach BMS-Status 2 einem
Mandanten-Mailverteiler zu. Das Format ist eine kommaseparierte Liste aus
`E-Mail-Adresse|Mandanten-ID`. Für Mandanten ohne Eintrag bleibt der bisherige
Versand an die aktiven AD-Empfänger bestehen. Der Testmandant mit ID `0` bleibt
von dieser Zuordnung ausgenommen.

## Werktäglicher Versand der Verfügbarkeitslisten

Der Backend-Worker erstellt montags bis freitags ab 07:00 Uhr (Zeitzone
`Europe/Berlin`) eine aktuelle klassische VL-Mail pro sichtbarem Verkaufsmandant
für NSC. Mandant `0` (Test) und die ausgeschlossenen Mandanten werden ausgelassen;
MLCompound (Mandant-ID `16`) ist für diesen Tagesversand ausdrücklich einbezogen,
auch wenn die allgemeine Mandantenfilterung die ID ausschließt. Die Outlook-Gruppe hat
`verfuegbarkeitsliste@mlplastics.de` als primäre SMTP-Adresse; ihre weiteren
SMTP-Aliasse zeigen auf dieselbe Gruppe. Für Westpoly (Mandant-ID `9`) wird
stattdessen an `kimaz@mlplastics.de`, `m.winkler@mlholding.org`,
`altendorf@westpoly.de` und `goede@mlholding.org` gesendet.

Vor dem Start muss die idempotente Migration
`apps/backend/sql/add_daily_vl_mail.sql` auf der zentralen `BMS`-Datenbank
ausgeführt werden. Der tägliche Versand kann über folgende Backend-Variablen
gesteuert bzw. angepasst werden:

```dotenv
BMS_DAILY_VL_MAIL_ENABLED=true
BMS_DAILY_VL_MAIL_RECIPIENT=verfuegbarkeitsliste@mlplastics.de
BMS_DAILY_VL_MAIL_EXCLUDED_MANDANT_IDS=1,6,8,13,14,15,17,18
BMS_DAILY_VL_MAIL_WESTPOLY_COMPANY_ID=9
BMS_DAILY_VL_MAIL_WESTPOLY_RECIPIENTS=kimaz@mlplastics.de,m.winkler@mlholding.org,altendorf@westpoly.de,goede@mlholding.org
```

`BMS_DAILY_VL_MAIL_ENABLED` muss in der Produktionskonfiguration auf `true`
stehen. In Entwicklungs- und Testumgebungen bleibt der Standard `false`, damit
der dort gestartete Backend-Prozess nicht an den echten Verteiler sendet. Ein
eindeutiger Datenbankeintrag pro Datum und Mandant verhindert Doppelversand;
nicht zugestellte Mails werden mit begrenzten Wiederholungen erneut versucht.
Enthält die aktuelle VL keine Einträge, wird der Mandant für diesen Tag als
übersprungen markiert und erhält keine Mail.

## Filehouse MailService für den Mailversand

Der Backend-Mailversand verwendet den zentralen Filehouse MailService bevorzugt.
Der wiederverwendbare Node.js-Client liegt unter
`packages/filehouse-mailservice-client`; spätere Node.js-Anwendungen können dieses
Workspace-Paket ebenfalls verwenden. Der Service nimmt die Mail zunächst dauerhaft
an und versendet sie anschließend selbstständig weiter.

Für die BMS-App werden zusätzlich zu den bestehenden EWS-Werten folgende Variablen
benötigt:

```dotenv
FILEHOUSE_MAIL_SERVICE_ENABLED=true
FILEHOUSE_MAIL_SERVICE_BASE_ADDRESS=https://db03.domkimaz.de.local:3300/
FILEHOUSE_MAIL_SERVICE_API_KEY=
FILEHOUSE_MAIL_SERVICE_API_KEY_HEADER_NAME=X-Api-Key
FILEHOUSE_MAIL_SERVICE_TIMEOUT_MS=100000
BMS_ORDER_MAIL_EWS_FALLBACK=true
```

Der API-Key darf nicht in die Versionsverwaltung. Eine erfolgreiche MailService-
Antwort bedeutet, dass die Mail dauerhaft angenommen wurde. Bei Netzwerk- oder
Timeout-Fehlern sowie HTTP 408, 429 und 5xx verwendet die BMS-App bei aktiviertem
Fallback den bisherigen EWS-Versand; fachliche HTTP-4xx-Fehler werden nicht
blind über EWS wiederholt.

Beim Deployment muss der gesamte Monorepo-Inhalt einschließlich
`packages/filehouse-mailservice-client`, der Root-`package.json` und
`package-lock.json` übernommen werden. Nicht nur `apps/backend` kopieren. Nach
dem Kopieren im Projekt-Root einmal `npm install --include=dev` ausführen; damit
wird der Workspace-Client unter `node_modules/@filehouse/mailservice-client`
verfügbar und auch `vite` für `npm run dev` bzw. den Frontend-Build installiert.
Für eine fertige Produktion, deren Frontend bereits gebaut wurde und nur über
`npm start` läuft, kann stattdessen `npm install --omit=dev` verwendet werden.

Wenn `BMS_ORDER_MAIL_TEST_RECIPIENT` gesetzt ist, werden ausnahmslos alle
Auftragsmails an diese Adresse gesendet. Erst nach Abschluss der Tests darf der
Wert geleert werden; danach gilt Customer Service aus
`INVOICE_ROUTER_ADDRESS_MAP` mit `EWS_SHARED_MAILBOXES` als Buchhaltungs-Fallback.
Der Testmandant mit der ID `0` ist davon ausgenommen und sendet Auftragsmails
an `m.frank@filehouse.net`.

### Kreditlimit-Anfrage bei Limit 0

Vor dem ersten Einsatz muss zusätzlich die idempotente Migration
`apps/backend/sql/add_credit_limit_request.sql` mit einem DDL-berechtigten
SQL-Login auf der zentralen `BMS`-Datenbank ausgeführt werden. Beim Klick auf
„An BMS senden“ wird bei einem exakt auf `0` gesetzten Kreditlimit eine eigene
Kreditlimit-Mail über dieselbe BMS-App-Mailstrecke erzeugt. Die Mail geht an
Kimaz und Petschler, mit Meyer, dem mandantabhängigen Customer Service aus
`INVOICE_ROUTER_ADDRESS_MAP` sowie den aus SanctionChecker übernommenen
mandantabhängigen GF-Empfängern in CC. Die Zuordnung erfolgt über die
Mandanten-ID hinter dem Pipe-Zeichen (`E-Mail-Adresse|Mandanten-ID`). Ein
gesetzter `BMS_ORDER_MAIL_TEST_RECIPIENT` bleibt ein isolierter Testversand an
nur diese Adresse; echte CC-Empfänger werden dann nicht angeschrieben.

Die Merktabelle führt je Mandant und Kunde den letzten Anfragezeitpunkt und
die letzte beantragte Summe. Dadurch wird eine erneute Anfrage innerhalb des
konfigurierten Zeitfensters (standardmäßig sechs Monate) unterdrückt; mehrere
Aufträge werden nach Ablauf des Fensters mit der dann aktuellen Auftragssumme
neu bewertet. Der Betrag wird in 50-, 500-, 5.000- oder 50.000-EUR-Schritten
aufgerundet. Fehlen Bankdaten, wird zusätzlich der Haupt-Außendienst des
Kunden einmal pro Cooldown-Zeitraum per Mail zur Stammdatenpflege aufgefordert.
Steht in `tblKunden.kd_Insolvenz` der Wert `1`, werden Kreditlimit- und
Bankdaten-Automatik unterdrückt. Die normale Auftragsmail wird weiterhin
gesendet und beginnt mit dem fett roten Hinweis „Kunde insolvent!“. Auch eine
bereits wartende Kreditlimit-Mail wird vor dem Versand nochmals geprüft.

## Erinnerung an eigene, noch nicht an BMS übertragene Aufträge

Die Prüfung läuft serverseitig und benötigt die idempotente Migration
`apps/backend/sql/add_unfinalized_order_reminder.sql` auf der zentralen
`BMS`-Datenbank. Der Reminder ist standardmäßig deaktiviert. Zum Aktivieren
wird im Backend mindestens das Intervall gesetzt:

```dotenv
BMS_UNFINALIZED_ORDER_REMINDER_INTERVAL_MINUTES=60
```

`BMS_UNFINALIZED_ORDER_REMINDER_USER_EMAIL` ist optional. Wenn die Variable
gesetzt ist, läuft der Reminder als Test-Override ausschließlich für diesen
Benutzer. Wenn sie leer oder nicht gesetzt ist, werden alle offenen eigenen
Aufträge nach ihrem `ta_CreatedBy`-Mitarbeiterkürzel gruppiert und die
zugehörigen E-Mail-Adressen aus der BMS-FX-Mitarbeiterquelle ermittelt.

Die Aktivierungslogik bleibt unverändert: Beide Reminder-Variablen leer oder ein
ungültiges Intervall deaktivieren den Prozess. Nur ein gültiges Intervall prüft
alle Benutzer mit eigenen offenen Aufträgen. Ist zusätzlich
`BMS_UNFINALIZED_ORDER_REMINDER_USER_EMAIL` gesetzt, wird ausschließlich dieser
Benutzer geprüft. Push wird weiterhin zuerst versucht; die E-Mail ist der bisherige
Fallback. Auch für diese E-Mail wird MailService bevorzugt und EWS bleibt als
Fallback erhalten.

Ein leeres, ungültiges oder nicht positives Intervall deaktiviert den gesamten
Prozess. Der konfigurierte Benutzer wird über die bestehende
Mitarbeiterquelle geprüft; gezählt werden seine eigenen Datensätze mit
`ta_completed = 0` über alle Mandanten. Der Worker meldet zunächst über aktive
Push-Abonnements dieses Benutzers. Wenn kein Push zugestellt werden kann, wird
die E-Mail über den MailService an die ermittelte Benutzeradresse gesendet;
bei einem Servicefehler bleibt EWS der Fallback.

## Rueckgabe eines Temp-Auftrags durch den CS

Fuer den Rueckgabegrund und den Push bei Status 3 muss die idempotente Migration
`apps/backend/sql/add_temp_order_return_comment_and_push_state.sql` auf der
zentralen `BMS`-Datenbank ausgefuehrt werden. Sie legt `ta_return_comment` in
`BMSApp.tbl_Temp_Auftrag` und den Zustandsbereich fuer die einmalige Push-Zustellung
an. Bereits vorhandene Status-3-Auftraege werden dabei als Initialbestand erkannt
und loesen keine rueckwirkende Meldung aus.

Das Backend prueft die Temp-Auftraege standardmaessig alle 60 Sekunden. Der Abstand
kann ueber `BMS_TEMP_ORDER_REWORK_PUSH_INTERVAL_SECONDS` geaendert werden. Wenn der
CS den Status auf `3` setzt, wird der Auftragsersteller anhand von `ta_CreatedBy`
ermittelt und erhaelt den Rueckgabegrund per Push. Ein Klick auf die Meldung oeffnet
den Auftrag direkt; der Rueckgabegrund steht zusaetzlich im Auftragsdetail. Nach dem
erneuten Senden an BMS wird der alte Rueckgabegrund geloescht.

## Mandantenauswahl

Beim normalen Aufruf der App wird der Hauptmandant des Benutzers gesetzt und direkt
die Kundenliste geöffnet. Eine Auswahl ist nur beim bewussten Mandantenwechsel
erforderlich.

Die im Frontend angezeigten Mandanten koennen ueber `VITE_MANDANT_EXCLUDE_IDS` als
kommagetrennte BMS-Mandanten-IDs ausgeblendet werden. Die Einstellung wirkt auf
die Auswahl im Frontend; die eigentliche Berechtigungspruefung des Backends bleibt
unveraendert.

Der offizielle Testmandant mit ID `0` bleibt fuer die meisten Benutzer ausgeblendet.
Benutzer mit den Kuerzeln `MFR` oder `NSC` sehen ihn wieder, sofern die bestehende
Mandantenberechtigung des Backends den Mandanten ebenfalls liefert.

Beispiel:

```dotenv
VITE_MANDANT_EXCLUDE_IDS=0,1,6,8,13,14,15,16,17,18
```

Nach einer Aenderung muss das Frontend neu gebaut werden. FrupackSweden (ID 19)
verwendet fuer Auftragsmails dieselbe Customer-Service-Adresse wie FrupackNordic:
`cs@frupack.dk`.
