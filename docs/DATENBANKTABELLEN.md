# App-Tabellen

Alle Tabellen liegen im Schema `BMSApp` und werden durch
[`install_BMSApp.sql`](../apps/backend/sql/install_BMSApp.sql) angelegt.

| Name | Zweck |
| --- | --- |
| `ContactCreationOperation` | Vorgangsstatus und Wiederholungssicherung der Kontaktanlage über die ERP-API. |
| `CreditLimitMailOutbox` | Versandaufträge für Kreditlimit-Anfragen und Bankdaten-Erinnerungen. |
| `CreditLimitRequestState` | Zustände und Wiederholungssperren für Kreditanfragen und Erinnerungen. |
| `CustomerCreation` | Vorgänge der Kundenanlage über die ERP-API. |
| `CustomerCreationMandant` | Ergebnisse einer Kundenanlage je Mandant. |
| `CustomerCreationRollback` | Sichere Rücknahme von Kundenanlagen. |
| `CustomerCreationSnapshot` | Gespeicherte Anfragen und Antworten der Kundenanlage. |
| `DailyVlMailOutbox` | Versandaufträge für die tägliche Verfügbarkeitsliste. |
| `DeliveryAddressOperation` | Vorgangsstatus und Wiederholungssicherung der Lieferadressanlage. |
| `OrderMailOutbox` | Versandaufträge und Wiederholungen für Auftragsmails. |
| `OptionOfferDocument` | Angebotsdaten und BMS-Originalausgabe für den persönlichen Versand. |
| `OptionOfferMailOutbox` | Versandstatus je Mandant, Optionsposition und Kunde für persönliche Optionsangebote. |
| `OrderReminderState` | Erinnerungszustände für noch nicht übergebene App-Aufträge. |
| `PurchaseOrderCsMailOutbox` | Bestellmails an den Customer Service. |
| `PurchaseOrderMailOutbox` | Bestellmails an Lieferanten. |
| `PushMandantSetting` | Push-Einstellungen je Benutzer und Mandant. |
| `PushSubscription` | Browser-Anmeldungen für Push-Benachrichtigungen. |
| `tbl_Temp_Ang_Position` | Positionen der in der App erstellten Angebote. |
| `tbl_Temp_Aktivitaet` | Vorbereitete Kundenaktivitäten zur Übergabe an den BMS-Import. |
| `tbl_Temp_Angebot` | Kopfdaten der in der App erstellten Angebote. |
| `tbl_Temp_Auf_Position` | Positionen der in der App erstellten Verkaufsaufträge. |
| `tbl_Temp_Auftrag` | Kopfdaten und Übergabestatus der Verkaufsaufträge. |
| `tbl_Temp_Auftrag_Anhang` | Dateianhänge der Verkaufsaufträge. |
| `tbl_Temp_Best_Position` | Positionen der Einkaufsbestellungen. |
| `tbl_Temp_Bestellung` | Kopfdaten und Übergabestatus der Einkaufsbestellungen. |
| `tbl_Temp_Bestellung_Anhang` | Dateianhänge der Einkaufsbestellungen. |
| `tblOptionen` | Lieferantenangebote mit Originalbelegen und Kontaktvorschlägen. |
| `tblOptionenAbgleich` | Versionierte Ergebnisse des Artikelabgleichs. |
| `tblOptionenAbgleichAuftrag` | Warteschlange und Sperren für den Artikelabgleich. |
| `tblOptionenArtikelKandidaten` | Mögliche BMS-Artikel je Abgleichsergebnis. |
| `tblOptionenArtikelMapping` | Bestätigte und gelernte Artikelzuordnungsregeln. |
| `tblOptionenLieferantenKonto` | Zuordnung der Anbieter zu BMS-Lieferantenkonten. |
| `tblOptionenLieferantenRegel` | Lieferantenspezifische Aufbereitungsregeln. |
| `tblOptionenMailEreignis` | Protokoll der einzelnen Mailverarbeitungsschritte. |
| `tblOptionenMailVerarbeitung` | Importaufträge, Mailkennungen, Wiederholungen und KI-Zwischenstände. |
| `tblOptionenPositionen` | Einzelne Materialpositionen der Lieferantenangebote. |
| `tblOptionenReaderLaufzeit` | Laufzeit-, Versions- und Heartbeat-Daten von Reader und Matcher. |
| `tblOptionenReaderSteuerung` | Kontrollierte Pausen der Mailverarbeitung. |
| `TempOrderReworkPushState` | Zustellungssicherung für Push-Meldungen zu CS-Rückgaben. |
| `Timeline` | Aktivitätsverlauf in der App. |
| `VlMailOrderState` | Zuletzt verarbeiteter Auftragszustand für Verkaufs-/VL-Mails. |
| `VlMailOutbox` | Versandaufträge für Verkaufs-/VL-Mails. |
| `VlMailUserSetting` | Persönliche Einstellungen für Verkaufs-/VL-Mails. |
| `VlMailWorkerState` | Arbeits- und Initialisierungszustand des VL-Mail-Workers. |
| `VlSalePushState` | Zustellungssicherung für Push-Meldungen zu Verkäufen. |

## Stand der geprüften Installation

Auf `DB04 / BMS` waren am **20.11.2026** alle 44 App-Tabellen vorhanden.
`OptionOfferMailOutbox` und `tbl_Temp_Aktivitaet` wurden mit Windows-Anmeldung
angelegt und anhand des Installationsskripts geprüft. Beide Tabellen waren
nach der Installation leer.

`OptionOfferDocument` ist im aktuellen Installationsskript enthalten. Der
Stand vom 20.11.2026 umfasst diese spätere Ergänzung noch nicht.

`ContactCreationOperation` wurde bereits am **17.11.2026** angelegt und mit
dem Installationsskript abgeglichen.
Die erfolgreiche Neuinstallation und Wiederholung des vollständigen Schemas
wurden in eigenen, danach entfernten Testdatenbanken geprüft. Alte
Replay-/Test-Sicherungstabellen gehören nicht zur Installation.
