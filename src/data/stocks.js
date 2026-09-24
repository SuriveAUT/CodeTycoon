// stocks.js – Aktien der Ressourcen-Börse. Kurse kommen vom Server, Boni werden lokal berechnet.
// Dividende: jede Aktie erhöht die Produktion ihrer Ressource um DIVIDEND_PER_SHARE (Anteil), gedeckelt.
export const DIVIDEND_PER_SHARE = 0.0001; // +0,01% je Aktie
export const MAX_DIVIDEND_BONUS = 0.5;    // max. +50% je Ressource

export const STOCKS = [
  {
    id: 'stk_scrap',
    name: 'StackOverflow GmbH',
    ticker: 'SOF',
    resource: 'scrap',
    basePrice: 50,
    volatility: 0.20,
  },
  {
    id: 'stk_energy',
    name: 'Venture Capital AG',
    ticker: 'VCA',
    resource: 'energy',
    basePrice: 100,
    volatility: 0.15,
  },
  {
    id: 'stk_alloy',
    name: 'Bug Tracker Corp.',
    ticker: 'BTC',
    resource: 'alloy',
    basePrice: 80,
    volatility: 0.26,
  },
  {
    id: 'stk_components',
    name: 'npm Registry ETF',
    ticker: 'NPM',
    resource: 'components',
    basePrice: 160,
    volatility: 0.22,
  },
  {
    id: 'stk_data',
    name: 'DAU Analytics GmbH',
    ticker: 'DAU',
    resource: 'data',
    basePrice: 220,
    volatility: 0.28,
  },
  {
    id: 'stk_research',
    name: 'Innovation Labs SE',
    ticker: 'INN',
    resource: 'research',
    basePrice: 380,
    volatility: 0.32,
  },
  {
    id: 'stk_influence',
    name: 'Social Media Fonds',
    ticker: 'SMF',
    resource: 'influence',
    basePrice: 200,
    volatility: 0.38,
  },
  {
    id: 'stk_relics',
    name: 'COBOL Heritage AG',
    ticker: 'COB',
    resource: 'relics',
    basePrice: 900,
    volatility: 0.45,
  },
];
