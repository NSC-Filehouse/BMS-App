# BMS-App (Monorepo Scaffold)

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
- Der Mandant wird im Frontend beim Start ausgewählt und in `localStorage` gespeichert.
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

Das Backend benötigt folgende Werte in `apps/backend/.env`:

```dotenv
BMS_ORDER_MAIL_ENABLED=true
BMS_ORDER_MAIL_TEST_RECIPIENT=n.schroeder@filehouse.net
BMS_ORDER_MAIL_RETRY_INTERVAL_SECONDS=60
BMS_ORDER_MAIL_MAX_ATTEMPTS=10
EWS_USERNAME=
EWS_PASSWORD=
EWS_EXCHANGE_VERSION=7
EWS_URL_EXTERN=
INVOICE_ROUTER_ADDRESS_MAP=
EWS_SHARED_MAILBOXES=
```

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

## Mandantenauswahl

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
