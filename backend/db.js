const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');

// db.ready erfüllt sich, sobald alle Tabellen und Spalten angelegt sind. Die Statements laufen serialisiert,
// damit ALTER TABLE nie vor CREATE TABLE ausgeführt wird (früher der Startup-Race bei einer neuen DB).
let resolveReady;
let rejectReady;
const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
        rejectReady(err);
        return;
    }
    console.log('Connected to the SQLite database.');

    db.serialize(() => {
        // Create users table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            game_save TEXT,
            prestige_score INTEGER DEFAULT 0,
            total_scrap REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating table', err.message);
            } else {
                console.log('Users table ready.');
            }
        });

        // Add anti-cheat columns if not yet present (safe to run multiple times)
        db.run('ALTER TABLE users ADD COLUMN server_last_save_at INTEGER DEFAULT 0', () => {});
        db.run('ALTER TABLE users ADD COLUMN flagged INTEGER DEFAULT 0', () => {});
        db.run('ALTER TABLE users ADD COLUMN flag_reason TEXT DEFAULT ""', () => {});
        // Rangliste nach verdienten XP; Save-Format-Version gegen veraltete Tabs
        db.run('ALTER TABLE users ADD COLUMN xp_earned REAL DEFAULT 0', () => {});
        db.run('ALTER TABLE users ADD COLUMN save_version INTEGER DEFAULT 0', () => {});

        db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('Error creating chat_messages table', err.message);
            else console.log('Chat table ready.');
        });

        db.run(`CREATE TABLE IF NOT EXISTS stock_market (
            stock_id TEXT PRIMARY KEY,
            price REAL NOT NULL,
            history TEXT NOT NULL DEFAULT '[]',
            buy_volume REAL DEFAULT 0,
            sell_volume REAL DEFAULT 0,
            last_updated INTEGER NOT NULL DEFAULT 0
        )`, (err) => {
            if (err) console.error('Error creating stock_market table', err.message);
            else console.log('Stock market table ready.');
        });

        // Wochenwertung (lib/community.js): Werte je Woche und Spieler, vergebene Abzeichen, abgeschlossene Wochen
        db.run(`CREATE TABLE IF NOT EXISTS weekly_stats (
            week_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            xp_start REAL NOT NULL,
            xp_now REAL NOT NULL,
            lab_start REAL NOT NULL,
            lab_now REAL NOT NULL,
            slot_ms REAL NOT NULL DEFAULT 0,
            slots INTEGER NOT NULL DEFAULT 1,
            last_at INTEGER NOT NULL,
            sprint_best REAL NOT NULL DEFAULT 0,
            PRIMARY KEY (week_id, user_id)
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS weekly_awards (
            week_id TEXT NOT NULL,
            category TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            value REAL NOT NULL,
            PRIMARY KEY (week_id, category, user_id)
        )`);
        db.run('CREATE TABLE IF NOT EXISTS weeks_closed (week_id TEXT PRIMARY KEY, closed_at INTEGER NOT NULL)');

        // Open-Source-Projekt: Projektkette, gebuchte Pakete (request_id macht Wiederholungen idempotent), Kontingent
        db.run(`CREATE TABLE IF NOT EXISTS community_projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            def_index INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            goal INTEGER NOT NULL,
            milestones_announced INTEGER NOT NULL DEFAULT 0,
            started_at INTEGER NOT NULL,
            completed_at INTEGER
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS community_contributions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            request_id TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL
        )`);
        db.run('CREATE INDEX IF NOT EXISTS idx_contrib_project ON community_contributions(project_id, user_id)');
        db.run('CREATE TABLE IF NOT EXISTS community_quota (user_id INTEGER PRIMARY KEY, balance INTEGER NOT NULL, day TEXT NOT NULL)');

        db.get('SELECT 1', (readyErr) => {
            if (readyErr) rejectReady(readyErr);
            else resolveReady();
        });
    });
});

db.ready = ready;

module.exports = db;
