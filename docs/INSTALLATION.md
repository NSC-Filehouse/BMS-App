# Installation und Datenbankschema

## Ein SQL-Skript für die App-Tabellen

Die vollständige aktuelle Tabellenstruktur steht ausschließlich in
[`apps/backend/sql/install_BMSApp.sql`](../apps/backend/sql/install_BMSApp.sql).
Das Skript legt 45 Tabellen mit Schlüsseln, Standardwerten, Prüfbedingungen,
Indizes und Fremdschlüsseln an. Enthalten sind Angebote, Aufträge, Bestellungen,
Anhänge, Kunden-/Kontakt-/Adressvorgänge, Mail-/Push-Zustände und alle Options-
und OptionReader-Tabellen. Auch die zuvor fehlenden CREATE-Definitionen für
`tbl_Temp_Auftrag` und `tbl_Temp_Auf_Position` sind enthalten.
Die vollständige Liste mit Name, Zweck und noch fehlenden Tabellen steht in
[DATENBANKTABELLEN.md](DATENBANKTABELLEN.md).

Die Baseline vom 17.11.2026 wurde gegen die aktuelle BMSApp-Struktur mit
Windows-Anmeldung geprüft: 41 vorhandene Tabellen, 718 Spalten, 108 Indizes und
21 Fremdschlüssel. `ContactCreationOperation`, `OptionOfferMailOutbox` und
`tbl_Temp_Aktivitaet` ergänzen das Installationsschema.
Test-Replay-Tabellen, Demo-Angebote und standortspezifische Lieferantenkonten,
Regeln, Zugangsdaten oder Geschäftsdaten gehören nicht zur Installation.

## Voraussetzungen

- SQL Server 2016 oder neuer; Datenbank-Kompatibilitätsstufe mindestens 130.
- Eine vorhandene zentrale BMS-Datenbank und die zur Umgebung gehörenden
  ERP-/Mandantendatenbanken. Das Skript erstellt nur das App-Schema `BMSApp`;
  ERP-Stammdaten, Mandanten, Benutzer und externe Schnittstellen sind separat
  bereitzustellen. Eine leere Testdatenbank reicht für die reine Schema-Prüfung.
- DDL-Rechte für das Installationskonto. Die Hilfsskripte verwenden den
  angemeldeten Windows-Benutzer. Der laufende App-Login benötigt nur die
  jeweiligen Lese-/Schreibrechte, keine automatischen Schema-Migrationen.
- Die von den Abhängigkeiten unterstützte Node.js-Version; für den aktuellen
  PDF-Viewer mindestens Node 22.13 innerhalb der Node-22-Reihe oder eine von
  `pdfjs-dist` unterstützte neuere Hauptversion.

## Datenbank einrichten

In SSMS die zentrale Zieldatenbank auswählen und `install_BMSApp.sql` vollständig
ausführen. Das Skript wechselt die Datenbank nicht und verweigert Systemdatenbanken.
Es benötigt keine vorherigen SQL-Dateien und keine SQLCMD-Includes.

Alternativ aus dem Repository mit Windows-Anmeldung:

```powershell
powershell.exe -NoProfile -File apps/backend/scripts/install-schema.ps1 -Server '<SQL-SERVER>' -Database BMS
```

Bereits vorhandene Tabellen und Daten bleiben erhalten. Fehlende Tabellen,
Indizes und Fremdschlüssel werden angelegt. Abweichende erforderliche Spalten
führen zum Abbruch mit vollständigem Rollback. Das Skript ist eine aktuelle
Installationsbaseline, kein automatischer Datenkonverter für beliebige alte
App-Versionen. Frühere Migrationen liegen weiterhin in der Git-Historie.

Eine Schema-Neuanlage stellt keine Daten wieder her. Für eine Wiederherstellung
werden zusätzlich Datenbankbackups bzw. ein kontrollierter Datenimport benötigt.
Lieferantenkonten, Regeln und Mail-/Push-Einstellungen sind umgebungsbezogen
einzurichten; Produktionswerte werden nicht aus einer anderen Installation kopiert.

## Anwendung bereitstellen

1. Abhängigkeiten im Repository-Hauptverzeichnis mit `npm ci` installieren.
2. Die `.env.example`-Vorlagen der Apps als lokale `.env`-Dateien übernehmen
   und SQL, SSO/FX, MailService und weitere tatsächlich genutzte Dienste setzen.
   Die Funktionsparameter stehen im [README](../README.md).
3. Das Schema wie oben installieren und Rechte des App-Logins prüfen.
4. Frontend mit `npm run build` bauen; anschließend die Prozesse über den
   vorgesehenen Betriebsablauf starten (`npm start` bzw. `startapp.bat`).
5. Beim getrennten OptionReader dieselbe zentrale Datenbank verwenden und
   dessen EWS-/KI-/Mandantenkonfiguration separat einrichten. Seine Tabellen
   sind bereits in diesem Installationsskript enthalten.

Der [automatische Pull](AUTO-PULL.md) führt weder SQL noch npm-Installation oder
Frontend-Build aus. Nodemon allein aktualisiert keinen produktiven Frontend-Build.

## Installationsskript prüfen

```powershell
powershell.exe -NoProfile -File apps/backend/scripts/test-install-schema.ps1 -Server '<SQL-TESTSERVER>'
```

Der Test erzeugt eine eindeutig benannte eigene Datenbank
`BMSApp_InstallTest_<Zufallskennung>`. Er prüft Neuinstallation, Fremdschlüssel,
Wiederholung ohne Datenverlust sowie Abbruch/Rollback bei inkompatiblen Spalten.
Die Testdatenbank wird danach entfernt. Eine bestehende Produktivdatenbank ist
kein möglicher Zielparameter dieses Tests. Das Konto benötigt hierfür
Datenbank-Anlage- und Löschrechte auf dem angegebenen Testserver.

## Schema-Baseline pflegen

Für einen bewussten Schema-Abgleich lässt sich ausschließlich die Struktur
einer Referenzinstallation auslesen und daraus die SQL-Datei reproduzieren:

```powershell
powershell.exe -NoProfile -File apps/backend/scripts/export-app-schema.ps1 -Server '<SQL-SERVER>' -Database BMS -Output tmp/bmsapp-schema.json
node apps/backend/scripts/generate-schema-installer.cjs --input tmp/bmsapp-schema.json
```

Der Export enthält keine Tabellenzeilen oder Zugangsdaten. Nicht unterstützte
Strukturmerkmale führen im Generator zum Abbruch. Änderungen am Schema immer
zusammen mit Code, Baseline und Installationstests prüfen und versionieren.

## Repository und lokale Artefakte

`outputs/`, `tmp/`, Backups, Builds, Logs, lokale UI-Skizzen und `.env`-Dateien
werden nicht versioniert. Fachliche automatisierte Tests bleiben in den
`test/`-Ordnern; historische Demo-Seeds und einmalige Migrationstests entfallen.
Handbuch und Funktionsübersicht werden als Markdown gepflegt. Bei Bedarf erzeugt
`node scripts/generate-documentation-pdfs.mjs` lokale PDFs unter `outputs/docs/`.
