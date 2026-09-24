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

No test or lint scripts are configured. The engine runs headless in Node (see "Balancing" below).

## Architecture

**CodeTycoon** is a browser-based idle/incremental game with a startup/developer theme. The German UI is intentional (there is no i18n layer anymore).

### Frontend (SolidJS + Vite)

- `src/index.jsx` — mounts the app
- `src/components/App.jsx` — app shell (sidebar/bottom-nav, resource topbar), game loop timer, autosave, offline catch-up, modal/toast/tooltip system, chat widget, and the central `data-action` click dispatcher
- `src/components/renderers.js` — HTML string renderers for navigation, topbar and every tab (`renderTabContent()`); tabs are: `overview` (Büro), `buildings` (Team), `research` (Tech), `projects` (Releases), `expansion` (Freelance-Aufträge + Standorte + Doktrin), `market` (Börse), `prestige`, `codex`, `account`, `admin`
- `src/store/gameState.js` — single Solid.js `createStore` with all game state, save/load/normalize/migration (`VERSION` 5), cost helpers (`calcBuildingCost`, `maxAffordable`)
- `src/store/bonuses.js` — `computeBonuses(s)` and the production model `simulateProduction(dt, s, b)`; both take an optional state object so they run headless
- `src/engine/` — pure game logic:
  - `tick.js` — one simulation step (`processTick`): effects expiry → production → missions → events → automation → achievements/milestones/quests
  - `actions.js` — all player-triggered mutations (buy, research, prestige, colonies, missions, protocols, click)
  - `automation.js` — auto-hire / auto-learn / auto-freelance / auto-deploy
  - `quests.js` — sequential quest system (`currentQuest`, `questProgress`, `checkQuests`)
  - `events.js` — missions completion, random events, achievements, prestige milestones, bug anomaly
  - `cyberEvents.js` — interactive pop-up events
  - `decisions.js` — choice events (`data/decisions.js`), rendered in the same top-right overlay as cyber events
  - `stocks.js` — server-driven stock market client
  - `themeEngine.js` — accent theme by progress (early/mid/late)
- `src/data/` — static content: `buildings.js` (42 buildings, categories, `milestoneMult`), `techs.js` (39 techs in 5 tiers), `projects.js`, `artifacts.js`, `chips.js`, `quests.js` (32 quests), `effects.js` (bonus functions), `misc.js` (resources, worlds, foci, doctrines, ops modes, protocols, missions, achievements, chronicle upgrades, prestige milestones)
- `src/lib/` — `api-client.js` (HTTP to backend, node-safe), `format.js`, `icons.js` (SVG sprite lookup; sprite lives in `index.html`), `sanitize.js`, `toast.js`, `settings.js` (per-device settings in localStorage, not part of the save)
- `src/index.css` — the design system (CSS variables, layout, components). No other stylesheet.

### Economy model (important when balancing)

- Producers add output every tick. Converters consume **real stock** (plus what was produced in the same step) and run proportionally when input is short (`utilization` < 1 → shown as "gedrosselt").
- Converter inputs are scaled by `converterInputMult × allMult`; outputs by `resourceMult(out)`. This keeps `allMult` from compounding along converter chains.
- Building milestones: output ×2 at 10/25/50/100/200/300/400/500 owned (`MILESTONE_STEPS`).
- Cost growth 1.15 per purchase (modifiers 1.6), soft cap ×1.03 per level above 100. Modifier effects cap at 20 units (`MODIFIER_CAP`), colonies at 8 (`MAX_COLONIES`), team synergy at +200%.
- Prestige XP = `6 · ∛(runScrap / 1e7) · structBonus · prestigeGainMult` (`prestigeGainRaw` in actions.js).
- Rates cache: `state.cache.rates[res]` = net/s, plus `__produced`, `__consumed`, `__utilization`, `__starved`.

### Balancing

The engine imports cleanly in Node (`localStorage` must be stubbed). A greedy-bot simulation lives outside the repo (see git history of the rework commit for the approach): import `store/gameState.js`, `engine/tick.js`, `engine/actions.js`, mock `Date.now`, call `processTick(1, { silent: true, auto: true, offline: true })` in a loop. Target pacing for an active player: first tech < 2 min, tier 2 by ~20 min, first prestige worth taking after ~1.5–2 h, tiers 4–5 across several runs.

### Backend (Express + SQLite)

- `backend/server.js` — Express app; serves `dist/` as SPA, mounts API routes
- `backend/db.js` — SQLite3 init (`users` table: `username`, `password_hash`, `game_save` JSON blob, `prestige_score`, `total_scrap`, flags)
- `backend/routes/auth.js` — `POST /api/auth/register`, `POST /api/auth/login`; JWT (7-day expiry)
- `backend/routes/game.js` — save/load/leaderboard/profile + admin endpoints; save validation reads `resources`, `stats.lifetime`, `stats.prestigeCount`, `stats.total.scrap`, `stats.lastSave` — keep those shapes stable
- `backend/routes/chat.js`, `backend/routes/stocks.js`, `backend/lib/stockMarket.js` — global chat and shared stock market

Backend runs on port **3005**. Frontend dev server runs on port **5173** (`npm run dev` passes `--port 5173`).

### Environment

Copy `.env.example` to `.env`:
```
VITE_API_BASE_URL=http://localhost:3005/api
VITE_API_TIMEOUT_MS=10000
```

### Docker

Multi-stage `Dockerfile`: builds the frontend, installs backend prod deps, runs `node backend/server.js` (port 3005) which serves `dist/` statically.

### Conventions

- All UI is rendered as HTML strings via template literals; every interactive element uses `data-action` (+ `data-id`, etc.) and is handled in `App.jsx → handleAction`. Escape user/content strings with `escapeHtml`.
- Tooltips: `data-tt="<encoded html>"` via the `tt()` helper in renderers.js.
- Live numbers in the topbar are patched at 10 Hz via `[data-res-val]` / `[data-res-rate]`; everything else re-renders once per second.
- Keep save-format changes backward compatible in `normalizeState()`; bump `VERSION` and migrate in `migrateState()`.
