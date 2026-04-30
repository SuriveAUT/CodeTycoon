# CodeTycoon

**Baue dein Tech-Imperium — von der Garage bis zur KI-Monopolstellung.**

Ein browserbasiertes Idle-/Incremental-Game mit Startup-Thematik, persistentem Cloud-Save, globalem Leaderboard und tiefem Progression-System.

**[► Jetzt spielen auf game.fersd.com](https://game.fersd.com)**

---

## Screenshots

> *Übersicht-, Team-, Forschungs- und Prestige-Tab — alle in einem Dark-UI mit deutschem Interface.*

---

## Features

### Kernmechaniken
- **Idle-Loop** — Ressourcen fließen auch wenn du weg bist (Offline-Progression bis zu 12h+)
- **Manuelles Klicken** — Leertaste oder Klick-Button für direkten Scrap-Boost
- **Autosave** — Spielstand wird automatisch lokal gespeichert
- **Tastenkürzel** — `B` Team · `R` Forschung · `C` Büros · `E` Reisen · `P` Releases · `M` Börse · `S` Prestige · `A` Account · `O` Übersicht

### Ressourcen (8)
| Ressource | Anzeigename | Rolle |
|-----------|-------------|-------|
| `scrap` | Code | Hauptwährung, produziert vom Dev-Team |
| `energy` | Revenue | Kaufkraft, produziert durch Sales |
| `alloy` | Bugs | Zwischenprodukt aus QA-Konvertern |
| `components` | Module | Zwischenprodukt für Marketing |
| `data` | Users | Konvertiert zu Ideas |
| `research` | Ideas | Schaltet Technologien frei |
| `influence` | Hype | Prestige-relevante Leitwährung |
| `relics` | Legacy Code | Seltene Drops, für Artefakte |

### Gebäude (42 Einträge, 7 Kategorien)
Jedes Gebäude skaliert mit einem Wachstumsfaktor (×1.17–1.30 pro Kauf). Milestone-Boni ab je 10 Stück (+15% Output). Drei Typen:
- **Producer** — produzieren Ressourcen passiv
- **Converter** — wandeln eine Ressource in eine andere um
- **Modifier** — schalten globale Boni oder Slots frei

Kategorien: *Dev Team · QA & DevOps · Sales & Ads · Marketing & R&D · Social Media · Management · C-Level*

### Forschung (39 Techs)
Linearer Tech-Baum von `Frontend Basics` bis `AGI Completion`. Jedes Tech schaltet neue Gebäude, Passivboni oder Spielsysteme frei. Voraussetzungs-Ketten erzwingen strategische Reihenfolge.

Auswahl:
`TypeScript Static` · `React Framework` · `Docker Containers` · `CI/CD Pipelines` · `Microservices Arch` · `Kubernetes Orch` · `Machine Learning` · `Generative AI` · `AGI Completion`

### Megaprojekte (10)
Einmalige Langzeit-Investitionen mit dauerhaften Welteffekten:

| Projekt | Beschreibung |
|---------|-------------|
| Todo App | Erstes MVP. Niemand braucht es wirklich. |
| Tech Blog | Content is King (manchmal). |
| Freelance Portal | Verbindet Talente mit Auftraggebern. |
| Social Network | Daten sind das neue Öl. |
| Crypto Exchange | Finanzielle Innovation oder Chaos? |
| B2B SaaS | Enterprise-Verträge mit 24 Monaten Laufzeit. |
| Metaverse Project | VR-Büros, die niemand betreten will. |
| Stack Overflow Clone | Endlich: Alle Antworten von 2009. |
| Operating System | Das Fundament. Alles hängt davon ab. |
| Internet Three | Endspiel-Projekt. Dezentralisiert alles. |

### Kolonien & Expeditionen
- **Kolonien** — Bürostandorte mit Fokus-Einstellung (Crunch Time / Brainstorming / Refactoring / Diplomatie / Relics / Stabilität) und Stabilitätswert
- **Expeditionen** — zeitgesteuerte Missionen mit Ressourcenbelohnungen, skalieren mit Fleet-XP und Kolonien
- **Welten** — 6 verschiedene Standorte (Mamas Keller, Neo-Berlin, Silicon Valley, Night-City, Neo-Tokyo, Lagos Tech Hub)

### Prestige — Hard Refactor
Setzt den Lauf zurück und vergibt **XP** (Chronicle Points). Erhalten bleiben:
- Artefakte & Errungenschaften
- Mainframe-Chips
- Chronicle-Upgrades (alle Level)
- Lebenszeit-Statistiken

**Chronicle-Upgrades (11):** Dauerhaft investierbare XP-Upgrades — Clean Architecture, Async Workflow, Management-Overhead, Seed Funding, Remote-First, Tech Debt Mastery, Series A, IPO, 4-Tage-Woche, Synergie-Effekte, 10x Typist

**Prestige-Meilensteine (12):** Einmal freigeschaltet, für immer aktiv — basieren auf Lifetime-Klicks, Scrap, Forschung, Expeditionen und Prestige-Anzahl

### Artefakte (12)
Passive Dauerboni, durch Expeditionen oder seltene Drops erspielt:

*Floppy Disk · Kaffeeversorgung · Rubber Duck · Stack Overflow Buch · Mechanische Tastatur · Monitor-Setup · Premium Laptop · Vim Config · Framework Cache · Git Cheat Sheet · SSD-Upgrade · Seniority Badge*

### Mainframe & Chips (10)
Ausrüstbare Chips für den Mainframe — jeder mit einzigartigem Effekt und optionalem Tradeoff. Slots über Prestige erweiterbar.

### Dynamisches Ereignissystem
Zufällige Anomalie-Ereignisse mit positiven/negativen Effektmodifikatoren. Cyber-Events mit Klick-Interaktion. `eventResist`-Wert reduziert die Häufigkeit.

### Börse
Geteilter Echtzeit-Aktienmarkt (serverbasiert). Kurse ändern sich durch Trades aller Spieler. Dividenden, Kurshistorie, Buy/Sell direkt im Interface.

### Doctrine & Protokolle
- **Doctrines** — Passiver Spielstil-Entscheid nach erstem Prestige
- **Operations-Modi** — Efficiency / Balanced / Overdrive / Survey — beeinflussen Ressourcen-Throughput
- **Protokolle** — temporäre Aktivierungen mit Cooldown

### Automation
- **Auto-Build** — kauft Gebäude automatisch; Converter werden erst gebaut wenn der Input-Ressourcen-Netto-Fluss ausreichend positiv ist (verhindert Ressourcen-Death-Spiral)
- **Auto-Research** — researcht die nächste verfügbare Tech
- **Auto-Expeditions** — startet Missionen automatisch
- **Auto-Projects** — baut Megaprojekte automatisch

### Cloud Save & Account
- JWT-Authentifizierung (7 Tage gültig)
- Cloud-Save mit Konfliktauflösung (neuester Timestamp gewinnt)
- Globales Leaderboard (nach Prestige-Score & Total Scrap)
- Spieler-Profil öffentlich einsehbar

---

## Tech Stack

| Schicht | Technologie |
|---------|-------------|
| Frontend | [SolidJS](https://www.solidjs.com/) + [Vite](https://vitejs.dev/) |
| Backend | [Express.js](https://expressjs.com/) + SQLite3 |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Deployment | Docker (Multi-Stage-Build) · PM2 |
| Sprache | Deutsch (UI) · JavaScript (ESM) |

### Projektstruktur
```
├── src/
│   ├── components/
│   │   ├── App.jsx          # Root-Komponente, Game Loop, Modal-System
│   │   └── renderers.js     # DOM-Render-Funktionen pro Tab
│   ├── engine/
│   │   ├── loop.js          # Tick-Orchestrierung
│   │   ├── tick.js          # Pro-Frame Ressourcenproduktion
│   │   ├── actions.js       # Spieler-Aktionen (kaufen, forschen, prestige)
│   │   ├── automation.js    # Auto-Build, Auto-Research etc.
│   │   ├── events.js        # Anomalie-Ereignisse, Errungenschaften, Meilensteine
│   │   ├── market.js        # Markt-Mechaniken
│   │   └── stocks.js        # Börse
│   ├── store/
│   │   ├── gameState.js     # Zentraler SolidJS-Store
│   │   └── bonuses.js       # Bonus-Berechnung (computeBonuses)
│   ├── data/                # Statische Spielinhalte
│   │   ├── buildings.js     # 42 Gebäude
│   │   ├── techs.js         # 39 Technologien
│   │   ├── projects.js      # 10 Megaprojekte
│   │   ├── artifacts.js     # 12 Artefakte
│   │   ├── chips.js         # 10 Mainframe-Chips
│   │   ├── effects.js       # Bonus-Effekt-Definitionen
│   │   ├── misc.js          # Worlds, Foci, Achievements, Chronicle, Milestones
│   │   └── i18n.js          # Deutsche UI-Strings
│   └── lib/
│       ├── api-client.js    # HTTP-Client (Fetch + Retry + Auth)
│       ├── format.js        # Zahlenformatierung (fmt, fmtSec)
│       ├── icons.js         # Icon-Mapping
│       ├── sanitize.js      # HTML-Escape
│       └── toast.js         # Toast-Notification-System
└── backend/
    ├── server.js            # Express-App, SPA-Serving
    ├── db.js                # SQLite-Init
    └── routes/
        ├── auth.js          # /api/auth/register · /api/auth/login
        ├── game.js          # /api/game/* (save, load, leaderboard, admin)
        ├── chat.js          # /api/chat/*
        └── stocks.js        # /api/stocks/*
```

---

## Lokal starten

**Voraussetzungen:** Node.js 18+

```bash
# 1. Abhängigkeiten installieren
npm install
cd backend && npm install && cd ..

# 2. Umgebungsvariablen anlegen
cp .env.example .env
# Optional: VITE_API_BASE_URL und VITE_API_TIMEOUT_MS anpassen

# 3. Fullstack starten (Frontend :5173, Backend :3005)
npm run dev
```

Dann im Browser: `http://localhost:5173`

### Nur Frontend (ohne Backend)
```bash
npm run dev
# Kein Login, kein Cloud-Save — alles läuft lokal im Browser
```

### Production Build
```bash
npm run build        # dist/ erstellen
cd backend && npm start   # Backend serviert dist/ statisch auf :3005
```

### Docker
```bash
docker build -t codetycoon .
docker run -p 3005:3005 codetycoon
```

Das Multi-Stage-Dockerfile baut das Frontend, installiert Backend-Produktionsabhängigkeiten und startet `node backend/server.js`.

---

## Umgebungsvariablen

| Variable | Default | Beschreibung |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:3005/api` | API-Basis-URL für das Frontend |
| `VITE_API_TIMEOUT_MS` | `10000` | Request-Timeout in ms |
| `JWT_SECRET` | `change_me` | Geheimnis für JWT-Signierung |
| `PORT` | `3005` | Backend-Port |
| `ADMIN_USERNAME` | — | Benutzername mit Admin-Rechten |

---

## Spielen

**[game.fersd.com](https://game.fersd.com)** — kein Download, kein Install, läuft direkt im Browser.

- Kein Account nötig zum Starten
- Account anlegen für Cloud-Save, Leaderboard-Eintrag und Spielstand-Sync über Geräte

---

## Lizenz

ISC
