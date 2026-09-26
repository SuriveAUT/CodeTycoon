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

# Balancing simulation (headless bot, see "Balancing" below)
npm run sim
npm run sim -- --model daily --seeds 3
```

No test or lint scripts are configured. The engine runs headless in Node; `npm run sim` is the check for pacing changes.

## Architecture

**CodeTycoon** is a browser-based idle/incremental game with a startup/developer theme. The German UI is intentional (there is no i18n layer anymore).

### Frontend (SolidJS + Vite)

- `src/index.jsx` — mounts the app
- `src/components/App.jsx` — app shell (sidebar/bottom-nav, resource topbar), game loop timer, autosave, offline catch-up (on load, and for gaps > 10 s from a hidden tab or standby; nothing ticks or saves while the tab is hidden), modal/toast/tooltip system, chat widget, and the central `data-action` click dispatcher
- `src/components/renderers.js` — HTML string renderers for navigation, topbar and every tab (`renderTabContent()`); tabs are: `overview` (Büro), `buildings` (Team), `research` (Tech), `projects` (Releases), `expansion` (Freelance-Aufträge + Standorte + Doktrin), `market` (Börse), `prestige`, `codex`, `account`, `admin`
- `src/store/gameState.js` — single Solid.js `createStore` with all game state, save/load/normalize/migration (`VERSION` 8), cost helpers (`calcBuildingCost`, `maxAffordable`), unlock checks (`isTechUnlocked` also checks the tech's funding round via `techChapter`)
- `src/store/bonuses.js` — `computeBonuses(s)` and the production model `simulateProduction(dt, s, b)`; both take an optional state object so they run headless
- `src/engine/` — pure game logic:
  - `tick.js` — one simulation step (`processTick`): effects expiry → production → missions → events → automation → achievements/milestones/quests
  - `actions.js` — all player-triggered mutations (buy, research, prestige, colonies, missions, protocols, click)
  - `automation.js` — auto-hire / auto-learn / auto-freelance / auto-deploy
  - `offline.js` — `simulateOffline(elapsedSec)`: offline catch-up (cap, efficiency, 120 s steps with automation); used by App.jsx and the sim
  - `advisor.js` — `bestInvestmentId(b)`: the "best investment" hint in the Team tab; the sim bot buys with it
  - `quests.js` — sequential quest system (`currentQuest`, `questProgress`, `checkQuests`)
  - `roadmap.js` — funding rounds (`state.roadmap.chapter`): `goalProgress`/`goalLabel` per goal type, `checkRoadmap` (in `runProgressChecks`) advances when all goals of the current round are met
  - `daily.js` — daily loop: `tickDaily` (tickets per local day, coffee ripening, ticket rewards), `claimStandup` (login streak), `useCoffee`, `setBoost` (single temporary boost in `state.boost`); unlocked after the first tech (`dailyUnlocked`)
  - `challenges.js` — sprints: `startChallenge` (prestige reset with `allowZero`), `checkChallenge` (goal/time limit, run in `runProgressChecks`), `abortChallenge`; mods and permanent rewards are applied in `computeBonuses`
  - `events.js` — missions completion, random events, achievements, prestige milestones, bug anomaly
  - `cyberEvents.js` — interactive pop-up events
  - `decisions.js` — choice events (`data/decisions.js`), rendered in the same top-right overlay as cyber events
  - `stocks.js` — server-driven stock market client; held shares give a per-resource production bonus (`dividendBonus`, +0.01%/share, cap +50%) applied in `computeBonuses`. Trading price = server price × `priceScale()` (by highest tech tier of the run, `PRICE_SCALE_BY_TIER`); holdings reset on refactor
  - `themeEngine.js` — accent theme by progress (early/mid/late)
- `src/data/` — static content: `buildings.js` (42 buildings, categories, `milestoneMult`), `techs.js` (39 techs in 5 tiers; `TECH_TIERS[].chapter` = funding round that unlocks the tier), `chapters.js` (funding rounds with goals), `projects.js` (optional `chapter`), `artifacts.js`, `chips.js`, `quests.js` (35 quests; `since: 7` marks quests inserted in v7 for the questIndex migration), `daily.js` (streak/ticket/coffee constants, `dayKey`), `challenges.js` (6 sprints), `effects.js` (bonus functions), `events.js` (random event pool), `decisions.js` (choice events), `stocks.js` (stock list + dividend constants), `misc.js` (resources, `zeroResources()`, worlds, foci, doctrines, ops modes, protocols, missions, achievements, chronicle upgrades, prestige milestones, `COLONY_MAX_LEVEL`)
- `src/lib/` — `api-client.js` (HTTP to backend, node-safe), `format.js`, `icons.js` (SVG sprite lookup; sprite lives in `index.html`), `sanitize.js`, `toast.js`, `settings.js` (per-device settings in localStorage, not part of the save)
- `src/index.css` — the design system (CSS variables, layout, components). No other stylesheet.

### Economy model (important when balancing)

- Producers add output every tick. Converters consume **real stock** (plus what was produced in the same step) and run proportionally when input is short (`utilization` < 1 → shown as "gedrosselt").
- Converter inputs are scaled by `converterInputMult × allMult`; outputs by `resourceMult(out)`. This keeps `allMult` from compounding along converter chains.
- Building milestones: output ×2 at 10/25/50/100/200/300/400/500 owned (`MILESTONE_STEPS`).
- Cost growth 1.15 per purchase (modifiers 1.6), soft cap ×1.03 per level above 100. Modifier effects cap at 20 units (`MODIFIER_CAP`), colonies at 8 (`MAX_COLONIES`), team synergy at +200%.
- Prestige XP = `6 · ∛(runScrap / 1e7) · structBonus · prestigeGainMult` (`prestigeGainRaw` in actions.js). A refactor needs `minPrestigeGain()` = max(10, 2 % of `stats.xpEarned`) XP (`canPrestige`); sprint starts are exempt. `stats.xpEarned` (all XP ever earned) drives the XP milestones/achievements, round goals and the leaderboard; the refactor *count* is only used for quests and anti-cheat.
- Funding rounds gate tech tiers (tier 4 from Seed, tier 5 from Series A). Existing techs/releases are never removed; the v8 migration derives the starting round from existing progress.
- Ticket targets and daily rewards scale with current gross production (minutes of output), so they stay relevant at any stage; lifetime counters for them live in `stats` (`hiresTotal`, `techsLearned`, `bugsFixed`, `stockTrades`).
- Rates cache: `state.cache.rates[res]` = net/s, plus `__produced`, `__consumed`, `__utilization`, `__starved`. Read it through `currentRates()` / `currentBonuses()` (bonuses.js), which fall back to a fresh computation when the cache is empty; never read `state.cache.*` directly.
- Automation runs 4× per second of game time (`AUTO_HZ` in tick.js, at most 4 passes per `processTick` call, so offline steps stay cheap); auto-hire buys at most one unit per building per pass. The threshold checks (achievements, milestones, quests via `runProgressChecks()`) run once per second inside `processTick`. With `opts.offline` the checks are skipped and the caller runs `runProgressChecks(true)` once afterwards.

### Balancing

`scripts/sim.mjs` (`npm run sim`) plays the game with a bot on the real engine: it stubs `localStorage`/`fetch`, mocks `Date.now` and seeds `Math.random` before importing, then calls `processTick(1, { silent: true, auto: true, offline: true })` + `runProgressChecks(true)` per second. The bot clicks, buys via `bestInvestmentId`, researches, releases, founds colonies, runs missions, protocols, stocks, standup/coffee and sprints, and spends XP. It refactors when the gain covers the XP still missing for the current round's goal, or when XP/min drops (and the gain is ≥ 10 XP and ≥ 50 % of XP earned so far).

- Models: `active` (continuous), `daily` (two 20-min sessions per day at 08:00/20:00 UTC, gaps via `simulateOffline`), `save --save <file>` (a real save, then daily). One child process per seed; the report prints median and range per milestone plus PASS/FAIL against `TARGETS` in the script.
- The bot is faster than a human (it buys optimally every 5 s), so its times are a lower bound.
- Target pacing: first tech < 2 min, tier 2 by ~20 min, first refactor after ~1.5–2 h active; a daily player should not reach the finale before ~day 16.

### Backend (Express + SQLite)

- `backend/server.js` — Express app; serves `dist/` as SPA, mounts API routes
- `backend/db.js` — SQLite3 init (`users` table: `username`, `password_hash`, `game_save` JSON blob, `prestige_score`, `total_scrap`, flags)
- `backend/routes/auth.js` — `POST /api/auth/register`, `POST /api/auth/login`; JWT (7-day expiry)
- `backend/routes/game.js` — save/load/leaderboard/profile + admin endpoints; save validation reads `resources`, `stats.lifetime`, `stats.prestigeCount`, `stats.total.scrap`, `stats.xpEarned`, `stats.lastSave` — keep those shapes stable. `/save` stores `xp_earned` (leaderboard order) and `save_version`, and rejects saves with a lower `version` than stored (409, stale tab)
- `backend/routes/chat.js`, `backend/routes/stocks.js`, `backend/lib/stockMarket.js` — global chat and shared stock market (mean-reverting random walk per 5-min tick, a history point every 30 min for a 24 h chart)

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
- Tooltips: `data-tt="<html>"` via the `tt()` helper in renderers.js (attribute-escaped, read back with `el.dataset.tt`).
- Modals: `showModal(title, html, buttons)` resolves with the clicked button's `action`; use `confirmModal()` for yes/no and `showError()` for error dialogs in App.jsx.
- Buy amounts and tab shortcut keys derive from `BUY_AMOUNTS` (gameState.js) and `TABS` (renderers.js); don't hardcode them elsewhere.
- Live numbers in the topbar are patched at 10 Hz via `[data-res-val]` / `[data-res-rate]`; everything else re-renders once per second.
- Keep save-format changes backward compatible in `normalizeState()`; bump `VERSION` and migrate in `migrateState()`.
