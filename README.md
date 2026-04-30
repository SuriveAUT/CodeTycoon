# Astraforge: Das stille Archiv

Idle-Management-Spiel mit Vite-Frontend und optionalem Backend (Auth, Cloud-Save, Leaderboard).

## Start
- Abhängigkeiten installieren: `npm install`
- Frontend + Backend starten: `npm run dev`
- Frontend alleine bauen: `npm run build`

## Umgebungsvariablen
Lege bei Bedarf eine `.env` auf Basis von `.env.example` an:

- `VITE_API_BASE_URL` - API-URL für das Frontend (Default: `http://localhost:3005/api`)
- `VITE_API_TIMEOUT_MS` - Request-Timeout in Millisekunden (Default: `10000`)

## Features
- Gebäude, Forschung, Kolonien, Expeditionen, Megaprojekte
- Prestige mit Chronik-Upgrades
- Account-Login mit Cloud-Save und Leaderboard
- Autosave, Offline-Fortschritt, Ereignisse und Tutorial
