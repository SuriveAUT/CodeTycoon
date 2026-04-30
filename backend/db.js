const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
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
    }
});

module.exports = db;
