# BMS-App – Anwenderhandbuch

Stand: 20. Juli 2026

## 1. Zweck und Geltungsbereich

Dieses Handbuch beschreibt die Funktionen, die Anwenderinnen und Anwender in der BMS-App über die Benutzeroberfläche nutzen können. Es erklärt, in welchem Screen eine Funktion zu finden ist, welche Eingaben möglich oder erforderlich sind, was Schaltflächen und Symbole bewirken und welche Abhängigkeiten zwischen Mandant, Kunde, Warenkorb, Auftrag und Reservierung bestehen.

Das Handbuch beschreibt den derzeit in der App sichtbaren Funktionsumfang. Technische Administration, Datenbankpflege und Programmierschnittstellen sind nicht Bestandteil dieser Dokumentation.

## 2. Begriffe in der App

| Begriff | Bedeutung in der App |
| --- | --- |
| Mandant | Das Unternehmen beziehungsweise der Datenbestand, in dem gearbeitet wird. |
| Ausgewählter Kunde | Der aktuell für neue Aufträge vorgemerkte Kunde. Er wird oben in der App und im Seitenmenü angezeigt. |
| VL | Eine kompakte, fortlaufende Artikelliste zur schnellen Bestandsübersicht und Bearbeitung. |
| Artikel | Ein verfügbarer Lagerartikel mit Menge, Lager, Preis, MFI-, WPZ- und Reservierungsinformationen. |
| Reservierung | Eine zeitlich befristete Reservierung einer Artikelmenge. In der Navigation heißt dieser Bereich „Reservierungen“. |
| Auftrag | Ein eigener Auftrag mit Kunde, einer oder mehreren Positionen, Lieferdaten, Preisen und Auftragsangaben. In der Navigation heißt dieser Bereich „Aufträge“. |
| WPZ | Das zu einem Artikel verfügbare Werksprüfzeugnis beziehungsweise dessen Detailangaben. |
| MA-Kürzel | Das Mitarbeiterkürzel des angemeldeten Anwenders. Es wird unter anderem für eigene Kunden und eigene Reservierungen verwendet. |

## 3. Orientierung und Hauptnavigation

### 3.1 Kopfzeile

Die Kopfzeile ist in allen regulären Screens sichtbar. Sie enthält:

- links das Menüsymbol mit drei Linien;
- das BMS-Logo;
- rechts den aktuell gewählten Mandanten;
- rechts unterhalb des Mandanten den aktuell ausgewählten Kunden.

Ein Strich bei „Kunde“ bedeutet, dass noch kein Kunde für einen neuen Auftrag ausgewählt wurde.

### 3.2 Seitenmenü

Das Seitenmenü wird über das Menüsymbol geöffnet und über das X, durch Tippen außerhalb des Menüs oder nach Auswahl eines Menüpunktes wieder geschlossen.

Die regulären Menüpunkte sind:

| Menüpunkt | Zweck |
| --- | --- |
| VL | Kompakte Artikelliste, Suche, Schnellreservierung und Warenkorb. |
| Timeline | Aktivitäten der letzten 14 Tage. |
| Kunden | Kundensuche, Kundenauswahl und Kundeninformationen. |
| Mahnungen | Nur sichtbar, wenn im aktuellen Mandanten mindestens ein für den Anwender relevanter Kunde Mahnrechnungen besitzt. Öffnet die Kundenliste bereits als Mahnliste gefiltert. |
| Aufträge | Eigene Aufträge anlegen, ansehen, kopieren, ändern und löschen. |
| Reservierungen | Eigene oder alle Reservierungen ansehen und neue Reservierungen anlegen. |
| Artikel | Artikel nach Kategorien durchsuchen, suchen, öffnen und in den Warenkorb legen. |
| Einstellungen | Sprache, bevorzugte Navigation und Push-Benachrichtigungen festlegen. |

Im unteren Bereich des Menüs werden angezeigt:

- der aktive Mandant;
- der ausgewählte Kunde;
- Name und E-Mail-Adresse des angemeldeten Anwenders;
- gegebenenfalls die Schaltfläche „Mandant wechseln“.

„Mandant wechseln“ erscheint nur, wenn der Anwender Zugriff auf mehr als einen Mandanten besitzt. Beim Mandantenwechsel werden die aktuelle Kundenauswahl und der dazugehörige Warenkorb zurückgesetzt.

### 3.3 Gespeicherte Auswahl auf dem Gerät

Folgende Angaben bleiben auf dem verwendeten Gerät beziehungsweise in dem verwendeten Browser erhalten:

- ausgewählter Mandant;
- ausgewählter Kunde, getrennt nach Mandant;
- Warenkorb, getrennt nach Mandant;
- Sprache;
- bevorzugte Karten-App;
- Push-Freigabe dieses Geräts, sofern vom Browser unterstützt.

Wird ein anderer Kunde ausgewählt, wird der Warenkorb des aktuellen Mandanten geleert. Dadurch werden Artikelpositionen nicht versehentlich für einen falschen Kunden weiterverwendet.

### 3.4 Screen-Übersicht

| Screen | Einstieg | Voraussetzung |
| --- | --- | --- |
| Mandant auswählen | App-Start oder „Mandant wechseln“ | Gültige Anmeldung |
| Kunden | Seitenmenü, Mahnliste oder automatische Kundenauswahl | Mandant gewählt |
| Kundendetails | Kundenkarte antippen | Mandant gewählt |
| VL | Seitenmenü | Mandant gewählt |
| Timeline | Seitenmenü | Mandant gewählt |
| Artikel | Seitenmenü | Mandant gewählt |
| Artikeldetails | Artikelkarte oder verlinkter verkaufter Artikel | Mandant gewählt |
| WPZ Details | „Vorhanden“ in den Artikeldetails | WPZ für den Artikel vorhanden |
| Warenkorb | Warenkorbsymbol in VL, Artikelliste oder Artikeldetails | Mandant gewählt |
| Reservierungen | Seitenmenü oder Abschluss einer Reservierung | Mandant gewählt |
| Reservierung erstellen | Plus in „Reservierungen“, VL-Schnellaktion oder Artikeldetails | Mandant gewählt |
| Reservierungsdetails | Reservierungskarte antippen | Mandant gewählt |
| Aufträge | Seitenmenü | Mandant gewählt |
| Auftrag erstellen | Plus in „Aufträge“, Warenkorb oder „Kopieren“ | Mandant und Kunde gewählt; bei fehlendem Kunden erfolgt eine automatische Weiterleitung |
| Auftragsdetails | Auftragskarte antippen oder Abschluss des Speicherns | Eigener Auftrag |
| Auftrag ändern | „Ändern“ in den Auftragsdetails | Eigener Auftrag |
| Einstellungen | Seitenmenü oder Zahnrad in der Timeline | Mandant gewählt |
| Datenbank nicht verfügbar | Automatisch bei fehlendem Datenbankzugriff | Betroffener Mandant gewählt |

### 3.5 Sichtbarkeit und benutzerbezogene Einschränkungen

Der sichtbare Datenumfang hängt von Anmeldung, Mandantenfreigabe und Mitarbeiterzuordnung ab:

- In der Mandantenauswahl erscheinen nur für den Anwender freigegebene Mandanten.
- Abhängig vom aktiven Mandanten kann die Kundenliste automatisch auf Kunden des eigenen Mitarbeiterkürzels beschränkt sein.
- Die Mahnliste bezieht sich grundsätzlich auf die für den Anwender relevanten Kunden; in einem dafür freigegebenen Hauptmandanten kann sie einen größeren Kundenumfang enthalten.
- Der Screen „Aufträge“ zeigt nur selbst erstellte Aufträge.
- Der Screen „Reservierungen“ kann alle Reservierungen zeigen, aber nur eigene Reservierungen lassen sich ändern oder löschen.
- Die Timeline kann Ereignisse aus allen für den Anwender freigegebenen Mandanten enthalten.

## 4. Start und Mandantenauswahl

### 4.1 Screen „Mandant auswählen“

Beim Start prüft die App die Identität und die freigegebenen Mandanten des Anwenders. Angezeigt werden Name und E-Mail-Adresse des angemeldeten Anwenders.

Je nach Berechtigung verhält sich der Screen unterschiedlich:

- Bei genau einem freigegebenen Mandanten wird dieser automatisch gesetzt und die Kundenliste geöffnet.
- Bei mehreren freigegebenen Mandanten zeigt die App eine Auswahlliste. Das Antippen eines Mandanten speichert die Auswahl und öffnet unmittelbar die Kundenliste. Ist bereits ein weiterhin erlaubter Mandant markiert, kann alternativ mit „Weiter“ fortgefahren werden.
- Ist ein zuvor gespeicherter Mandant nicht mehr freigegeben, wird die alte Auswahl entfernt.
- Ohne freigegebenen Mandanten zeigt die App „Keine Berechtigung“ zusammen mit Benutzername und E-Mail-Adresse.
- Können die Mandanten nicht geladen werden, wird eine Fehlermeldung angezeigt.

### 4.2 Abgelaufene oder unterbrochene Anmeldung

Die App prüft die Anmeldung erneut, wenn sie aus dem Hintergrund in den Vordergrund geholt wird. Ist die Sitzung nicht mehr gültig, führt sie zurück zum App-Start. Dasselbe geschieht, wenn ein Abruf eine erneute Anmeldung erfordert.

### 4.3 Nicht verfügbare Mandantendatenbank

Ist die Datenbank des gewählten Mandanten nicht verfügbar, erscheint der Screen „Datenbank nicht verfügbar“. Dort kann über „Zur Startseite“ ein anderer Mandant gewählt oder der Zugriff später erneut versucht werden.

## 5. Kunden

### 5.1 Screen „Kunden“

Der Screen dient gleichzeitig zum Suchen, Öffnen und Auswählen eines Kunden.

#### Suche und Filter

Über das Suchfeld kann nach vier Kriterien gesucht werden:

- Name;
- PLZ;
- Region;
- MA-Kürzel.

Beim Wechsel auf „MA-Kürzel“ trägt die App automatisch das eigene Mitarbeiterkürzel in die Suche ein, sofern es verfügbar ist. Damit lässt sich die eigene Kundenliste schnell aufrufen.

Die Suche startet nach einer kurzen Eingabepause. Eine leere Suche zeigt die ungefilterte Liste; für einen Suchbegriff sind mindestens zwei Zeichen erforderlich.

#### Seitenwechsel

Pro Seite werden bis zu zwölf Kunden angezeigt. Oben rechts befinden sich:

- Pfeil zurück zur vorherigen Seite;
- Anzeige „Seite X/Y“;
- Pfeil weiter zur nächsten Seite.

Beim Öffnen eines Kunden und anschließendem Zurückgehen werden Seite, Suchbegriff, Suchart und Mahnfilter wiederhergestellt.

#### Einträge in der Kundenliste

Jede Kundenkarte zeigt den Kundennamen. Datensätze ohne einen verwendbaren Kundennamen von mindestens drei Zeichen werden nicht als Kundenkarte dargestellt. Bei Kunden mit Mahnrechnungen steht daneben eine rote Zahl in Klammern. Diese Zahl gibt die Anzahl der betroffenen Rechnungen an.

Es gibt zwei Bedienwege:

- Karte antippen: Öffnet den Screen „Kundendetails“.
- Auf einem Touch-Gerät waagerecht über die Karte wischen: Wählt den Kunden direkt aus, ohne zuerst die Detailansicht zu öffnen.

Der aktuell ausgewählte Kunde besitzt einen hervorgehobenen Rahmen und ein Häkchensymbol.

Wurde die Kundenliste automatisch aus einem anderen Ablauf geöffnet, zum Beispiel beim Erstellen eines Auftrags ohne Kundenauswahl, führt die direkte Auswahl anschließend automatisch in diesen Ablauf zurück. Beim Weg über die Detailansicht muss dort „Auswählen“ betätigt werden.

#### Mahnliste

Der rote Menüpunkt „Mahnungen (Anzahl)“ öffnet denselben Kundenscreen mit folgenden Vorgaben:

- Titel „Mahnungen“;
- nur Kunden mit Mahnrechnungen;
- Start auf Seite 1;
- Suche nach Name zunächst leer.

Die Zahl im Menü bezeichnet die Anzahl betroffener Kunden, während die rote Zahl an einer Kundenkarte die Anzahl betroffener Rechnungen dieses Kunden bezeichnet.

### 5.2 Screen „Kundendetails“

Oben werden der Kundenname, ein Zurück-Pfeil und die Schaltfläche „Auswählen“ angezeigt. „Auswählen“ macht diesen Kunden zum aktiven Kunden für neue Aufträge. Kam der Anwender aus einem laufenden Auftragserstellungsprozess, wird dieser danach automatisch fortgesetzt.

#### Angebote

Der aufklappbare Bereich „Angebote“ lädt die Angebote erst beim Öffnen. Im geöffneten Bereich kann gewählt werden zwischen:

- „90 Tage“;
- „1 Jahr“.

Pro Angebot zeigt die App:

- Ansprechpartner;
- Angebotsdatum;
- Zahlungsziel beziehungsweise Zahltext;
- jede Angebotsposition mit Artikel, Menge, Einheit und angebotenem Preis.

#### Aufträge des Kunden

Der aufklappbare Bereich „Aufträge“ kann zwischen folgenden Umfängen wechseln:

- „Offen“;
- „Alle“.

Pro Auftrag werden angezeigt:

- Ansprechpartner;
- Bestelldatum;
- Fälligkeitsdatum;
- Zahlungsziel beziehungsweise Zahltext;
- jede Position mit Artikel, Menge, Einheit, Lieferdatum und Verkaufspreis.

Dieser Bereich zeigt die vorhandenen Auftragsdaten des Kunden. Er ist nicht mit dem Menübereich „Aufträge“ zum Erfassen eigener neuer Aufträge zu verwechseln.

#### Rechnungen

Der aufklappbare Bereich „Rechnungen“ kann zwischen folgenden Umfängen wechseln:

- „Offen“;
- „Alle“.

Pro Rechnung werden angezeigt:

- Rechnungsnummer;
- Rechnungsdatum;
- Fälligkeitsdatum;
- Zahlungsziel beziehungsweise Zahltext;
- Betrag;
- Status „offen“ oder grün hervorgehoben „bezahlt“;
- gegebenenfalls die Mahnstufe in Rot.

#### Verkaufte Artikel

Der aufklappbare Bereich „Verkaufte Artikel“ zeigt die in den Kundendaten gefundenen Artikelbezeichnungen. Innerhalb des Bereichs kann direkt nach einer Artikelbezeichnung gesucht werden.

Ist ein verkaufter Artikel einem aktuellen Artikel in der App zugeordnet, ist er als Link markiert. Durch Antippen öffnet sich die zugehörige Artikeldetailansicht. Ein nicht zugeordneter Eintrag wird nur als Text angezeigt.

#### Mahnhinweis

Besitzt der Kunde Mahnrechnungen, erscheint unter den Dokumentbereichen ein roter Warnhinweis mit der Anzahl der betroffenen Rechnungen.

#### Stamminformationen

Im unteren Teil des Screens werden angezeigt:

- Beschreibung beziehungsweise Notiz;
- Adresse;
- Homepage;
- zuständiger Außendienst;
- Ansprechpartner;
- Aktivitäten.

Die Adresse ist anklickbar. Abhängig von der gespeicherten Einstellung wird eine Route zur Kundenadresse in Google Maps oder Apple Karten geöffnet. Wurde noch keine Karten-App festgelegt, fragt die App einmalig nach der gewünschten Anwendung und merkt sich die Auswahl.

Die Homepage ist als Weblink anklickbar. Falls in den Kundendaten kein Protokoll enthalten ist, öffnet die App die Adresse als HTTPS-Webseite.

Ansprechpartner werden als aufklappbare Karten angezeigt. Nach dem Öffnen stehen – sofern vorhanden – zur Verfügung:

- Telefonnummer als Telefonlink;
- E-Mail-Adresse als E-Mail-Link.

Aktivitäten zeigen Datum und Notiztext. Längere Texte werden zunächst verkürzt dargestellt und durch Antippen vollständig ein- beziehungsweise wieder ausgeklappt.

## 6. VL – kompakte Artikelliste

### 6.1 Aufbau

Der Screen „VL“ zeigt Artikel in einer kompakten, fortlaufend nachgeladenen Liste. Je Ladevorgang werden bis zu 100 weitere Einträge ergänzt. Die Einträge sind nach Kunststoff-Kategorie und Unterkategorie gruppiert. Die jeweilige Gruppenüberschrift hat das Format „Kategorie-Unterkategorie“; fehlende Werte werden als „unbekannt“ angezeigt.

Eine Artikelzeile kann folgende Angaben enthalten:

- Gesamtmenge und Einheit;
- Artikelbezeichnung;
- MFI-Wert;
- MFI-Prüfmethode in Klammern;
- Einstandspreis nach „zu“;
- Lager nach „ex“;
- BE-Nummer;
- Bemerkung in roter Schrift.

In der kompakten VL-Darstellung werden Mengen ohne Nachkommastellen, MFI-Werte mit bis zu zwei Nachkommastellen und Einstandspreise ohne Nachkommastellen formatiert. In den ausführlicheren Artikel- und Auftragsansichten werden Preise in der Regel mit zwei Nachkommastellen dargestellt.

Durch Antippen einer normalen Zeile öffnet sich die Artikeldetailansicht.

### 6.2 Suche

Das Lupensymbol öffnet das Suchfeld. Ab zwei Zeichen wird die Liste nach dem Suchbegriff neu geladen. Das X im Suchfeld löscht den Begriff. Ein erneutes Antippen der Lupe bei geöffneter Suche löscht die Suche und schließt das Feld.

### 6.3 Schnellaktionen

Auf einem Touch-Gerät stehen Wischaktionen zur Verfügung:

- nach links wischen: Aktion „In Warenkorb“ auf der rechten Seite aufdecken;
- nach rechts wischen: Aktion „Reservieren“ auf der linken Seite aufdecken;
- die aufgedeckte Aktion antippen, um sie auszuführen;
- die verschobene Artikelzeile antippen, um die Aktion wieder zu schließen.

Auf Geräten mit Maus erscheinen beim Darüberfahren rechts zwei Symbole:

- Reservierungssymbol: öffnet „Reservierung erstellen“ mit vorausgewähltem Artikel;
- Warenkorbsymbol: öffnet die Mengeneingabe zum Hinzufügen in den Warenkorb.

Das Warenkorbsymbol oben rechts zeigt als Badge die Anzahl unterschiedlicher Artikelpositionen im Warenkorb.

Beim schnellen Hinzufügen in den Warenkorb wird nur die Menge abgefragt. Die Menge muss größer als null sein und darf die angezeigte verfügbare Menge nicht überschreiten.

## 7. Timeline

Der Screen „Timeline“ zeigt Reservierungs- und Auftragsaktivitäten der letzten 14 Tage. Berücksichtigt werden die Mandanten, für die der angemeldete Anwender freigegeben ist; deshalb können Einträge mehrerer Mandanten erscheinen.

Die Einträge sind gruppiert nach:

- Heute;
- Gestern;
- anschließend ausgeschriebenem Wochentag und Datum.

Ein Eintrag zeigt:

- Datum und Uhrzeit;
- Mitarbeiterkürzel;
- Menge in Kilogramm;
- Artikelbezeichnung oder BE-Nummer;
- die Aktion „reserviert“ oder „beauftragt“;
- Mandant.

Über die Lupe wird eine lokale Suche ein- und ausgeblendet. Gesucht wird in Artikelbezeichnung beziehungsweise BE-Nummer und Mitarbeiterkürzel. Das X leert die Suche.

Das Zahnradsymbol führt direkt zu den Einstellungen.

Die Timeline dient als reine Aktivitätsübersicht. Ein Ereigniseintrag selbst besitzt derzeit keine Schaltfläche zum Öffnen des zugehörigen Artikels, Auftrags oder der Reservierung.

Wird eine Push-Benachrichtigung angetippt, fokussiert das Gerät eine bereits geöffnete BMS-App. Ist noch kein Fenster geöffnet, startet die App auf der Timeline.

## 8. Artikel

### 8.1 Screen „Artikel“

#### Browsen ohne Suchbegriff

Ohne Suchbegriff zeigt der Screen zuerst Kunststoff-Kategorien. Neben jeder Kategorie steht die Anzahl der enthaltenen Artikel. Eine Kategorie wird durch Antippen aufgeklappt und zeigt ihre Unterkategorien, ebenfalls mit Artikelanzahl. Erst beim Öffnen einer Unterkategorie werden die zugehörigen Artikel geladen.

Fehlende Gruppierungen heißen „Ohne Kategorie“ beziehungsweise „Ohne Untergruppe“.

#### Suche

Ab zwei eingegebenen Zeichen wechselt der Screen von der Kategorienansicht zu einer flachen Trefferliste. Die Suche startet nach einer kurzen Eingabepause. Beim Leeren des Feldes erscheint wieder die Kategorienansicht. Die flache Suche zeigt bis zu 300 Treffer; eine geöffnete Unterkategorie lädt bis zu 200 Artikel. In diesen beiden Ansichten gibt es keine zusätzliche Seitennavigation.

#### Artikelkarte

Eine Artikelkarte kann folgende Angaben enthalten:

- Artikelbezeichnung;
- Kunststoff-Kategorie;
- Gesamtmenge und Einheit;
- bereits reservierte Menge;
- Bemerkung;
- Einstandspreis;
- Lager;
- Lagerinformation;
- BE-Nummer.

Die Karte öffnet die Artikeldetails. Das Warenkorbsymbol auf der Karte öffnet stattdessen direkt die Mengeneingabe und verhindert das Öffnen der Detailansicht.

Beim Hinzufügen aus der Liste gilt:

- Menge muss größer als null sein;
- Menge darf die verfügbare Menge nicht überschreiten;
- verfügbare Menge ist Gesamtmenge abzüglich bereits reservierter Menge;
- ein erfolgreiches Hinzufügen wird bestätigt;
- ein Artikel, der bereits im Warenkorb liegt, wird durch die neu hinzugefügte Menge ersetzt und nicht als zweite Position angelegt.

Die Schnellaktion aus Artikelliste und VL fragt ausschließlich die Menge ab. Verkaufspreis und Lieferdatum werden für den Warenkorb zunächst mit Einstandspreis und dem nächsten Tag vorbelegt und können dort geändert werden. Eine WPZ-Auswahl wird im ausführlichen Hinzufügen-Dialog der Artikeldetails angeboten; wenn WPZ-Angaben für den Auftrag benötigt werden, sollte der Artikel deshalb über die Artikeldetails hinzugefügt werden.

Oben rechts öffnet das Warenkorbsymbol den Warenkorb. Die Zahl am Symbol entspricht der Anzahl unterschiedlicher Artikelpositionen, nicht der Summe der Kilogramm.

### 8.2 Screen „Artikeldetails“

Die Detailansicht zeigt den Artikelnamen und folgende Informationen:

- Einstandspreis;
- BE-Nummer;
- Kunststoff-Kategorie;
- Gesamtmenge;
- bereits reservierte Menge;
- Einheit;
- Lager;
- Lagerinformation;
- MFI;
- gemessener MFI;
- MFI-Prüfmethode;
- WPZ-Status;
- reserviert von;
- reserviert bis;
- Bemerkung.

Oben rechts befindet sich der Warenkorb mit Positionsanzahl. Der Zurück-Pfeil führt passend zum vorherigen Einstieg zurück zur VL oder zur Artikelliste und stellt dort den Suchbegriff wieder her.

#### Reservierung direkt aus dem Artikel

„Reservierung“ öffnet einen Dialog mit:

- Reservierungsmenge in kg;
- Datum „Reserviert bis“, vorbelegt mit dem nächsten Tag;
- optionalem Kommentar;
- Anzeige der aktuell verfügbaren Menge.

Die Reservierungsmenge darf die verfügbare Menge nicht überschreiten. Ist für den Artikel bereits eine Reservierung vorhanden, wird keine neue Reservierung geöffnet. Stattdessen erscheint ein Hinweis, gegebenenfalls mit dem Mitarbeiterkürzel der vorhandenen Reservierung.

Nach erfolgreicher Reservierung öffnet die App die Reservierungsliste.

#### Aus der Detailansicht in den Warenkorb

„In Warenkorb“ öffnet einen ausführlicheren Dialog als die Schnellaktion in den Listen. Eingetragen werden:

- Menge in kg;
- Verkaufspreis, zunächst mit dem Einstandspreis vorbelegt;
- bei vorhandenem WPZ die Auswahl „WPZ Original verwenden“;
- WPZ-Kommentar.

Validierungen:

- Menge größer als null;
- Menge nicht größer als die verfügbare Menge;
- Verkaufspreis größer als null;
- wenn ein WPZ vorhanden ist und „WPZ Original verwenden“ deaktiviert wird, ist ein WPZ-Kommentar Pflicht.

#### WPZ-Details

Der WPZ-Status wird als „Vorhanden“ oder „Nicht vorhanden“ angezeigt. „Vorhanden“ ist eine Schaltfläche und öffnet den Screen „WPZ Details“.

Der WPZ-Screen zeigt:

- BE-Nummer;
- alle für dieses WPZ bereitgestellten Feldnamen und Werte.

Da die WPZ-Felder vom jeweiligen Zeugnis abhängen, kann die Liste je Artikel unterschiedlich sein. Der Zurück-Pfeil führt wieder in die Artikeldetails und bewahrt den ursprünglichen Einstieg aus VL oder Artikelliste.

## 9. Warenkorb

### 9.1 Grundverhalten

Der Warenkorb wird pro Mandant auf dem Gerät gespeichert. Er bleibt bei einem Screenwechsel erhalten. Ein Wechsel des ausgewählten Kunden leert den Warenkorb. Auch ein Mandantenwechsel leert die aktuelle Kundenauswahl und den zugehörigen aktiven Warenkorbkontext.

Jeder Artikel kann nur einmal im Warenkorb liegen. Wird derselbe Artikel erneut hinzugefügt, ersetzt die neue Eingabe die vorhandene Position.

### 9.2 Position bearbeiten

Jede Warenkorbkarte zeigt:

- Artikelbezeichnung;
- BE-Nummer;
- Lager-ID;
- verfügbare Menge und Einheit;
- Einstandspreis;
- Schaltfläche zum Entfernen.

Bearbeitbar sind:

- Menge in kg;
- Verkaufspreis;
- Lieferdatum;
- bei vorhandenem WPZ „WPZ Original verwenden“;
- WPZ-Kommentar.

Beim Deaktivieren von „WPZ Original verwenden“ muss ein Kommentar eingetragen werden. Beim erneuten Aktivieren wird der abweichende Kommentar geleert.

Das Papierkorbsymbol entfernt eine Position unmittelbar aus dem Warenkorb.

### 9.3 „Auftrag erstellen“

Vor dem Fortfahren prüft die App jede Position:

- Menge ist größer als null;
- Menge überschreitet nicht die verfügbare Menge;
- Verkaufspreis ist größer als null;
- Lieferdatum ist vorhanden;
- erforderlicher WPZ-Kommentar ist vorhanden.

Fehlerhafte Felder werden markiert und der Auftrag wird noch nicht geöffnet.

Ist kein Kunde ausgewählt, führt die App zunächst in die Kundenliste. Nach der Kundenauswahl wird automatisch der Screen „Auftrag erstellen“ mit den Warenkorbpositionen geöffnet. Ist bereits ein Kunde gewählt, öffnet sich das Auftragsformular direkt.

Nach erfolgreichem Speichern eines aus dem Warenkorb erzeugten Auftrags wird der Warenkorb geleert.

## 10. Reservierungen

### 10.1 Screen „Reservierungen“

Der Screen zeigt aktive Reservierungen in Seiten mit jeweils bis zu zwölf Einträgen.

Über die Umschaltung kann gewählt werden:

- „Meine“: nur Reservierungen des eigenen Mitarbeiterkürzels;
- „Alle“: Reservierungen aller Anwender im gewählten Mandanten.

In der Ansicht „Alle“ wird zusätzlich das Mitarbeiterkürzel angezeigt, von dem die Reservierung stammt.

Die Suche berücksichtigt Artikelbezeichnung, BE-Nummer, Lager-ID und Kommentar. Eine leere Suche zeigt alle Reservierungen des gewählten Umfangs; ein Suchbegriff wird ab zwei Zeichen ausgeführt.

Oben stehen Pfeile zum Seitenwechsel, die Seitenanzeige und ein Plus-Symbol für eine neue Reservierung. Beim Rückweg aus einer Detailansicht werden Seite, Suchbegriff und Auswahl „Meine/Alle“ wiederhergestellt.

### 10.2 Screen „Reservierung erstellen“

Der Screen kann über das Plus in der Reservierungsliste oder über die Reservierungsaktion in der VL geöffnet werden. Beim Einstieg aus der VL ist der Artikel bereits vorausgewählt.

Felder:

| Feld | Verhalten |
| --- | --- |
| Artikel wählen | Suchbare Artikelauswahl. |
| BE-Nummer | Wird aus dem gewählten Artikel übernommen und ist nicht direkt bearbeitbar. |
| Lager-ID | Wird aus dem gewählten Artikel übernommen und ist nicht direkt bearbeitbar. |
| Reservierung | Menge der Reservierung. Die verfügbare Menge wird darunter angezeigt. |
| Reserviert bis | Pflichtdatum, mit dem nächsten Tag vorbelegt. |
| Kommentar | Optionaler Freitext. |

Vor dem Speichern prüft die App:

- ein gültiger Artikel mit BE-Nummer und Lager-ID ist gewählt;
- Menge ist größer als null;
- Datum ist vorhanden;
- Menge überschreitet die verfügbare Menge nicht.

Nach erfolgreichem Speichern öffnet sich die Reservierungsliste.

### 10.3 Screen „Reservierungsdetails“

Die Detailansicht zeigt:

- BE-Nummer;
- Mandant;
- Artikel;
- Einstandspreis;
- reservierte Menge und Einheit;
- gegebenenfalls Bestellschluss;
- reserviert bis;
- verantwortlicher Außendienstmitarbeiter beziehungsweise Reservierender;
- gegebenenfalls „Weitergereicht an“;
- Kommentar.

Eine Reservierung kann nur von der Person geändert oder gelöscht werden, deren Mitarbeiterkürzel als Reservierender hinterlegt ist. Bei fremden Reservierungen aus der Ansicht „Alle“ fehlen deshalb die Schaltflächen „Ändern“ und „Löschen“.

#### Reservierung ändern

Bearbeitbar sind:

- Menge;
- Datum „Reserviert bis“;
- Kommentar.

Menge und Datum sind Pflicht. Die Menge darf die aktuell mögliche Gesamtmenge unter Berücksichtigung der eigenen bereits reservierten Menge nicht überschreiten.

#### Reservierung löschen

„Löschen“ entfernt die eigene Reservierung unmittelbar und führt zurück zur Reservierungsliste. Im aktuellen Screen gibt es davor keinen zusätzlichen Bestätigungsdialog.

## 11. Aufträge

### 11.1 Unterschied zu Reservierungen

Ein Auftrag verbindet einen ausgewählten Kunden mit einer oder mehreren Artikelpositionen und enthält zusätzliche Auftragsdaten wie Incoterm, Verpackungsart, Lieferadresse, Zahltext und gegebenenfalls einen Anhang. Eine Reservierung blockiert dagegen eine Artikelmenge bis zu einem bestimmten Datum.

### 11.2 Screen „Aufträge“

Die Liste zeigt nur Aufträge, die vom aktuell angemeldeten Mitarbeiter erstellt wurden. Fremde Aufträge sind in diesem Screen nicht sichtbar.

Pro Seite werden bis zu zwölf Aufträge angezeigt. Oben befinden sich:

- vorherige Seite;
- Anzeige „Seite X/Y“;
- nächste Seite;
- Plus-Symbol für einen neuen Auftrag.

Die Suche berücksichtigt:

- Kundenname;
- Auftragskommentar;
- Artikelbezeichnung einer Position;
- BE-Nummer einer Position.

Eine leere Suche zeigt alle eigenen Aufträge; ein Suchbegriff wird ab zwei Zeichen ausgeführt.

Eine Auftragskarte zeigt:

- Kundenname;
- für jede Position laufende Nummer, Artikel, BE-Nummer, Menge in kg und Lieferdatum.

Durch Antippen öffnet sich die Auftragsdetailansicht. Beim Zurückgehen werden Seite und Suchbegriff wiederhergestellt.

### 11.3 Wege zum neuen Auftrag

Ein neuer Auftrag kann auf mehreren Wegen begonnen werden:

- Plus-Symbol im Screen „Aufträge“;
- „Auftrag erstellen“ im Warenkorb;
- „Kopieren“ in einem vorhandenen Auftrag.

Für einen neuen Auftrag muss ein Kunde ausgewählt sein. Ist beim Einstieg über das Plus noch kein Kunde gewählt, öffnet die App zuerst die Kundenliste und setzt den Ablauf nach der Auswahl fort.

Beim Einstieg aus dem Warenkorb werden die Warenkorbpositionen übernommen. Beim Kopieren werden die Angaben und Positionen des alten Auftrags übernommen; der alte Auftrag bleibt unverändert und der kopierte Auftrag wird als neuer Datensatz gespeichert. Ein vorhandener Dateianhang wird beim Kopieren nicht übernommen.

### 11.4 Screen „Auftrag erstellen“ und „Auftrag ändern“

#### Anhang

Über das Büroklammersymbol oben rechts kann eine Datei gewählt werden. Der Dateiauswahldialog ist für folgende Typen vorbereitet:

- PDF;
- Bilddateien;
- HEIC und HEIF.

Der gewählte Dateiname erscheint im Formular. Das Papierkorbsymbol entfernt eine neu gewählte Datei sofort aus dem Formular.

Beim Bearbeiten eines Auftrags wird der Name des gespeicherten Anhangs angezeigt. Wird dieser über den Papierkorb zum Entfernen markiert, erscheint ein roter Hinweis. Mit „Rückgängig“ kann die Markierung vor dem Speichern aufgehoben werden. Ersetzen oder Entfernen wird erst mit „Speichern“ wirksam.

Im aktuellen Auftragsdetail-Screen gibt es keine Schaltfläche zum Öffnen oder Herunterladen des Anhangs; sichtbar und bearbeitbar ist er im Erfassungs- beziehungsweise Bearbeitungsscreen.

#### Kunde

„Kunde wählen“ ist eine Suchauswahl. Nach der Wahl übernimmt die App:

- Kundennummer als Referenz;
- Kundenname;
- Kundenadresse;
- ersten verfügbaren Ansprechpartner;
- Standard-Zahltext des Kunden;
- vorhandene Lieferadressen;
- Anzahl von Mahnrechnungen.

Der Kundenname kann im Formular angepasst werden. Kundenadresse und Ansprechpartner werden angezeigt, sind aber dort nicht direkt bearbeitbar. Ein Kunde mit Mahnrechnungen erzeugt einen roten Warnhinweis.

Der ausgewählte Kunde wird zugleich als globaler Kunde der App gespeichert. Eine geänderte Kundenauswahl leert einen eventuell vorhandenen Warenkorb.

Beim Ändern oder Kopieren kann die Suchauswahl „Kunde wählen“ zunächst leer erscheinen, obwohl der übernommene Kunde im darunterliegenden Feld „Kunde“ steht. Eine erneute Auswahl ist nur erforderlich, wenn der Kunde tatsächlich gewechselt werden soll.

#### Allgemeine Auftragsangaben

| Feld | Beschreibung |
| --- | --- |
| Kunde | Bearbeitbarer Kundenname des Auftrags. |
| Adresse | Aus den Kundendaten übernommene, nicht direkt bearbeitbare Kundenadresse. |
| Ansprechpartner | Erster verfügbarer Ansprechpartner, nicht direkt bearbeitbar. |
| Kommentar | Freier Auftragskommentar. |
| Incoterm | Pflichtauswahl aus den verfügbaren Incoterms. |
| Verpackungsart | Pflichtauswahl. Die Bezeichnungen werden passend zur gewählten Sprache angezeigt. |
| Lieferadresse | Pflichtauswahl aus den beim Kunden vorhandenen Lieferadressen. |
| Abweichende Zahlungsbedingung | Aktiviert eine vom Kundenstandard abweichende Auswahl. |
| Zahltext | Pflichtauswahl aus den verfügbaren Zahltexten. |

Verpackungsarten in deutscher Sprache:

- Sackware;
- Siloware;
- Big Bags;
- Octa;
- Andere;
- NEUTRALE Sackware;
- NEUTRALE Oktabins.

Bei englischer Sprache werden die entsprechenden englischen Bezeichnungen angeboten.

Verpackungsarten in englischer Sprache:

- Bags;
- Silo/bulk;
- Big Bags;
- Octabins;
- Others;
- NEUTRAL Bags;
- NEUTRAL Octas.

#### Lieferadresse auswählen oder manuell erfassen

Standardmäßig ist die Lieferadresse eine Auswahlliste. Die Einträge zeigen Empfängername und Adresszusatz in zwei Zeilen.

Das Plus-Symbol neben der Lieferadresse schaltet auf eine manuelle Texteingabe um und leert die bisherige Auswahl. Im manuellen Modus zeigt das Symbol ein Minus; damit wird wieder auf die Auswahlliste zurückgeschaltet und die manuelle Eingabe geleert.

#### Zahlungsbedingung

Hat der Kunde einen Standard-Zahltext, verwendet die App diesen zunächst automatisch. Wird „Abweichende Zahlungsbedingung“ aktiviert, kann ein anderer Zahltext gewählt werden. Wird die Abweichung wieder deaktiviert, stellt die App nach Möglichkeit den Standard-Zahltext des Kunden wieder her.

Hat der Kunde keinen nutzbaren Standard-Zahltext, bleibt die Auswahl des Zahltexts unabhängig vom Kontrollkästchen sichtbar. Ein gültiger Zahltext ist immer erforderlich.

### 11.5 Auftragspositionen

Über der Positionsliste stehen die Anzahl der Positionen und ein Plus-Symbol zum Hinzufügen.

Jede Position ist aufklappbar. Die geschlossene Zeile zeigt Artikel, BE-Nummer und Lager-ID. Im geöffneten Zustand sind bearbeitbar:

- Lieferdatum;
- Menge;
- Verkaufspreis;
- Einstandspreis;
- bei vorhandenem WPZ „WPZ Original verwenden“;
- WPZ-Kommentar.

Das Papierkorbsymbol entfernt die Position.

Beim Bearbeiten eines bestehenden Auftrags gilt für die letzte verbliebene Position eine Sonderregel: Soll sie entfernt werden, weist die App darauf hin, dass dadurch der gesamte Auftrag gelöscht wird. Erst nach Bestätigung mit „Löschen“ wird der Auftrag entfernt. Bei einem noch nicht gespeicherten neuen Auftrag kann die letzte Position entfernt werden; der Auftrag lässt sich anschließend wegen der Pflicht zu mindestens einer Position nicht speichern.

#### Position hinzufügen

Das Plus-Symbol öffnet eine Artikelsuche. Ein Treffer zeigt:

- Artikelbezeichnung;
- Lager;
- Gesamtmenge und Einheit;
- Einstandspreis.

Nach Wahl eines Artikels werden erfasst:

- Menge;
- Verkaufspreis, mit dem Einstandspreis vorbelegt, sofern vorhanden;
- Lieferdatum, mit dem nächsten Tag vorbelegt;
- WPZ-Original-Auswahl, falls ein WPZ vorhanden ist;
- WPZ-Kommentar.

Zusätzlich wird die aktuell verfügbare Artikelmenge angezeigt. Vor dem Hinzufügen prüft die App:

- Artikel ist gewählt;
- Menge ist größer als null;
- Einstandspreis ist größer als null;
- Verkaufspreis ist größer als null;
- Lieferdatum ist vorhanden;
- bei abweichender WPZ-Verwendung ist ein Kommentar vorhanden.

„Speichern“ im Dialog fügt die Position dem Auftrag hinzu. Der gesamte Auftrag ist damit noch nicht gespeichert; dafür muss anschließend die Schaltfläche „Speichern“ im Hauptformular verwendet werden.

### 11.6 Auftrag speichern

Vor dem Speichern prüft die App:

- Kunde ist ausgewählt;
- mindestens eine Position ist vorhanden;
- Kundenname ist nicht leer;
- Kundenadresse ist nicht leer;
- Incoterm ist gewählt;
- Verpackungsart ist gewählt;
- Lieferadresse ist ausgewählt oder manuell eingetragen;
- Zahltext ist gewählt;
- jede Position besitzt ein Lieferdatum;
- Menge jeder Position ist größer als null;
- Verkaufs- und Einstandspreis jeder Position sind größer als null;
- erforderliche WPZ-Kommentare sind vorhanden.

Sind Angaben unvollständig, erscheint der Dialog „Bitte Eingaben prüfen“ mit allen gefundenen Hinweisen. Erst nach Korrektur kann gespeichert werden.

Nach erfolgreichem Speichern öffnet die App die Detailansicht des gespeicherten Auftrags. Stammt der neue Auftrag aus dem Warenkorb, wird der Warenkorb geleert. Beim Kopieren bleibt ein möglicherweise unabhängig vorhandener Warenkorb unverändert.

### 11.7 Screen „Auftragsdetails“

Der Detail-Screen zeigt folgende allgemeine Angaben:

- Kunde;
- Kundenadresse;
- Ansprechpartner;
- weitergereicht an;
- empfangen von;
- abgeschlossen: Ja/Nein;
- bestätigt: Ja/Nein;
- Erstellungsdatum;
- Kommentar;
- Incoterm;
- Verpackungsart;
- Lieferadresse;
- abweichende Zahlungsbedingung: Ja/Nein;
- Zahltext und gegebenenfalls dessen Nummer.

Zusätzlich werden Anzahl und Details der Positionen angezeigt. Pro Position sind dies:

- Artikel;
- BE-Nummer;
- Lager;
- Lieferdatum;
- Menge in kg;
- Verkaufspreis;
- Einstandspreis;
- Reservierungsmenge;
- Reservierungsdatum;
- gegebenenfalls WPZ-Nummer, Verwendung des Originals und WPZ-Kommentar.

Oben stehen drei Aktionen:

- „Ändern“: öffnet das vorausgefüllte Bearbeitungsformular;
- „Kopieren“: erzeugt ein vorausgefülltes Formular für einen neuen Auftrag;
- „Löschen“: entfernt den Auftrag unmittelbar und führt zur Auftragsliste zurück.

Im aktuellen Detail-Screen gibt es vor „Löschen“ keinen zusätzlichen Bestätigungsdialog. Der Bestätigungsdialog beim Entfernen der letzten Position gilt nur innerhalb des Bearbeitungsformulars.

## 12. Einstellungen

Der Screen „Einstellungen“ wird über das Seitenmenü oder das Zahnradsymbol in der Timeline geöffnet. Der Zurück-Pfeil oben rechts führt zur Timeline.

### 12.1 Sprache

Zur Auswahl stehen:

- Deutsch;
- Englisch.

Beim ersten Aufruf ist Deutsch voreingestellt. Die Sprache wird sofort umgestellt und auf dem Gerät gespeichert. Sie beeinflusst die Beschriftungen der App und unter anderem die angebotenen Verpackungsbezeichnungen. Einzelne fest hinterlegte Systemmeldungen können derzeit weiterhin auf Deutsch erscheinen.

### 12.2 Bevorzugte Navigation

Zur Auswahl stehen:

- Google Maps;
- Apple Karten.

Die Wahl wird auf dem Gerät gespeichert und beim Antippen einer Kundenadresse verwendet. Die App öffnet eine Routenplanung mit der Kundenadresse als Ziel.

Ist beim ersten Öffnen der Einstellungen noch keine Karten-App gespeichert, wird Google Maps als Vorauswahl gesetzt. Wird stattdessen zuerst eine Kundenadresse angetippt, fragt die App nach Google Maps oder Apple Karten.

### 12.3 Push-Benachrichtigungen

Push ist geräte- und browserbezogen. Die Einstellung auf einem Smartphone aktiviert Push nicht automatisch auf einem zweiten Gerät.

Die App zeigt zunächst den aktuellen Zustand:

- Push wird auf diesem Gerät oder Browser nicht unterstützt;
- Push ist noch nicht aktiviert;
- Push ist freigegeben;
- Push wurde im Browser blockiert.

#### Push aktivieren

„Push aktivieren“ fordert die Benachrichtigungsberechtigung des Browsers beziehungsweise Geräts an. Wird sie erteilt, registriert die App dieses Gerät. Anschließend können die verfügbaren Mandanten einzeln per Schalter für Push freigegeben oder deaktiviert werden.

Die Mandantenschalter sind erst bedienbar, nachdem Push auf diesem Gerät erfolgreich aktiviert wurde.

#### Push deaktivieren

„Push deaktivieren“ entfernt die Push-Registrierung dieses Geräts. Danach sind die Mandantenschalter wieder gesperrt.

Wurde Push im Browser ausdrücklich blockiert, muss die Freigabe in den Browser- oder Geräteeinstellungen geändert werden. Die App kann eine abgelehnte Berechtigung nicht selbst wieder freischalten.

Ist Push serverseitig noch nicht vollständig eingerichtet, erscheint ein entsprechender Hinweis und die Aktivierung ist nicht möglich.

## 13. Lade-, Leer- und Fehlerzustände

Während Daten geladen werden, zeigt die App einen kreisförmigen Ladeindikator. Leere Listen werden mit einem zum Screen passenden Hinweis gekennzeichnet, beispielsweise „Keine Kunden“, „Keine Artikel“ oder „Keine aktiven Reservierungen“.

Fehler innerhalb eines Screens erscheinen in einem roten Hinweisfeld. Die Eingaben bleiben nach Möglichkeit erhalten, damit der Vorgang korrigiert oder erneut versucht werden kann.

Bei einem unerwarteten allgemeinen App-Fehler erscheint ein eigener Fehler-Screen mit:

- „Neu laden“;
- „Zur Startseite“.

## 14. Häufige Arbeitsabläufe

### 14.1 Kunden auswählen und Kundendaten prüfen

1. Menü öffnen und „Kunden“ wählen.
2. Suchart festlegen und mindestens zwei Zeichen eingeben oder durch die Liste blättern.
3. Kundenkarte antippen.
4. Dokumentbereiche, Mahnhinweise, Ansprechpartner und Aktivitäten prüfen.
5. „Auswählen“ betätigen, wenn der Kunde für einen neuen Auftrag verwendet werden soll.

### 14.2 Auftrag aus Artikeln erstellen

1. Kunde auswählen.
2. „VL“ oder „Artikel“ öffnen.
3. Gewünschte Artikel mit Menge in den Warenkorb legen.
4. Warenkorb öffnen.
5. Menge, Verkaufspreis, Lieferdatum und WPZ-Angaben jeder Position prüfen.
6. „Auftrag erstellen“ wählen.
7. Incoterm, Verpackungsart, Lieferadresse und Zahltext ergänzen.
8. Positionen und gegebenenfalls Anhang prüfen.
9. „Speichern“ wählen.

### 14.3 Artikel reservieren

1. Artikel in der VL oder Artikelliste finden.
2. Artikeldetail öffnen und „Reservierung“ wählen oder die Schnellaktion in der VL verwenden.
3. Menge, Gültigkeitsdatum und optionalen Kommentar eintragen.
4. Reservierung speichern.
5. Ergebnis unter „Reservierungen“ prüfen.

### 14.4 Kunden mit Mahnungen bearbeiten

1. Menü öffnen.
2. Roten Eintrag „Mahnungen“ wählen.
3. Kundenkarte anhand der roten Rechnungsanzahl öffnen.
4. Bereich „Rechnungen“ öffnen.
5. Zwischen „Offen“ und „Alle“ wechseln und Mahnstufe, Fälligkeit und Betrag prüfen.

### 14.5 Route zu einem Kunden öffnen

1. Kunden öffnen.
2. Kundenadresse antippen.
3. Beim ersten Mal Google Maps oder Apple Karten wählen.
4. Die App öffnet die Route mit der Kundenadresse als Ziel.

### 14.6 Push für einen Mandanten aktivieren

1. Menü öffnen und „Einstellungen“ wählen.
2. Im Bereich „Push Nachrichten“ „Push aktivieren“ wählen.
3. Benachrichtigungen im Browser beziehungsweise Gerät erlauben.
4. Gewünschte Mandanten über die Schalter aktivieren.

## 15. Wichtige Bedienhinweise auf einen Blick

- Ein Auftrag benötigt einen ausgewählten Kunden und mindestens eine Position.
- Ein Kundenwechsel leert den Warenkorb.
- Warenkörbe und Kundenauswahl sind nach Mandant getrennt.
- Listen-Suchen starten in der Regel ab zwei Zeichen; die Timeline-Suche filtert sofort.
- In „Aufträge“ sieht der Anwender nur selbst erstellte Aufträge.
- In „Reservierungen“ kann zwischen eigenen und allen Reservierungen gewechselt werden.
- Fremde Reservierungen können angesehen, aber nicht geändert oder gelöscht werden.
- Eine bereits vorhandene Artikelreservierung verhindert eine zweite direkte Reservierung dieses Artikels.
- „Löschen“ in den Detail-Screens für Auftrag oder eigene Reservierung wirkt ohne zusätzlichen Bestätigungsdialog.
- Sprache, Karten-App und Push werden auf dem jeweiligen Gerät gespeichert.
