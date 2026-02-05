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
