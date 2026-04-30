// stocks.js – Ressourcen-Börse (Kurse kommen vom Backend — alle Spieler sehen denselben Markt)
import { state, setState } from '../store/gameState.js';
import { fmt } from '../lib/format.js';
import { AstraforgeAPI } from '../lib/api-client.js';

export const BROKER_FEE = 0.05;
export const PRICE_UPDATE_INTERVAL = 5 * 60 * 1000; // Server tickt auch alle 5 Minuten
const MAX_HISTORY = 24;

export const STOCKS = [
  {
    id: 'stk_scrap',
    name: 'StackOverflow GmbH',
    ticker: 'SOF',
    resource: 'scrap',
    basePrice: 50,
    dividendRate: 0.10,
    volatility: 0.20,
  },
  {
    id: 'stk_energy',
    name: 'Venture Capital AG',
    ticker: 'VCA',
    resource: 'energy',
    basePrice: 100,
    dividendRate: 0.04,
    volatility: 0.15,
  },
  {
    id: 'stk_alloy',
    name: 'Bug Tracker Corp.',
    ticker: 'BTC',
    resource: 'alloy',
    basePrice: 80,
    dividendRate: 0.07,
    volatility: 0.26,
  },
  {
    id: 'stk_components',
    name: 'npm Registry ETF',
    ticker: 'NPM',
    resource: 'components',
    basePrice: 160,
    dividendRate: 0.03,
    volatility: 0.22,
  },
  {
    id: 'stk_data',
    name: 'DAU Analytics GmbH',
    ticker: 'DAU',
    resource: 'data',
    basePrice: 220,
    dividendRate: 0.025,
    volatility: 0.28,
  },
  {
    id: 'stk_research',
    name: 'Innovation Labs SE',
    ticker: 'INN',
    resource: 'research',
    basePrice: 380,
    dividendRate: 0.012,
    volatility: 0.32,
  },
  {
    id: 'stk_influence',
    name: 'Social Media Fonds',
    ticker: 'SMF',
    resource: 'influence',
    basePrice: 200,
    dividendRate: 0.010,
    volatility: 0.38,
  },
  {
    id: 'stk_relics',
    name: 'COBOL Heritage AG',
    ticker: 'COB',
    resource: 'relics',
    basePrice: 900,
    dividendRate: 0.002,
    volatility: 0.45,
  },
];

// Fetch current prices from the backend and update local state.
// Fire-and-forget — if the server is unreachable, last known prices stay.
export async function fetchServerStockPrices() {
  try {
    const data = await AstraforgeAPI.getStockPrices();
    if (!data || !data.prices) return;

    // Transform server response { prices: {id: price}, history: {id: []}, lastUpdated }
    // into the shape the renderer expects: state.stockMarket = { prices, history, lastUpdate }
    const prices = {};
    const history = {};
    STOCKS.forEach(s => {
      const p = data.prices[s.id];
      const h = data.history?.[s.id];
      if (p !== undefined) prices[s.id] = p;
      if (h !== undefined) history[s.id] = h;
    });

    setState('stockMarket', {
      prices,
      history,
      lastUpdate: data.lastUpdated || Date.now(),
    });
  } catch (_) {
    // Server unreachable — keep last known prices
  }
}

export function tickStockDividends(dt) {
  const stocks = state.stocks || {};
  STOCKS.forEach(s => {
    const owned = stocks[s.id] || 0;
    if (owned > 0) {
      const gain = owned * s.dividendRate * dt;
      setState('resources', s.resource, (state.resources[s.resource] || 0) + gain);
    }
  });
}

export function getStockPrice(stockId) {
  return state.stockMarket?.prices?.[stockId] || STOCKS.find(s => s.id === stockId)?.basePrice || 0;
}

export function getOwnedShares(stockId) {
  return state.stocks?.[stockId] || 0;
}

export function buyStock(stockId, shares) {
  const stock = STOCKS.find(s => s.id === stockId);
  if (!stock || shares <= 0) return false;
  const price = getStockPrice(stockId);
  const totalCost = price * shares;
  if ((state.resources.energy || 0) < totalCost) return false;
  setState('resources', 'energy', Math.max(0, (state.resources.energy || 0) - totalCost));
  setState('stocks', stockId, getOwnedShares(stockId) + shares);
  // Report to backend so the trade influences the next global price tick
  AstraforgeAPI.recordStockTrade(stockId, shares, 'buy');
  return true;
}

export function sellStock(stockId, shares) {
  const stock = STOCKS.find(s => s.id === stockId);
  if (!stock) return false;
  const owned = getOwnedShares(stockId);
  const toSell = Math.min(shares, owned);
  if (toSell <= 0) return false;
  const price = getStockPrice(stockId);
  const revenue = price * toSell * (1 - BROKER_FEE);
  setState('stocks', stockId, owned - toSell);
  setState('resources', 'energy', (state.resources.energy || 0) + revenue);
  AstraforgeAPI.recordStockTrade(stockId, toSell, 'sell');
  return true;
}

export function portfolioValue() {
  let total = 0;
  const stocks = state.stocks || {};
  STOCKS.forEach(s => {
    total += (stocks[s.id] || 0) * getStockPrice(s.id);
  });
  return total;
}

export function totalDividendRate() {
  const stocks = state.stocks || {};
  const byResource = {};
  STOCKS.forEach(s => {
    const owned = stocks[s.id] || 0;
    if (owned > 0) byResource[s.resource] = (byResource[s.resource] || 0) + owned * s.dividendRate;
  });
  return byResource;
}

export function timeUntilNextPriceUpdate() {
  const lastUpdate = Number(state.stockMarket?.lastUpdate) || 0;
  if (!lastUpdate || isNaN(lastUpdate)) return null; // noch nicht vom Server geladen
  return Math.max(0, PRICE_UPDATE_INTERVAL - (Date.now() - lastUpdate));
}
