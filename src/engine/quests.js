// quests.js – Sequenzielle Aufgaben (Onboarding + Ziele).
import { state, setState, add, log, totalBuildings, techCount, projectCount, colonyCount } from '../store/gameState.js';
import { QUESTS } from '../data/quests.js';
import { emitToast } from '../lib/toast.js';
import { fmt } from '../lib/format.js';
import { RESOURCE_LABELS } from '../data/misc.js';

function helpers(s) {
  return {
    totalBuildings: totalBuildings(s),
    techCount: techCount(s),
    projectCount: projectCount(s),
    colonyCount: colonyCount(s)
  };
}

export function currentQuest(s = state) {
  return QUESTS[s.questIndex] || null;
}

export function questProgress(quest, s = state) {
  if (!quest) return [0, 1];
  try {
    const [cur, target] = quest.progress(s, helpers(s));
    return [Math.max(0, Number(cur) || 0), Math.max(1, Number(target) || 1)];
  } catch (_) {
    return [0, 1];
  }
}

export function checkQuests(silent) {
  let guard = 0;
  while (guard++ < 10) {
    const quest = currentQuest();
    if (!quest) return;
    const [cur, target] = questProgress(quest);
    if (cur < target) return;
    if (quest.reward) {
      Object.entries(quest.reward).forEach(([res, amt]) => add(res, amt));
    }
    setState('questIndex', state.questIndex + 1);
    setState('stats', 'questsDone', (state.stats.questsDone || 0) + 1);
    if (!silent) {
      const rewardText = quest.reward
        ? ' +' + Object.entries(quest.reward).map(([res, amt]) => `${fmt(amt)} ${RESOURCE_LABELS[res] || res}`).join(', ')
        : '';
      log(`✅ Aufgabe erledigt: ${quest.title}.${rewardText}`);
      emitToast(`Aufgabe erledigt: ${quest.title}${rewardText}`, 'good');
    }
  }
}
