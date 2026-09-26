// Shared stock market engine — single source of truth for all players
const db = require('../db');

const STOCKS = [
  { id: 'stk_scrap',      basePrice: 50,  volatility: 0.20 },
  { id: 'stk_energy',     basePrice: 100, volatility: 0.15 },
  { id: 'stk_alloy',      basePrice: 80,  volatility: 0.26 },
  { id: 'stk_components', basePrice: 160, volatility: 0.22 },
  { id: 'stk_data',       basePrice: 220, volatility: 0.28 },
  { id: 'stk_research',   basePrice: 380, volatility: 0.32 },
  { id: 'stk_influence',  basePrice: 200, volatility: 0.38 },
  { id: 'stk_relics',     basePrice: 900, volatility: 0.45 },
];

const UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const HISTORY_EVERY_TICKS = 6;             // one history point per 30 minutes …
const MAX_HISTORY = 48;                    // … for a 24 h chart; the last point is always the live price
const SIGMA_PER_TICK = 0.06;               // log-price noise per tick = volatility × 0.06 (roughly ±10–25 % per day)
const MEAN_REVERSION = 0.005;              // pull toward base price per tick (half-life ~11 h)

let ticksSinceHistory = 0;

// In-memory cache — populated from DB on startup
const cache = {};

function normalRandom() {
  // Box-Muller transform for normally distributed random variable
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Mean-reverting random walk in log space (Ornstein-Uhlenbeck), so prices swing noticeably from day to day
// but keep returning to their base price.
function nextPrice(stock, currentPrice, buyVol, sellVol) {
  const sigma = stock.volatility * SIGMA_PER_TICK;
  const logRatio = Math.log(currentPrice / stock.basePrice);

  // Supply/demand: net buy pressure moves price up, net sell pressure moves it down (max ±4%)
  const totalVol = buyVol + sellVol;
  const pressure = totalVol > 0 ? ((buyVol - sellVol) / totalVol) * 0.04 : 0;

  const nextLog = logRatio * (1 - MEAN_REVERSION) + sigma * normalRandom() - 0.5 * sigma * sigma + pressure;
  const raw = stock.basePrice * Math.exp(nextLog);
  return Math.max(stock.basePrice * 0.08, Math.min(stock.basePrice * 10, raw));
}

function runTick() {
  const now = Date.now();
  ticksSinceHistory += 1;
  const newPoint = ticksSinceHistory >= HISTORY_EVERY_TICKS;
  if (newPoint) ticksSinceHistory = 0;
  STOCKS.forEach(stock => {
    const entry = cache[stock.id];
    if (!entry) return;

    const price = nextPrice(stock, entry.price, entry.buyVol, entry.sellVol);
    // Start a new point every HISTORY_EVERY_TICKS ticks, otherwise keep the last point at the live price
    const history = newPoint || !entry.history.length
      ? [...entry.history.slice(-(MAX_HISTORY - 1)), price]
      : [...entry.history.slice(0, -1), price];

    cache[stock.id] = { price, history, buyVol: 0, sellVol: 0, lastUpdated: now };

    db.run(
      'UPDATE stock_market SET price=?, history=?, buy_volume=0, sell_volume=0, last_updated=? WHERE stock_id=?',
      [price, JSON.stringify(history), now, stock.id]
    );
  });
  console.log('[Börse] Kurse aktualisiert:', new Date().toISOString());
}

function initMarket() {
  db.all('SELECT * FROM stock_market', [], (err, rows) => {
    if (err) { console.error('[Börse] DB read error:', err); return; }

    const now = Date.now();
    const inDb = new Set((rows || []).map(r => r.stock_id));

    // Load existing data into cache
    (rows || []).forEach(row => {
      let history = [];
      try { history = JSON.parse(row.history); } catch (_) {}
      cache[row.stock_id] = {
        price: row.price,
        history,
        buyVol: row.buy_volume || 0,
        sellVol: row.sell_volume || 0,
        lastUpdated: row.last_updated || 0,
      };
    });

    // Insert any new stocks not yet in DB
    const toInsert = STOCKS.filter(s => !inDb.has(s.id));
    toInsert.forEach(s => {
      const initPrice = s.basePrice * (1 + (Math.random() - 0.5) * 0.2);
      const history = [initPrice];
      cache[s.id] = { price: initPrice, history, buyVol: 0, sellVol: 0, lastUpdated: now };
      db.run(
        'INSERT OR IGNORE INTO stock_market (stock_id, price, history, buy_volume, sell_volume, last_updated) VALUES (?,?,?,0,0,?)',
        [s.id, initPrice, JSON.stringify(history), now]
      );
    });

    // Determine next tick time: align to the last tick across all stocks
    const oldestUpdate = Math.min(...STOCKS.map(s => cache[s.id]?.lastUpdated || 0));
    const elapsed = now - oldestUpdate;

    if (elapsed >= UPDATE_INTERVAL_MS || oldestUpdate === 0) {
      // Overdue — tick immediately
      runTick();
      setInterval(runTick, UPDATE_INTERVAL_MS).unref();
    } else {
      // Wait until next scheduled tick, then tick regularly
      const delay = UPDATE_INTERVAL_MS - elapsed;
      setTimeout(() => {
        runTick();
        setInterval(runTick, UPDATE_INTERVAL_MS).unref();
      }, delay).unref();
    }

    console.log('[Börse] Markt initialisiert. Nächstes Update in', Math.round((UPDATE_INTERVAL_MS - (now - oldestUpdate)) / 1000) + 's');
  });
}

function getState() {
  const prices = {}, history = {};
  let lastUpdated = 0;
  STOCKS.forEach(s => {
    const e = cache[s.id];
    if (e) {
      prices[s.id] = e.price;
      history[s.id] = e.history;
      if (e.lastUpdated > lastUpdated) lastUpdated = e.lastUpdated;
    }
  });
  return { prices, history, lastUpdated };
}

function recordTrade(stockId, shares, direction) {
  const entry = cache[stockId];
  if (!entry) return;
  if (direction === 'buy') {
    entry.buyVol += shares;
    db.run('UPDATE stock_market SET buy_volume = buy_volume + ? WHERE stock_id = ?', [shares, stockId]);
  } else if (direction === 'sell') {
    entry.sellVol += shares;
    db.run('UPDATE stock_market SET sell_volume = sell_volume + ? WHERE stock_id = ?', [shares, stockId]);
  }
}

module.exports = { initMarket, getState, recordTrade };
