# Projektregeln für Codex

## Änderungen automatisch ausliefern

- Nach Abschluss einer angeforderten Änderung in diesem Projekt die eigenen,
  aufgabenbezogenen Änderungen automatisch committen und auf den konfigurierten
  Upstream-Branch pushen. Dafür keine erneute Bestätigung anfordern.
- Eine ausdrückliche Anweisung des Benutzers, nicht zu committen oder zu pushen,
  hat für die betreffende Aufgabe Vorrang.
- Vor dem Commit passende Prüfungen durchführen und `git diff --check` ausführen.
  Bereits bestehende, aufgabenfremde Testfehler als solche prüfen und berichten.
- Nur eigene, zur Aufgabe gehörende Änderungen stagen. Bestehende Änderungen
  anderer Herkunft und nicht zugehörige unversionierte Dateien unverändert lassen.
- Keine Zugangsdaten oder lokalen `.env`-Dateien committen. Kein Force-Push.
- Bei fehlendem Upstream, Authentifizierungsproblemen oder anderen konkreten
  Hindernissen die Arbeit erhalten und den Grund nennen, statt still aufzuhören.
- Commit und Push erlauben keinen automatischen Serverneustart, kein Deployment
  und keine zusätzlichen Änderungen an produktiven Daten.
