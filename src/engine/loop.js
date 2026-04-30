import { state, setState, saveState } from '../store/gameState.js';
import { processTick } from './tick.js';
import { computeBonuses } from '../store/bonuses.js';
import { clamp, rand } from '../lib/format.js';
import { fetchServerStockPrices } from './stocks.js';

let lastFrame = performance.now();
let lastSave = 0;
let lastPriceFetch = 0;
let animFrameId = null;

const PRICE_POLL_INTERVAL = 30000; // 30 Sekunden

export function startGameLoop() {
  // Offline catch-up
  let offlineSec = (Date.now() - (state.stats.lastSave || Date.now())) / 1000;
  
  // Time travel detection (if time went backwards, or jumped more than 30 days into the future)
  if (offlineSec < 0 || offlineSec > 30 * 24 * 3600) {
    console.warn("Time anomaly detected. Resetting offline progress.");
    offlineSec = 0;
    saveState();
  }

  if (offlineSec > 3) {
    const b = computeBonuses();
    const cap = (b.offlineCapHours || 12) * 3600;
    const efficiency = b.offlineEfficiency || 0.5;
    const toCatchUp = Math.min(offlineSec, cap);

    // Add full time to lifetime (Arbeitszeit)
    setState('stats', 'lifetime', state.stats.lifetime + toCatchUp);

    const steps = Math.min(200, Math.ceil(toCatchUp / 2));
    const perStep = (toCatchUp / steps) * efficiency;
    for (let i = 0; i < steps; i++) {
      processTick(perStep, { silent: true, skipLifetime: true });
    }
  }

  lastFrame = performance.now();
  lastSave = performance.now();
  lastPriceFetch = 0; // force immediate fetch on start

  // Fetch server prices immediately on game start
  fetchServerStockPrices();

  function frame(now) {
    const dtMs = now - lastFrame;
    lastFrame = now;
    let dt = dtMs / 1000;

    // Handle background gaps/lag: if dt is large, we still want to count the time
    // but we might want to cap the resources or run them in steps if it's extreme.
    // For simplicity and because the engine is linear, we allow up to 300s (5m) per frame.
    // Anything more is handled by the offline catchup on reload.
    const cappedDt = Math.min(dt, 300);
    processTick(cappedDt);

    // Asteroid spawn
    if (!state.asteroidActive && Date.now() >= state.nextAsteroidAt) {
      setState('asteroidActive', true);
      // Auto-despawn after 15 seconds
      setTimeout(() => {
        if (state.asteroidActive) {
          setState('asteroidActive', false);
          setState('nextAsteroidAt', Date.now() + rand(2 * 60e3, 5 * 60e3));
        }
      }, 15000);
    }

    // Auto-save every 30 seconds
    if (now - lastSave > 30000) {
      saveState();
      lastSave = now;
    }

    // Poll server stock prices every 30 seconds
    if (now - lastPriceFetch > PRICE_POLL_INTERVAL) {
      lastPriceFetch = now;
      fetchServerStockPrices();
    }

    animFrameId = requestAnimationFrame(frame);
  }
  animFrameId = requestAnimationFrame(frame);
}

export function stopGameLoop() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
}
