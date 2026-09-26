// stocks.js – Ressourcen-Börse (Kurse kommen vom Backend — alle Spieler sehen denselben Markt)
import { state, setState } from '../store/gameState.js';
import { AstraforgeAPI } from '../lib/api-client.js';

import { STOCKS, DIVIDEND_PER_SHARE, MAX_DIVIDEND_BONUS, dividendBonusForShares } from '../data/stocks.js';
import { TECHS } from '../data/techs.js';
export { STOCKS, DIVIDEND_PER_SHARE, MAX_DIVIDEND_BONUS };

// Kurse skalieren mit der höchsten gelernten Tech-Stufe des Runs, damit der Dividenden-Cap mitten in jeder
// Stufe etwa 30 Minuten Revenue kostet (kalibriert mit npm run sim). Der Server liefert Kurse auf Basisniveau.
export const PRICE_SCALE_BY_TIER = [1, 1, 2, 500, 2e5, 4e7, 4e9];

export function priceScale(s = state) {
  const tier = (s.techs || []).reduce((m, id) => Math.max(m, TECHS.find(t => t.id === id)?.tier || 0), 0);
  return PRICE_SCALE_BY_TIER[Math.min(tier, PRICE_SCALE_BY_TIER.length - 1)];
}

export const BROKER_FEE = 0.05;
export const PRICE_UPDATE_INTERVAL = 5 * 60 * 1000; // Server tickt auch alle 5 Minuten


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

// Produktionsbonus (0..MAX_DIVIDEND_BONUS) einer Aktie aus dem gehaltenen Bestand.
export function dividendBonus(stockId, s = state) {
  return dividendBonusForShares((s.stocks || {})[stockId] || 0);
}

// Aktien bis zum Cap: wie viele Aktien fehlen noch bis +50%?
export function sharesToCap(stockId, s = state) {
  const owned = (s.stocks || {})[stockId] || 0;
  return Math.max(0, Math.ceil(MAX_DIVIDEND_BONUS / DIVIDEND_PER_SHARE) - owned);
}

// Kurs auf Basisniveau (wie vom Server, für Trend und Verlauf)
export function rawStockPrice(stockId) {
  return state.stockMarket?.prices?.[stockId] || STOCKS.find(s => s.id === stockId)?.basePrice || 0;
}

// Handelskurs in Revenue
export function getStockPrice(stockId) {
  return rawStockPrice(stockId) * priceScale();
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
  setState('stats', 'stockTrades', (state.stats.stockTrades || 0) + 1);
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
  setState('stats', 'stockTrades', (state.stats.stockTrades || 0) + 1);
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

// Aktive Dividenden-Boni je Ressource (nur > 0)
export function totalDividendBonus() {
  const byResource = {};
  STOCKS.forEach(st => {
    const bonus = dividendBonus(st.id);
    if (bonus > 0) byResource[st.resource] = bonus;
  });
  return byResource;
}

export function timeUntilNextPriceUpdate() {
  const lastUpdate = Number(state.stockMarket?.lastUpdate) || 0;
  if (!lastUpdate || isNaN(lastUpdate)) return null; // noch nicht vom Server geladen
  return Math.max(0, PRICE_UPDATE_INTERVAL - (Date.now() - lastUpdate));
}
