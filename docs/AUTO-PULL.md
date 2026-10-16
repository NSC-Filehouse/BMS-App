# Automatischer Git-Pull auf dem Windows Server

Das Skript `scripts\auto-pull.ps1` aktualisiert standardmaessig
`C:\_Services\BMS-App` aus `origin/main`. Es setzt Windows PowerShell 5.1 oder
neuer sowie Git for Windows voraus. Bei einem anderen Branch, lokalen Aenderungen,
unversionierten Dateien, Git-Fehlern oder auseinander gelaufenen Branches bricht
es mit Exitcode `1` ab. Es verwendet `pull --ff-only --no-rebase --no-autostash`.
Es gibt kein automatisches Stash, Reset oder Verwerfen von Dateien.

Das Skript aktualisiert nur die Quelldateien. Es installiert keine npm-Pakete,
baut kein Frontend, fuehrt keine SQL-Migration aus und startet keine Dienste neu.
Neue Frontend-Aenderungen brauchen weiterhin einen Build; Backend-Aenderungen
brauchen den passenden Neustart. Bei Diensten mit automatischem Datei-Watching
kann bereits das Aendern der Dateien einen Neustart ausloesen. Vor Aktivierung
der Aufgabe deshalb die tatsaechliche Server-Startkonfiguration pruefen.

## Einmaliger Test auf dem Server

Zuerst die neue Skriptdatei auf den Server uebernehmen, z. B. durch den bisherigen
manuellen Pull. Die folgenden Befehle unter demselben Windows-Konto ausfuehren,
das spaeter die Aufgabe ausfuehrt:

```powershell
Set-Location 'C:\_Services\BMS-App'
git status --short
git branch --show-current
git remote get-url origin
git ls-remote --exit-code origin refs/heads/main

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File 'C:\_Services\BMS-App\scripts\auto-pull.ps1'
$LASTEXITCODE
```

Erwartet: Branch `main`, die gewuenschte Repository-URL bei `origin`, keine
lokalen Aenderungen und Exitcode `0`. Bei nicht installiertem Git oder fehlendem
PATH kann der vollstaendige Git-Pfad mitgegeben werden:

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File 'C:\_Services\BMS-App\scripts\auto-pull.ps1' -GitPath 'C:\Program Files\Git\cmd\git.exe'
```

Das Aufgaben-Konto braucht Schreibrechte im Checkout samt `.git` und `logs`
sowie Lesezugriff auf das Remote-Repository. Git-Zugang vorher fuer dieses Konto
einrichten. Zugangsdaten des eigenen Desktop-Kontos sind nicht automatisch fuer
andere Konten oder eine unbeaufsichtigte Anmeldung verfuegbar. Keine Passwoerter
oder Tokens in Skript oder Aufgabenargumenten hinterlegen. HTTPS-Abfragen nach
Zugangsdaten werden durch das Skript unterdrueckt.

## Ohne Aufgabenplanung: dauerhaftes PowerShell-Skript

Nach dem einmaligen Pull im Hauptverzeichnis einfach **start-auto-pull.bat**
doppelklicken, auf dem Server unter
`C:\_Services\BMS-App\start-auto-pull.bat`. Der Starter ruft nur
den Loop auf; dieser fuehrt sofort den ersten Pull aus und wartet danach jeweils
30 Minuten. Ein zusaetzlicher Pull vor jedem Start ist nicht erforderlich.
Nach einem Serverneustart die BAT-Datei erneut doppelklicken und das Fenster
geoeffnet lassen. Mit **Strg+C** beenden. Falls CMD anschliessend nach dem
Beenden des Stapelauftrags fragt, mit **J** bestaetigen.
Bei einem Startfehler bleibt die Meldung bis zu einem Tastendruck sichtbar.
Die BAT-Datei ist versioniert; Logs und Sperrdateien bleiben ignoriert.

Wenn PowerShell ausgefuehrt werden und dauerhaft laufen darf, ist keine
Aufgabenplanung erforderlich. Nach dem einmaligen Test starten:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\_Services\BMS-App\scripts\auto-pull-loop.ps1'
```

Dieses Fenster geoeffnet lassen. Das Skript ruft den vorhandenen Pull sofort
und danach jeweils 30 Minuten nach Abschluss des vorherigen Durchlaufs auf.
Auch nach einem fehlgeschlagenen Pull wartet es und versucht es erneut.
Ein zweiter Loop fuer denselben Checkout wird durch eine Dateisperre abgewiesen.
Zum Beenden **Strg+C** druecken. Das Schliessen des Fensters, eine Windows-Abmeldung
oder ein Serverneustart beendet den Lauf; danach muss er erneut gestartet werden.
Eine getrennte RDP-Verbindung kann die Sitzung weiterlaufen lassen, sofern die
Serverrichtlinie die Sitzung nicht abmeldet. Das ersetzt keinen Autostart.

Bei Bedarf laesst sich ein anderer Git-Pfad angeben:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\_Services\BMS-App\scripts\auto-pull-loop.ps1' -GitPath 'C:\Program Files\Git\cmd\git.exe'
```

Das Intervall kann mit `-IntervalSeconds 1800` eingestellt werden (1800 Sekunden
= 30 Minuten, Standard). Der Loop schreibt zusaetzlich Statusmeldungen unter
`logs\auto-pull\loop-YYYY-MM.log`. Die Sperrdatei `logs\auto-pull\loop.lock`
kann nach dem Beenden liegen bleiben; massgeblich ist die offene Dateisperre.
Vor einem manuellen Update oder einer anderen Bereitstellung den Loop beenden.
Die Pruefungen sowie die Grenzen hinsichtlich Build und Neustart gelten unveraendert.
Der Loop bleibt beim Start auf seiner geladenen Version; nach Aenderungen am
Loop selbst muss er neu gestartet werden. Das Pull-Skript wird bei jedem
Durchlauf neu geladen.

Nur Dateien anzulegen fuehrt noch keinen Code aus. Falls Skripte weder manuell
noch durch einen vorhandenen Dienst oder eine Verwaltungssoftware gestartet
werden koennen, braucht es zunaechst einen solchen Ausfuehrungsmechanismus.
Wenn lediglich die grafische Aufgabenplanung nicht erreichbar ist, kann eine
Aufgabe alternativ per `Register-ScheduledTask` eingerichtet werden, sofern das
Konto die benoetigten Rechte hat. Die Endlosschleife braucht diese Rechte nicht.

## Mit Aufgabenplanung: alle 30 Minuten

Auf dem Server in der Windows-Aufgabenplanung **Aufgabe erstellen** waehlen:

1. **Allgemein:** Name `BMS-App Auto-Pull`. Das oben getestete Windows-Konto
   auswaehlen und **Unabhaengig von der Benutzeranmeldung ausfuehren** aktivieren.
   Fuer Zugriff auf GitHub die Option **Kennwort nicht speichern. Die Aufgabe
   greift nur auf lokale Computerressourcen zu** deaktiviert lassen.
   Administratorrechte sind fuer den Pull bei passenden Dateirechten nicht noetig.
2. **Trigger:** Einmalig ab der gewuenschten Startzeit, **Aufgabe wiederholen alle:
   30 Minuten**, **fuer die Dauer von: Unbegrenzt**, aktiviert.
3. **Aktion:** Programm starten:

   - Programm: `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`
   - Argumente: `-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\_Services\BMS-App\scripts\auto-pull.ps1"`
   - Starten in: `C:\_Services\BMS-App`

   Falls Git im PATH dieses Kontos fehlt, an die Argumente
   `-GitPath "C:\Program Files\Git\cmd\git.exe"` anhaengen und den Pfad vorher pruefen.
4. **Einstellungen:** Bei bereits laufender Aufgabe **Keine neue Instanz starten**
   auswaehlen. Laufzeit auf **10 Minuten** begrenzen. **Aufgabe so schnell wie
   moeglich nach einem verpassten Start ausfuehren** aktivieren.
5. Speichern und das Kennwort des Aufgaben-Kontos im Windows-Dialog eingeben.
   Danach die Aufgabe einmal ueber **Ausfuehren** starten, auch bei abgemeldetem
   Benutzer pruefen und **Ergebnis der letzten Ausfuehrung** kontrollieren.

Erfolg ist `0x0`, ein vom Skript gemeldeter Fehler `0x1`. Fehler beim Start der
Aufgabe koennen andere Codes ergeben. Monatliche Protokolle stehen unter
`C:\_Services\BMS-App\logs\auto-pull\auto-pull-YYYY-MM.log` und werden nicht
automatisch geloescht. Protokollieren ist erst nach erfolgreicher Pruefung von
Repository, Git und Sperrdatei moeglich; bei frueheren Fehlern den manuellen
Aufruf und den Aufgabenverlauf pruefen. Eine Sperrdatei in `.git` verhindert
zusaetzliche gleichzeitige Laeufe dieses Skripts. Manuelle Updates oder andere
Deployments vorher mit der Aufgabe abstimmen und die Aufgabe dafuer deaktivieren.

Zum Anhalten die Aufgabe in der Aufgabenplanung **Deaktivieren**.

Quellen: [Git pull](https://git-scm.com/docs/git-pull),
[Windows-Aufgabenplanung](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks).
