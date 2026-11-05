# Gemeinsam brunchen

Ein Brunch-Planer auf Deutsch. Du verwaltest Speisen und Getränke direkt auf der Website im **Gastgeber-Bereich**. Gäste brauchen keine Namen oder Konten.

## Zwei Arten von Auswahl

- **Menge:** Plus und Minus ändern die gemeinsame Gesamtmenge. Die Einheit ist frei wählbar, zum Beispiel Stück, Tassen, Becher, Gläser oder Portionen.
- **Interesse – „Ich möchte etwas“:** Ein Ja zählt eine Person. Ein zweiter Klick nimmt die eigene Auswahl zurück. Wiederholte Ja-Anfragen zählen nicht mehrfach.

Die Ja/Nein-Auswahl wird über eine zufällige Kennung im Browser gespeichert. Es werden keine Namen erfasst. Ein anderer Browser, ein anderes Gerät oder gelöschter Browserspeicher kann dieselbe Person erneut zählen. Das ist eine Planungshilfe für eine vertraute Gruppe, keine Identitätsprüfung.

## Aktueller Stand

**Die Website ist eine lokale Vorschau und noch nicht mit einer echten Google-Tabelle verbunden.** Beispielwerte und Änderungen in der Vorschau bleiben in deinem Browser. Unter **Gastgeber → Verwaltung ausprobieren** kannst du Einträge hinzufügen, bearbeiten oder ausblenden. Die Vorschau braucht keinen echten Zugangscode und ist ausdrücklich als solche gekennzeichnet.

Der produktive Google-Apps-Script-Backendcode ist enthalten. Dort prüft der Server den Gastgeber-Code vor jeder Änderung der Speisekarte. Der Code wird beim Einrichten zufällig erzeugt, bleibt in den Script Properties und wird weder in den Quellcode noch in einen Gast-Link geschrieben. Die Website hält einen eingegebenen Code nur im Arbeitsspeicher; nach dem Neuladen meldest du dich erneut an.

## Lokal starten

Im Ordner dieses Repositorys:

```text
node preview.mjs
```

Öffne die ausgegebene Adresse. Alternativ erzeugt `node build.mjs` eine eigenständige Vorschau unter `dist/index.html`. `Index.html` ist die Vorlage; `Client.html` enthält das eingebundene JavaScript. Zum direkten Öffnen ohne Server bitte die gebaute Datei verwenden.

## Google Sheets einmalig einrichten

1. Erstelle eine leere Google-Tabelle. Die Tabelle selbst bleibt privat; Gäste erhalten später den Link zur Web-App.
2. Öffne **Erweiterungen → Apps Script** und kopiere `Code.gs` in den Editor.
3. Lege die beiden HTML-Dateien **Index** und **Client** an. Füge jeweils den Inhalt von `Index.html` und `Client.html` ein.
4. Speichere und führe im Editor einmal `setupBrunch_` aus. Google fragt dabei nach der Berechtigung für Tabellenzugriff. Die Einrichtung erzeugt die Blätter `Foods` und `Changes` sowie einen zufälligen Gastgeber-Code. Es werden keine Beispielgerichte eingetragen.
5. Lade die Tabelle neu. Unter **Brunch → Gastgeber-Code anzeigen** findest du deinen privaten Zugangscode.
6. Wähle im Skripteditor **Bereitstellen → Neue Bereitstellung → Web-App**. Die App soll als du ausgeführt werden. Wähle für eine Anmeldung ohne Google-Konto **Jeder**, sofern dein Konto bzw. deine Organisation diese Option erlaubt.
7. Öffne den bereitgestellten `/exec`-Link und wähle **Gastgeber**. Gib deinen Code ein und lege deine Speisen und Getränke auf der Website an.
8. Prüfe den Gast-Link in einem zweiten Browser. Teile anschließend diesen Link mit deinen Gästen.

`appsscript.json` enthält die benötigte Berechtigung und die Zeitzone. Die Datei kann optional über die Projekteinstellungen im Editor eingeblendet und übernommen werden. Bei Codeänderungen die Web-App als neue Version bereitstellen; Änderungen an Speisen auf der Website werden sofort gespeichert und brauchen keine neue Bereitstellung.

Der Host-Code lässt sich bei Bedarf durch Entfernen der Script Property `BRUNCH_HOST_KEY` und erneutes Ausführen von `setupBrunch_` ersetzen. Alte Codes gelten danach nicht mehr. Die Funktion zur Codeanzeige ist privat und kann von Gästen nicht aufgerufen werden.

## Speisen verwalten

- **Gastgeber → Hinzufügen:** Namen, Zählweise und bei Mengen die Einheit auswählen.
- **Bearbeiten:** Namen oder Einheit ändern und einen Eintrag ausblenden bzw. wieder anzeigen. Seine bisherigen Stimmen und Mengen bleiben erhalten.
- Die Zählweise eines bestehenden Eintrags bleibt fest. Für einen Wechsel zwischen Mengen und Personen einen neuen Eintrag erstellen und den alten ausblenden.
- `Foods` dient als Übersicht mit automatisch berechneten Summen. `Changes` ist das Änderungsprotokoll. IDs, Summen und Protokollzeilen nicht manuell bearbeiten.
- Die Einrichtung kann das frühere Format mit vier Spalten erweitern und bestehende Mengen übernehmen.

## Separate Repositorys

Dieses Repository ist unabhängig von [Kosi042/costume-contest](https://github.com/Kosi042/costume-contest). Beide lokalen Ordner haben ihre eigene Git-Historie und ihre eigenen Einstellungen. Die bestehende Wettbewerbsseite behält ihre Adresse.

**GitHub Pages ist noch nicht für die Brunch-Web-App eingerichtet.** Der Build erzeugt aktuell eine gekennzeichnete lokale Demo. Ein Upload allein verbindet sie nicht mit Google Sheets: `google.script.run` steht nur innerhalb der Google-Apps-Script-Web-App bereit. Für eine produktive GitHub-Adresse muss die Verbindung zum Google-Backend ergänzt und anschließend mit zwei Browsern getestet werden. Das Einchecken des Codes veröffentlicht noch keine Website.

## Prüfungen

```text
node --test tests/backend.test.mjs
node build.mjs
```

Die Tests prüfen unter anderem Host-Zugriff, wiederholte Anfragen, Einmalzählung pro Browser, Zurücknehmen einer Auswahl, getrennte Besucher, ausgeblendete Einträge und die Migration des Tabellenformats. Sie verwenden einen Ersatz für Google Sheets. Die tatsächliche Google-Anmeldung und Bereitstellung sind noch nicht live geprüft.

Technische Referenzen: [Google-Web-Apps](https://developers.google.com/apps-script/guides/web), [Kommunikation mit Apps Script](https://developers.google.com/apps-script/guides/html/communication), [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
