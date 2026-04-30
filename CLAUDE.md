# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start full stack (frontend on :5173, backend on :3005)
npm run dev

# Build frontend for production
npm run build

# Preview production build
npm run preview

# Backend only (with file watching)
cd backend && npm run dev

# Backend only (production)
cd backend && npm start
```

No test or lint scripts are configured.

## Architecture

**Astraforge: Das stille Archiv** is a browser-based idle/incremental game. The German UI is intentional.

### Frontend (SolidJS + Vite)

- `src/index.jsx` — mounts the app
- `src/components/App.jsx` — root UI component (~500 lines); owns the game loop timer, autosave, offline catchup on load, and the modal system
- `src/components/renderers.js` — DOM rendering functions for each UI tab (Buildings, Research, Market, etc.)
- `src/store/gameState.js` — single Solid.js `createStore` holding all game state (resources, buildings, techs, projects, prestige, etc.)
- `src/store/bonuses.js` — derived bonus calculations over game state
- `src/engine/` — pure game logic, no UI imports:
  - `loop.js` — orchestrates the tick
  - `tick.js` — per-frame resource production, event timers, expedition completion
  - `actions.js` — all player-triggered mutations (buy building, research tech, prestige reset, etc.)
  - `automation.js` — auto-build and auto-research logic
  - `events.js` / `cyberEvents.js` — random anomaly/cyber event system
  - `market.js` — dynamic trading mechanics
  - `themeEngine.js` — theme/visual state
- `src/data/` — static game content definitions (buildings, techs, projects, artifacts, chips, effects, misc constants)
- `src/data/i18n.js` — German UI strings
- `src/lib/` — utilities: `api-client.js` (HTTP to backend), `format.js` (number display), `icons.js`, `sanitize.js`

### Backend (Express + SQLite)

- `backend/server.js` — Express app; serves the production `dist/` as an SPA (catch-all to `index.html`), mounts API routes
- `backend/db.js` — SQLite3 init; creates `users` table with `username`, `password_hash`, `game_save` (JSON blob), `prestige_score`, `total_scrap`
- `backend/routes/auth.js` — `POST /api/auth/register`, `POST /api/auth/login`; JWT (7-day expiry)
- `backend/routes/game.js` — `POST /api/game/save`, `GET /api/game/load`, `GET /api/game/leaderboard`, `GET /api/game/profile`

Backend runs on port **3005**. Frontend dev server runs on port **5173** (configured in `vite.config.js` as 3000, but `npm run dev` passes `--port 5173`).

### Environment

Copy `.env.example` to `.env`:
```
VITE_API_BASE_URL=http://localhost:3005/api
VITE_API_TIMEOUT_MS=10000
```

### Docker

The `Dockerfile` does a multi-stage build: builds the frontend, installs backend prod deps, then runs `node backend/server.js` (port 3005). The backend serves the compiled `dist/` statically in production.

### Game Systems

- **Resources**: Scrap, Energy, Alloy, Components, Data, Research, Influence, Relics
- **Prestige**: full reset with carry-over bonuses, tracked in Chronicles
- **Colonies & Expeditions**: time-gated missions
- **Projects**: long-duration mega-constructs
- **Market**: rate-varying trades
- **Chips/Mainframe**: equippable bonus items
- **Cloud Save**: JWT-authenticated save/load via backend API
- **PWA**: manifest + service worker assets in `public/`
- **Offline Progression**: simulated in `App.jsx` on load based on elapsed time
