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
- `src/store/gameState.js` — single Solid.js `createStore` with all game state, save/load/normalize/migration (`VERSION` 10), cost helpers (`calcBuildingCost`, `maxAffordable`), unlock checks (`isTechUnlocked` also checks the tech's funding round via `techChapter`)
- `src/store/bonuses.js` — `computeBonuses(s)` and the production model `simulateProduction(dt, s, b)`; both take an optional state object so they run headless
- `src/engine/` — pure game logic:
  - `tick.js` — one simulation step (`processTick`): effects expiry → production → missions → events → automation → achievements/milestones/quests
  - `actions.js` — all player-triggered mutations (buy, research, prestige, colonies, missions, protocols, click)
  - `automation.js` — auto-hire / auto-learn / auto-freelance / auto-deploy
  - `offline.js` — `simulateOffline(elapsedSec)`: offline catch-up (cap, efficiency, 120 s steps with automation); used by App.jsx and the sim
  - `advisor.js` — `bestInvestmentId(b)`: the "best investment" hint in the Team tab; the sim bot buys with it
  - `quests.js` — sequential quest system (`currentQuest`, `questProgress`, `checkQuests`)
  - `roadmap.js` — funding rounds (`state.roadmap.chapter`): `goalProgress`/`goalLabel`/`goalTab` per goal type (refactors, xpEarned, sprints, standups, release, lab), `checkRoadmap` (in `runProgressChecks`) advances when all goals of the current round are met and records `roadmap.startXp` (XP earned at round entry); `goalFraction` is the progress-bar fill — xpEarned goals count orders of magnitude (log scale from `startXp`, normalizeState falls back to the previous round's XP goal capped at current XP); `roundRewardSum` sums reward keys (labSlots, chipSlots) of completed rounds. App.jsx celebrates new rounds via `roadmap.seen`; the last round is the IPO finale
  - `mail.js` — story inbox (`data/mails.js`: senders, ~30 mails with pure `trigger(s)`, optional `choices` with grant/boost/lab/coffee effects): `checkMail` in `runProgressChecks` delivers due mails once; the first check on an existing save archives everything already reached as read instead of flooding the inbox; `answerMail`, `markMailsRead` (App.jsx marks read when leaving the tab), `stats.longAbsences` (App.jsx offline catch-up ≥ 24 h) triggers the welcome-back mail
  - `mandates.js` — Vorstandsmandate after the IPO (`data/mandates.js`): `selectMandate` (one active, switching keeps progress; fixes the board-sprint goal = 25 % of `stats.bestRunScrap` × 1.2 per completed mandate), `completeMandateStep` (lab/sprint/release, reported by lab.js `claimLab`, challenges.js `checkChallenge` and the budget), release budget in `state.mandates.budget` (survives refactors; `depositOnRefactor` in `doPrestigeReset` moves the leftover Hype/Legacy in, the button deposits at most half the stock), first completion unlocks labSlots/doctrine/chip/endless lab project, later levels give allMult ×1.15 (bonuses.js). A mandate level is only available once all three reached the previous level (`mandateRound`). Solid store merges objects, so finishing a mandate clears progress/budget by setting `undefined`
  - `lab.js` — R&D lab: real-time projects (`startLab`, `claimLab`, `speedUpLab`, `labCost`, `labStatus`); unlocked with the first refactor, 1 slot plus round rewards; survives refactors. With all slots busy, `queueLab` prepays one follow-up per slot (`state.lab.queued`, repeatables also "again" at the next level via `labQueueCost`), `cancelQueuedLab` refunds straight to stock; `processLabQueue` (in `runProgressChecks`, deliberately not in the offline steps) auto-claims a finished project and starts the queued one at its end time. Standup and the coffee option „Überstunden“ speed it up
  - `daily.js` — daily loop: `tickDaily` (TICKET_OFFERS = 5 tickets per local day, each pays its reward, the first TICKETS_PER_DAY = 3 give the Tages-Bonus; saves from before get topped up once per day; coffee ripening), `claimStandup` (login streak), `useCoffee`, `setBoost` (one temporary boost at a time in `state.boost`; a boost added while another runs waits in `state.boostQueue` and `tick.js` starts it when the current one ends — `simulateOffline` holds the queue back so a queued boost never covers the whole absence); unlocked after the first tech (`dailyUnlocked`)
  - `challenges.js` — sprints: `startChallenge` (prestige reset with `allowZero`), `checkChallenge` (goal/time limit, run in `runProgressChecks`), `abortChallenge`; mods and permanent rewards are applied in `computeBonuses`. Weekly sprints (`wk:<week>`, `data/challenges.js` `weeklySprintDef`) are scored by weekly.js, not here
  - `weekly.js` — weekly ranking, client side: `trackWeekly` (first step of `runProgressChecks`) records run code until minute 30 of each run (`stats.run30`); at minute 30 a weekly sprint ends with score = last in-window run code / `normalPar` (best of `stats.parMarks`, the minute-30 code of the last 5 normal runs, only recorded when the last check was ≤ 90 s before minute 30 — offline catch-up never inflates it); keeps `weekly.labSlots` current. `stats.labHours` (lab.js `claimLab`, nominal hours stored in `lab.running[].hours`) feeds the research category. Week = Monday 00:00 Europe/Vienna (`lib/week.js`, twin of `backend/lib/week.js`)
  - `community.js` — open-source project, client side (no API calls, sim-safe): `packageCost` (15 min gross production of scrap/alloy/research, capped like lab costs), `beginContribution` pays and stores a pending entry with a request ID, `settleContribution` books or refunds, `applyCommunityState` takes `projectsDone`/`contributor`/`badges` from the server and queues each new milestone reward once (`community.claimed`). App.jsx `syncCommunity` resends pending entries (idempotent by request ID) and polls `/api/community/state`. Bonus allMult × (1 + 0.03 · projectsDone) for contributors in bonuses.js
  - `events.js` — missions completion, random events, achievements, prestige milestones, bug anomaly
  - `cyberEvents.js` — interactive pop-up events
  - `decisions.js` — choice events (`data/decisions.js`), rendered in the same top-right overlay as cyber events
  - `stocks.js` — server-driven stock market client; held shares give a per-resource production bonus (`dividendBonus`, +0.01%/share, cap +50%) applied in `computeBonuses`. Trading price = server price × `priceScale()` (by highest tech tier of the run, `PRICE_SCALE_BY_TIER`); holdings reset on refactor
  - `themeEngine.js` — accent theme by progress (early/mid/late)
- `src/data/` — static content: `buildings.js` (46 buildings, categories, `milestoneMult`), `techs.js` (45 techs in 6 tiers; `TECH_TIERS[].chapter` = funding round that unlocks the tier, a tech's own `chapter` overrides it), `chapters.js` (7 funding rounds: goals, rewards, unlock texts), `lab.js` (lab projects: key projects per round, one-time upgrades, repeatables; `mandate` = only while that mandate is active, `unlockMandate` = endless project unlocked by a mandate, `maxLevel`), `mandates.js` (3 board mandates, budget/sprint/lab constants), `projects.js` (optional `chapter`, `manual` = skipped by auto-deploy), `artifacts.js`, `chips.js`, `quests.js` (35 quests; `since: 7` marks quests inserted in v7 for the questIndex migration), `daily.js` (streak/ticket/coffee constants, `dayKey`), `challenges.js` (6 sprints, board sprints, weekly sprint pool), `community.js` (package types, community bonus, milestone boost, weekly categories), `effects.js` (bonus functions), `events.js` (random event pool), `decisions.js` (choice events), `stocks.js` (stock list + dividend constants), `misc.js` (resources, `zeroResources()`, worlds, foci, doctrines, ops modes, protocols, missions, achievements, chronicle upgrades, prestige milestones, `COLONY_MAX_LEVEL`)
- `src/lib/` — `api-client.js` (HTTP to backend, node-safe), `format.js`, `icons.js` (SVG sprite lookup; sprite lives in `index.html`), `sanitize.js`, `toast.js`, `settings.js` (per-device settings in localStorage, not part of the save), `desktopNotify.js` (opt-in browser notifications while the tab is hidden: `desktopNotifyEvents` derives lab/coffee/new-day/mission times from the save, App.jsx arms it on visibilitychange)
- `src/index.css` — the design system (CSS variables, layout, components). No other stylesheet.

### Economy model (important when balancing)

- Producers add output every tick. Converters consume **real stock** (plus what was produced in the same step) and run proportionally when input is short (`utilization` < 1 → shown as "gedrosselt").
- Converter inputs are scaled by `converterInputMult × allMult`; outputs by `resourceMult(out)`. This keeps `allMult` from compounding along converter chains.
- Building milestones: output ×2 at 10/25/50/100/200/300/400/500 owned (`MILESTONE_STEPS`).
- Cost growth 1.15 per purchase (modifiers 1.6), soft cap ×1.03 per level above 100. Modifier effects cap at 20 units (`MODIFIER_CAP`), colonies at 8 (`MAX_COLONIES`), team synergy at +200%.
- Prestige XP = `6 · ∛(runScrap / 1e7) · structBonus · prestigeGainMult` (`prestigeGainRaw` in actions.js). A refactor needs `minPrestigeGain()` = max(10, 2 % of `stats.xpEarned`) XP (`canPrestige`); sprint starts are exempt. `stats.xpEarned` (all XP ever earned) drives the XP milestones/achievements, round goals and the leaderboard; the refactor *count* is only used for quests and anti-cheat.
- Funding rounds (Garage → Seed → Series A → B → C → IPO → Börsennotiert) gate tech tiers and content: tier 4 from Seed, tier 5 from Series A, tier 6 from Series B/C. Round goals combine XP earned, sprints, standups, a release and the round's key lab project; completed rounds grant permanent rewards (`reward` in chapters.js, applied in `computeBonuses`). Existing techs/releases are never removed; migrations derive the starting round from existing progress.
- Chronicle upgrades that boost production or reduce costs act additively per level (`1 + x · level`), cost growth `CHRONICLE_COST_GROWTH` = 1.3; multiplicative levels made XP → production → XP explode. Lab costs are minutes of current production (Hype/Legacy Code), capped at half the current stock.
- Ticket targets and daily rewards scale with current gross production (minutes of output), so they stay relevant at any stage; lifetime counters for them live in `stats` (`hiresTotal`, `techsLearned`, `bugsFixed`, `stockTrades`).
- Rates cache: `state.cache.rates[res]` = net/s, plus `__produced`, `__consumed`, `__utilization`, `__starved`. Read it through `currentRates()` / `currentBonuses()` (bonuses.js), which fall back to a fresh computation when the cache is empty; never read `state.cache.*` directly.
- Automation runs 4× per second of game time (`AUTO_HZ` in tick.js, at most 4 passes per `processTick` call, so offline steps stay cheap); auto-hire buys at most one unit per building per pass. The threshold checks (achievements, milestones, quests via `runProgressChecks()`) run once per second inside `processTick`. With `opts.offline` the checks are skipped and the caller runs `runProgressChecks(true)` once afterwards.

### Balancing

`scripts/sim.mjs` (`npm run sim`) plays the game with a bot on the real engine: it stubs `localStorage`/`fetch`, mocks `Date.now` and seeds `Math.random` before importing, then calls `processTick(1, { silent: true, auto: true, offline: true })` + `runProgressChecks(true)` per second. The bot clicks, buys via `bestInvestmentId`, researches, releases, founds colonies, runs missions, protocols, stocks, standup/coffee and sprints, and spends XP. It refactors when the gain covers the XP still missing for the current round's goal, or when XP/min drops (and the gain is ≥ 10 XP and ≥ 50 % of XP earned so far).

- Models: `active` (continuous), `daily` (two 20-min sessions per day at 08:00/20:00 UTC, gaps via `simulateOffline`), `save --save <file>` (a real save, then daily). One child process per seed; the report prints median and range per milestone plus PASS/FAIL against `TARGETS` in the script.
- Calibration: `--goals a,b,…` overrides the XP goals of rounds 0, 1, … in memory, `--hold N` keeps round N from completing so the XP rate inside it can be measured. The XP goals in chapters.js were set this way (~4 days per round; Series B/C raised to 2.8e8/7e8 after the lab queue made the lab ~90 % busy). `--noqueue` runs the bot without the lab queue for comparisons. `--postgame N` keeps playing N days after the IPO (bot takes mandates in data order, deposits at session end, starts the board sprint on its next refactor); `--budget h,l` overrides the mandate budget — 6e21/3e21 with growth 1.15 gives ~5.5/8/8 days per mandate. Lab idle share is measured from the actual run intervals (`recordLabRuns`), so queued projects that start retroactively during an absence count; the bot plans follow-ups only at the end of a session.
- The bot is faster than a human (it buys optimally every 5 s), so its times are a lower bound.
- Target pacing: first tech < 2 min, tier 2 by ~20 min, first refactor after 1–2 h active; a daily player reaches the IPO on day 18–25 (never before day 16), no round shorter than a day, lab slots < 30 % idle.

### Backend (Express + SQLite)

- `backend/server.js` — Express app; serves `dist/` as SPA, mounts API routes
- `backend/db.js` — SQLite3 init (`users` table: `username`, `password_hash`, `game_save` JSON blob, `prestige_score`, `total_scrap`, flags; community tables), statements serialized, `db.ready` promise
- `backend/routes/auth.js` — `POST /api/auth/register`, `POST /api/auth/login`; JWT (7-day expiry)
- `backend/routes/game.js` — save/load/leaderboard/profile + admin endpoints; save validation reads `resources`, `stats.lifetime`, `stats.prestigeCount`, `stats.total.scrap`, `stats.xpEarned`, `stats.lastSave` — keep those shapes stable. `/save` stores `xp_earned` (leaderboard order) and `save_version`, and rejects saves with a lower `version` than stored (409, stale tab)
- `backend/routes/chat.js`, `backend/routes/stocks.js`, `backend/lib/stockMarket.js` — global chat and shared stock market (mean-reverting random walk per 5-min tick, a history point every 30 min for a 24 h chart)
- `backend/lib/community.js` + `backend/routes/community.js` — weekly ranking and open-source project. `recordWeekly` (called after every `/save`) upserts `weekly_stats` (never decreasing; baseline from the previous week, time-weighted lab slots); `closeDueWeeks` (startup, every minute, before `/state`) writes `weekly_awards` and `weeks_closed` idempotently and posts one chat message per week. Project chain in `community_projects` (goal = 20 × max(2, active accounts), fixed at start, names in `lib/communityProjects.js`), `community_contributions` (`request_id` UNIQUE → retries are idempotent), `community_quota` (3 per Vienna day, max 9). All write flows run through an in-process promise mutex (`exclusive`); never call an exclusive function inside another. `db.ready` resolves when all tables exist; market and community init wait for it

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
