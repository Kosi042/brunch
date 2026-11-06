# Gemeinsam brunchen

Gäste sehen die gemeinsamen Summen direkt auf der Website. **+ / −** zählt Stück, Tassen oder eine andere Einheit. **„Ja, ich möchte etwas“** zählt eine Person pro Browser. Ein zweiter Klick nimmt die Auswahl zurück. Die Gastgeberin oder der Gastgeber fügt Speisen und Getränke unter **Gastgeber** hinzu und kann Einträge umbenennen oder ausblenden.

Der Planer speichert Speisen und Änderungen in PostgreSQL bei Supabase. Jede bestätigte Änderung ist für alle Gäste gespeichert. Beim erneuten Senden erkennt die Datenbank denselben Klick. Im Browser bleiben die anonyme Kennung und gegebenenfalls ein unbestätigter Klick. Wer den Browser oder das Gerät wechselt, kann beim selben Getränk erneut mitgezählt werden.

## Privat verwalten

Der Gastgeber-Code wird beim Einrichten zufällig erzeugt. In deinem Supabase-Projekt kannst du ihn im **SQL Editor** mit dieser Abfrage anzeigen:

```sql
select host_code from brunch_private.settings;
```

Gib den Code auf der Website unter **Gastgeber** ein. Teile mit Gästen nur den Link zur Website. Du kannst eine Auswahl ausblenden und später mit ihren bisherigen Stimmen wieder anzeigen.

## Einrichtung für eine eigene Installation

1. Öffne im Supabase-Projekt den **SQL Editor** und führe [brunch.sql](supabase/brunch.sql) einmal aus. Das Skript richtet nur den Brunch-Bereich ein. Ein erneuter Lauf bricht ab, wenn dieser Bereich schon existiert.
2. Unter **Connect** findest du die Projekt-URL und den **Publishable key** für den Browser. Trage die beiden öffentlichen Werte in `public-config.json` als `{"url":"…","key":"…"}` ein. Alternativ lassen sie sich unter **Settings → Secrets and variables → Actions → Variables** als `SUPABASE_URL` und `SUPABASE_PUBLISHABLE_KEY` setzen. Der private Gastgeber-Code gehört ausschließlich in die Datenbank.
3. Wähle im GitHub-Repository unter **Settings → Pages → Source** die Option **GitHub Actions**. Der Workflow **Publish brunch planner** prüft den Planer und veröffentlicht die Website. Er lässt sich unter **Actions** auch von Hand starten.
4. Öffne die fertige Website, melde dich unter **Gastgeber** an und lege deine Speisen und Getränke an. Die öffentliche Ansicht startet mit einer leeren Liste.

Der Planer benötigt keine Google-Berechtigung. Wer die frühere Version bereits in Apps Script veröffentlicht hat, kann die alte Bereitstellung dort archivieren und die alte Freigabe in den [Google-Kontoverbindungen](https://myaccount.google.com/connections) entfernen. Die neue Version übernimmt keine Einträge aus einer früheren Tabelle.

## Auf dem eigenen Rechner

Mit Node.js ab Version 22:

```text
npm ci
npm run dev
```

Öffne die ausgegebene Adresse. Die lokale Version verwendet dieselben Datenbankregeln wie die veröffentlichte Website. Sie speichert ihre eigenen Daten auf diesem Rechner im Ordner `.brunch-local/db`. Den **lokalen** Gastgeber-Code findest du in `.brunch-local/Gastgeber-Code.txt`. Dieser Ordner wird weder veröffentlicht noch in Git gespeichert.

`npm test` prüft Berechtigungen, Änderungen mehrerer Gäste, Wiederholungen nach Verbindungsproblemen und das erneute Öffnen der gespeicherten Datenbank. `npm run build` erzeugt die Website mit der öffentlichen Verbindung unter `dist/index.html`.
