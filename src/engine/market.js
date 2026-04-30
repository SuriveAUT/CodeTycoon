// market.js – Dark Web Market mit schwankenden Kursen
import { state, setState, log } from '../store/gameState.js';
import { rand } from '../lib/format.js';

export const SELL_SPREAD = 0.75; // selling gives 25% less back

export const MARKET_PAIRS = [
  // Dev-Börse
  { id: 'scrap_alloy',       from: 'scrap',      to: 'alloy',      baseRate: 5,   label: 'Code ⇌ Bugs',          category: 'Dev-Börse' },
  { id: 'alloy_components',  from: 'alloy',      to: 'components', baseRate: 3,   label: 'Bugs ⇌ Module',        category: 'Dev-Börse' },
  { id: 'scrap_components',  from: 'scrap',      to: 'components', baseRate: 18,  label: 'Code ⇌ Module',        category: 'Dev-Börse' },
  { id: 'components_scrap',  from: 'components', to: 'scrap',      baseRate: 0.06,label: 'Module ⇌ Code',        category: 'Dev-Börse' },

  // Business-Börse
  { id: 'energy_influence',  from: 'energy',     to: 'influence',  baseRate: 8,   label: 'Revenue ⇌ Hype',       category: 'Business-Börse' },
  { id: 'influence_energy',  from: 'influence',  to: 'energy',     baseRate: 4,   label: 'Hype ⇌ Revenue',       category: 'Business-Börse' },
  { id: 'scrap_energy',      from: 'scrap',      to: 'energy',     baseRate: 2,   label: 'Code ⇌ Revenue',       category: 'Business-Börse' },
  { id: 'energy_research',   from: 'energy',     to: 'research',   baseRate: 10,  label: 'Revenue ⇌ Ideas',      category: 'Business-Börse' },
  { id: 'components_energy', from: 'components', to: 'energy',     baseRate: 6,   label: 'Module ⇌ Revenue',     category: 'Business-Börse' },

  // Data-Börse
  { id: 'research_data',     from: 'research',   to: 'data',       baseRate: 2,   label: 'Ideas ⇌ Users',        category: 'Data-Börse' },
  { id: 'data_influence',    from: 'data',       to: 'influence',  baseRate: 14,  label: 'Users ⇌ Hype',         category: 'Data-Börse' },
  { id: 'research_influence',from: 'research',   to: 'influence',  baseRate: 6,   label: 'Ideas ⇌ Hype',         category: 'Data-Börse' },
  { id: 'influence_data',    from: 'influence',  to: 'data',       baseRate: 5,   label: 'Hype ⇌ Users',         category: 'Data-Börse' },

  // Legacy-Börse
  { id: 'data_relics',       from: 'data',       to: 'relics',     baseRate: 60,  label: 'Users ⇌ Legacy Code',  category: 'Legacy-Börse' },
  { id: 'relics_research',   from: 'relics',     to: 'research',   baseRate: 0.5, label: 'Legacy ⇌ Ideas',       category: 'Legacy-Börse' },
  { id: 'relics_data',       from: 'relics',     to: 'data',       baseRate: 0.8, label: 'Legacy ⇌ Users',       category: 'Legacy-Börse' },
];

const RATE_UPDATE_INTERVAL = 30 * 60 * 1000; // 30 minutes
const MAX_HISTORY = 8;

export function initMarketRates() {
  const rates = {};
  const history = {};
  MARKET_PAIRS.forEach(pair => {
    const variance = 1 + (Math.random() - 0.5) * 0.3;
    rates[pair.id] = pair.baseRate * variance;
    history[pair.id] = [rates[pair.id]];
  });
  return { rates, history, lastUpdate: Date.now() };
}

export function generateNewRates(oldRates) {
  const rates = {};
  MARKET_PAIRS.forEach(pair => {
    const old = oldRates[pair.id] || pair.baseRate;
    // Random walk: ±15-40% change
    const change = 1 + (Math.random() - 0.5) * 0.6;
    // Clamp to 0.3x–3x of base rate
    rates[pair.id] = Math.max(pair.baseRate * 0.3, Math.min(pair.baseRate * 3, old * change));
  });
  return rates;
}

export function tickMarket(now) {
  const lastUpdate = Number(state.market?.lastUpdate) || 0;

  if (!state.market || lastUpdate === 0 || isNaN(lastUpdate)) {
    const init = initMarketRates();
    setState('market', { rates: init.rates, history: init.history, lastUpdate: init.lastUpdate });
    return;
  }

  // Ensure all current pairs have rates + history (handles newly added pairs on existing saves)
  const existingRates = state.market.rates || {};
  const existingHistory = state.market.history || {};
  let patched = false;
  const patchedRates = { ...existingRates };
  const patchedHistory = { ...existingHistory };
  MARKET_PAIRS.forEach(pair => {
    if (!patchedRates[pair.id]) {
      patchedRates[pair.id] = pair.baseRate * (1 + (Math.random() - 0.5) * 0.3);
      patchedHistory[pair.id] = [patchedRates[pair.id]];
      patched = true;
    }
  });
  if (patched) setState('market', { rates: patchedRates, history: patchedHistory, lastUpdate });

  if (now - lastUpdate >= RATE_UPDATE_INTERVAL || now < lastUpdate) {
    const newRates = generateNewRates(state.market.rates || {});
    const newHistory = {};
    MARKET_PAIRS.forEach(pair => {
      const oldHist = state.market.history?.[pair.id] || [];
      newHistory[pair.id] = [...oldHist.slice(-(MAX_HISTORY - 1)), newRates[pair.id]];
    });
    setState('market', { rates: newRates, history: newHistory, lastUpdate: now });
    log('📊 Dark Web Market: Neue Kurse verfügbar.');
  }
}

// direction: 'buy' = spend `from` to get `to`; 'sell' = spend `to` to get back `from`
export function executeTrade(pairId, amount, direction = 'buy') {
  const pair = MARKET_PAIRS.find(p => p.id === pairId);
  if (!pair) return false;
  const rate = state.market?.rates?.[pairId];
  if (!rate) return false;

  if (direction === 'buy') {
    const cost = amount * rate;
    if ((state.resources[pair.from] || 0) < cost) return false;
    setState('resources', pair.from, Math.max(0, (state.resources[pair.from] || 0) - cost));
    setState('resources', pair.to, (state.resources[pair.to] || 0) + amount);
    log(`📊 Kauf: ${Math.floor(cost)} ${pair.from} → ${Math.floor(amount)} ${pair.to}`);
  } else {
    // sell: pay `amount` of `to`, receive `amount * rate * SELL_SPREAD` of `from`
    if ((state.resources[pair.to] || 0) < amount) return false;
    const receive = amount * rate * SELL_SPREAD;
    setState('resources', pair.to, Math.max(0, (state.resources[pair.to] || 0) - amount));
    setState('resources', pair.from, (state.resources[pair.from] || 0) + receive);
    log(`📊 Verkauf: ${Math.floor(amount)} ${pair.to} → ${Math.floor(receive)} ${pair.from}`);
  }
  return true;
}

export function timeUntilNextUpdate() {
  const lastUpdate = Number(state.market?.lastUpdate) || 0;
  if (lastUpdate === 0 || isNaN(lastUpdate)) return 0;
  const t = RATE_UPDATE_INTERVAL - (Date.now() - lastUpdate);
  return Math.max(0, isNaN(t) ? 0 : t);
}
