// cyberEvents.js – Interaktive Cyber-Events mit Minispielen
import { state, setState, log } from '../store/gameState.js';
import { rand } from '../lib/format.js';

export const CYBER_EVENTS = [
  {
    id: 'ransomware',
    name: 'Ransomware-Angriff',
    desc: 'Deine Server werden verschlüsselt! Klicke schnell um den Patch zu deployen!',
    duration: 30000,
    clicksRequired: 5,
    type: 'interactive', // player must click
    color: 'danger',
    icon: '🔒',
    onSuccess: () => {
      log('🛡️ Ransomware abgewehrt! Kein Schaden.');
    },
    onFail: () => {
      const loss = Math.floor((state.resources.scrap || 0) * 0.10);
      setState('resources', 'scrap', Math.max(0, (state.resources.scrap || 0) - loss));
      log(`💀 Ransomware! ${loss} Code verloren.`);
    }
  },
  {
    id: 'viral_tweet',
    name: 'Viraler Tweet',
    desc: 'Dein Projekt geht auf X viral! Hype-Produktion ×3 für 5 Minuten.',
    duration: 5000, // popup stays 5s then auto-activates
    clicksRequired: 0,
    type: 'passive', // auto-activates
    color: 'gold',
    icon: '🐦',
    onSuccess: () => {
      setState('event', { name: 'Viraler Tweet', duration: 5 * 60e3, effects: { influenceMult: 3 } });
      setState('eventEnds', Date.now() + 5 * 60e3);
      log('🐦 Viraler Tweet! Hype ×3 für 5 Minuten!');
    },
    onFail: null
  },
  {
    id: 'stackoverflow_down',
    name: 'StackOverflow Down',
    desc: 'StackOverflow ist offline! Entwickler-Produktion -50% für 2 Minuten.',
    duration: 5000,
    clicksRequired: 0,
    type: 'passive',
    color: 'warn',
    icon: '📉',
    onSuccess: () => {
      setState('event', { name: 'SO Down', duration: 2 * 60e3, effects: { scrapMult: 0.5, alloyMult: 0.5, componentsMult: 0.5 } });
      setState('eventEnds', Date.now() + 2 * 60e3);
      log('📉 StackOverflow Down! Dev-Produktion -50% für 2 Minuten.');
    },
    onFail: null
  },
  {
    id: 'ddos_attack',
    name: 'DDoS-Attacke',
    desc: 'Deine Server werden geflutet! Reboote schnell (10 Klicks in 20s)!',
    duration: 20000,
    clicksRequired: 10,
    type: 'interactive',
    color: 'danger',
    icon: '⚡',
    onSuccess: () => {
      log('🛡️ DDoS abgewehrt! Server stabil.');
    },
    onFail: () => {
      setState('event', { name: 'DDoS Nachwirkung', duration: 3 * 60e3, effects: { energyMult: 0.85 } });
      setState('eventEnds', Date.now() + 3 * 60e3);
      log('💀 DDoS erfolgreich! Revenue -15% für 3 Min.');
    }
  },
  {
    id: 'investor_call',
    name: 'Investor Call',
    desc: 'Ein VC will investieren! Bereite den Pitch vor (3 Klicks in 15s)!',
    duration: 15000,
    clicksRequired: 3,
    type: 'interactive',
    color: 'info',
    icon: '💼',
    onSuccess: () => {
      setState('event', { name: 'VC Funding', duration: 5 * 60e3, effects: { buildingCostMult: 0.80, projectCostMult: 0.85 } });
      setState('eventEnds', Date.now() + 5 * 60e3);
      log('💼 Pitch erfolgreich! Kosten -20% für 5 Min!');
    },
    onFail: () => {
      log('💼 Investor abgesprungen. Nächstes Mal besser pitchen.');
    }
  },
  {
    id: 'github_trending',
    name: 'GitHub Trending',
    desc: 'Dein Repo ist auf GitHub Trending! Extra Legacy Code für 3 Minuten.',
    duration: 5000,
    clicksRequired: 0,
    type: 'passive',
    color: 'gold',
    icon: '⭐',
    onSuccess: () => {
      setState('event', { name: 'GitHub Trending', duration: 3 * 60e3, effects: { relicMult: 2, relicChance: 0.08 } });
      setState('eventEnds', Date.now() + 3 * 60e3);
      log('⭐ GitHub Trending! Legacy Code ×2 für 3 Minuten!');
    },
    onFail: null
  }
];

export function spawnCyberEvent() {
  if (state.cyberEvent) return;
  if (state.event) return; // don't stack with regular events

  const pool = CYBER_EVENTS.filter(e => {
    // Only spawn interactive events after some progress
    if (e.type === 'interactive' && (state.techs?.length || 0) < 3) return false;
    return true;
  });
  if (!pool.length) return;

  const chosen = pool[Math.floor(Math.random() * pool.length)];
  const now = Date.now();

  setState('cyberEvent', {
    id: chosen.id,
    name: chosen.name,
    desc: chosen.desc,
    type: chosen.type,
    color: chosen.color,
    icon: chosen.icon,
    clicksRequired: chosen.clicksRequired,
    clicksDone: 0,
    startedAt: now,
    endsAt: now + chosen.duration
  });
  setState('nextCyberEventAt', now + rand(5 * 60e3, 12 * 60e3));
}

export function clickCyberEvent() {
  if (!state.cyberEvent || state.cyberEvent.type !== 'interactive') return;

  const clicks = (state.cyberEvent.clicksDone || 0) + 1;
  setState('cyberEvent', 'clicksDone', clicks);

  if (clicks >= state.cyberEvent.clicksRequired) {
    // Success!
    const def = CYBER_EVENTS.find(e => e.id === state.cyberEvent.id);
    if (def?.onSuccess) def.onSuccess();
    setState('cyberEvent', null);
  }
}

export function tickCyberEvent(now) {
  // Check if current event expired
  if (state.cyberEvent && now >= state.cyberEvent.endsAt) {
    const def = CYBER_EVENTS.find(e => e.id === state.cyberEvent.id);

    if (state.cyberEvent.type === 'passive') {
      // Passive events auto-succeed
      if (def?.onSuccess) def.onSuccess();
    } else {
      // Interactive event expired = fail
      if (def?.onFail) def.onFail();
    }
    setState('cyberEvent', null);
    return;
  }

  // Spawn new event?
  if (!state.cyberEvent && now >= (state.nextCyberEventAt || 0)) {
    spawnCyberEvent();
  }
}
