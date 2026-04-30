import { onMount, onCleanup, createSignal } from 'solid-js';
import { state, setState, saveState, log as gameLog, add, SAVE_KEY, normalizeState, hadLocalSave, totalBuildings, techCount, projectCount } from '../store/gameState.js';
import { computeBonuses, estimateRatesSnapshot } from '../store/bonuses.js';
import { processTick } from '../engine/tick.js';
import { purchaseBuilding, sellBuilding, purchaseTech, purchaseProject, doPrestigeReset, buyChronicle, foundColony, upgradeColony, upgradeAllColonies, cycleColonyFocus, launchMission, setDoctrine, setOperationsMode, activateProtocol, prestigeGain, handleManualClick, equipChip, unequipChip, buyStockAction, sellStockAction } from '../engine/actions.js';
import { clickAnomaly } from '../engine/events.js';
import { clickCyberEvent } from '../engine/cyberEvents.js';
import { renderTabContent, renderTabs, renderStickyResources, renderCyberEventOverlay, setAdminUsers, setAdminSelectedUser, collectAdminSaveEdits } from './renderers.js';
import { AstraforgeAPI } from '../lib/api-client.js';
import { forceCloudSync } from '../store/gameState.js';
import { RESOURCES, RESOURCE_LABELS, DOCTRINES } from '../data/misc.js';
import { fmt, fmtSec, clamp, rand } from '../lib/format.js';
import { getIcon, resIcon } from '../lib/icons.js';
import { escapeHtml } from '../lib/sanitize.js';
import t, { lang, setLang } from '../data/i18n.js';
import { onToast } from '../lib/toast.js';
import { fetchServerStockPrices } from '../engine/stocks.js';

const VALID_TABS = new Set([
  'overview',
  'buildings',
  'research',
  'colonies',
  'expeditions',
  'projects',
  'market',
  'prestige',
  'account',
  'codex',
  'admin'
]);

export default function App() {
  let contentRef, tabsRef, stickyRef, statusRef, tooltipRef, cyberEventRef, toastContainerRef;
  let lastFrame = performance.now();
  let lastRender = 0;
  let lastCounterUpdate = 0;
  let currentAsteroidTimeout = null;
  let autosaveIntervalId = null;
  let animationFrameId = null;
  let backgroundTickId = null;
  let tooltipHandlers = null;
  let appClickHandler = null;
  let appKeydownHandler = null;
  let beforeUnloadHandler = null;
  let toastUnsubscribe = null;
  let cloudPollIntervalId = null;
  let accountStatusIntervalId = null;
  let stockPriceIntervalId = null;
  let hadConsumptionDeficitLastFrame = false;
  let lastConsumptionDeficitModalAt = 0;
  
  // Modal state
  let [modalVisible, setModalVisible] = createSignal(false);
  let [modalTitle, setModalTitle] = createSignal('');
  let [modalMessage, setModalMessage] = createSignal('');
  let [modalButtons, setModalButtons] = createSignal([]);
  let modalResolve = null;

  // Chat state
  let [chatOpen, setChatOpen] = createSignal(false);
  let [chatMessages, setChatMessages] = createSignal([]);
  let [chatUnread, setChatUnread] = createSignal(0);
  let chatMsgsRef;
  let chatInputRef;
  let lastChatId = null;
  let chatIntervalId = null;

  function showModal(title, message, buttons) {
    return new Promise(resolve => {
      modalResolve = resolve;
      setModalTitle(title);
      setModalMessage(message);
      setModalButtons(buttons || [
        { label: 'Abbrechen', action: 'cancel', cls: '' },
        { label: 'Bestätigen', action: 'confirm', cls: 'danger' }
      ]);
      setModalVisible(true);
    });
  }

  function showDoctrineModal() {
    const DOCTRINE_EFFECTS_LABELS = {
      efficiency: ['+6% Gesamt-Output', '−3% Gebäudekosten'],
      expansion: ['+2% Output', '+8% Expedition-Power', '+1 Kolonie-Slot'],
      insight: ['+12% Forschung', '+10% Relikte', '+2% Relikte-Chance'],
      dominion: ['+12% Einfluss', '−5% Projektkosten', '+3% Event-Resistenz']
    };
    const docHTML = DOCTRINES.map(d => {
      const effects = (DOCTRINE_EFFECTS_LABELS[d.id] || []).map(e => `<span style="color:var(--good);font-size:0.8em;">${escapeHtml(e)}</span>`).join(' &nbsp;·&nbsp; ');
      return `<div style="border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin:6px 0;">
        <strong style="font-size:0.95em;">${escapeHtml(d.name)}</strong>
        <p style="margin:3px 0 5px;font-size:0.82em;opacity:0.75;">${escapeHtml(d.desc)}</p>
        <div>${effects}</div>
        <button class="active" style="margin-top:8px;width:100%;font-size:0.85em;" data-action="modal-doctrine" data-id="${d.id}">Wählen</button>
      </div>`;
    }).join('');
    showModal(
      '🧭 Doktrin wählen',
      `<p style="margin:0 0 10px;opacity:0.8;font-size:0.88em;">Wähle eine permanente Doktrin für diesen Run. Sie kann nicht geändert werden.</p>${docHTML}`,
      []
    );
  }

  function closeModal(result) {
    setModalVisible(false);
    if (modalResolve) { modalResolve(result); modalResolve = null; }
  }

  function showToast(message, type = 'good') {
    if (!toastContainerRef) return;
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    toastContainerRef.appendChild(el);
    setTimeout(() => el.remove(), 3100);
  }

  function hasMeaningfulLocalProgress() {
    return hadLocalSave && (
      Number(state.stats?.lifetime || 0) > 30
      || Number(state.stats?.manualClicks || 0) > 0
      || totalBuildings() > 0
      || techCount() > 0
      || projectCount() > 0
      || Number(state.stats?.prestigeCount || 0) > 0
    );
  }

  function reloadWithoutLocalSave() {
    if (autosaveIntervalId) {
      clearInterval(autosaveIntervalId);
      autosaveIntervalId = null;
    }
    if (beforeUnloadHandler) {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      beforeUnloadHandler = null;
    }
    localStorage.removeItem(SAVE_KEY);
    window.location.reload();
  }

  function offlineCatchup() {
    const last = state.stats.lastSave > 0 ? state.stats.lastSave : Date.now();
    const elapsed = Math.max(0, (Date.now() - last) / 1000);
    if (elapsed < 10) return;
    const bonuses = computeBonuses();
    const cap = (bonuses.offlineCapHours || 12) * 3600;
    const sim = Math.min(elapsed, cap);
    const efficiency = bonuses.offlineEfficiency || 0.5;
    const step = 300;

    const before = {};
    ['scrap', 'energy', 'alloy', 'components', 'data', 'research', 'influence', 'relics'].forEach(r => {
      before[r] = state.resources[r] || 0;
    });

    let left = sim;
    while (left > 0) {
      const timeToSim = Math.min(step, left);
      processTick(timeToSim * efficiency, { silent: true, auto: true, offline: true });
      left -= timeToSim;
    }

    const gainParts = [];
    const LABELS = { scrap: 'Code', energy: 'Revenue', alloy: 'Bugs', components: 'Module', data: 'Users', research: 'Ideas', influence: 'Hype', relics: 'Legacy' };
    ['scrap', 'energy', 'alloy', 'data', 'research', 'relics'].forEach(r => {
      const diff = (state.resources[r] || 0) - before[r];
      if (diff >= 0.5) gainParts.push(`+${fmt(diff)} ${LABELS[r]}`);
    });

    const summary = gainParts.length > 0 ? gainParts.slice(0, 4).join(', ') : 'nichts Nennenswertes';
    gameLog(`Offline ${fmtSec(sim)} (${Math.round(efficiency * 100)}% Eff.): ${summary}.`);
    setState('nextAsteroidAt', Date.now() + rand(30e3, 90e3));
  }

  function renderAll(force) {
    // Skip content rebuild on network tab to preserve login input fields
    if (contentRef) {
      const skipContent = (!force && state.selectedTab === 'account' && contentRef.querySelector('#auth-user'))
        || (!force && state.selectedTab === 'admin' && contentRef.querySelector('#admin-flag-username'));
      if (!skipContent) {
        // Preserve open/closed state of accordion <details> elements across re-renders
        const detailsState = new Map();
        contentRef.querySelectorAll('details[data-cat]').forEach(d => {
          detailsState.set(d.dataset.cat, d.open);
        });
        contentRef.innerHTML = renderTabContent();
        if (detailsState.size > 0) {
          contentRef.querySelectorAll('details[data-cat]').forEach(d => {
            if (detailsState.has(d.dataset.cat)) d.open = detailsState.get(d.dataset.cat);
          });
        }
      }
    }
    if (tabsRef) tabsRef.innerHTML = renderTabs();
    if (statusRef) {
      const b = state.cache.bonuses || computeBonuses();
      const flagNotice = AstraforgeAPI.flagged
        ? `<span class="bad" style="margin-left:8px">Account geflaggt: ${escapeHtml(AstraforgeAPI.flagReason || 'Kein Grund angegeben.')}</span>`
        : '';
      statusRef.innerHTML = `<strong>${getIcon('time')} Autosave ${new Date(state.stats.lastSave).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong><span style="margin-left:8px; opacity:0.6">Limit: ${b.offlineCapHours}h</span>${flagNotice}`;
    }
    if (stickyRef) {
      stickyRef.innerHTML = renderStickyResources();
      if (state.stats.lifetime > 10) stickyRef.classList.remove('hidden');
    }
    // Cyber Event overlay
    if (cyberEventRef) {
      cyberEventRef.innerHTML = renderCyberEventOverlay();
      if (state.cyberEvent) cyberEventRef.classList.remove('hidden');
      else cyberEventRef.classList.add('hidden');
    }
    // Update header title for language switch
    const titleEl = document.querySelector('.topbar h1');
    if (titleEl) titleEl.textContent = t('misc.core_mgmt');
    const langBtn = document.querySelector('[data-action="toggle-lang"]');
    if (langBtn) langBtn.textContent = lang() === 'de' ? 'EN' : 'DE';
  }

  function updateResourceCounters() {
    const stickyItems = stickyRef?.querySelectorAll('.res-item');
    if (!stickyItems) return;
    let idx = 0;
    RESOURCES.forEach(r => {
      if (state.stats.max[r] <= 0 && r !== 'scrap' && r !== 'energy') return;
      const el = stickyItems[idx];
      if (el) {
        const nodes = el.childNodes;
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].nodeType === 3 && nodes[i].textContent.trim()) {
            nodes[i].textContent = ' ' + fmt(state.resources[r] || 0);
            break;
          }
        }
      }
      idx++;
    });
    const resCards = contentRef?.querySelectorAll('.resource strong');
    if (!resCards) return;
    idx = 0;
    RESOURCES.forEach(r => {
      if (state.stats.max[r] <= 0 && r !== 'scrap' && r !== 'energy') return;
      if (resCards[idx]) resCards[idx].textContent = fmt(state.resources[r] || 0);
      idx++;
    });
    const resRates = contentRef?.querySelectorAll('.resource small');
    if (!resRates) return;
    idx = 0;
    const rates = state.cache.rates || {};
    RESOURCES.forEach(r => {
      if (state.stats.max[r] <= 0 && r !== 'scrap' && r !== 'energy') return;
      const val = rates[r] || 0;
      if (resRates[idx]) resRates[idx].textContent = (val >= 0 ? '+' : '') + fmt(val) + '/s';
      idx++;
    });
  }

  function spawnAsteroid() {
    setState('asteroidActive', true);
    const el = document.getElementById('asteroid');
    if (!el) return;
    const y = rand(15, 80);
    el.style.top = y + 'vh';
    const rnd = Math.random();
    let type = 'scrap';
    if (rnd > 0.98) type = 'relics';
    else if (rnd > 0.85) type = 'frenzy';
    else if (rnd > 0.75) type = 'click_frenzy';
    else if (rnd > 0.60) type = 'data';
    
    el.dataset.type = type;
    
    // Give it a golden look if it is a frenzy anomaly
    if (type === 'frenzy' || type === 'click_frenzy') {
      el.innerHTML = '✨';
      el.className = `asteroid fly anomaly-gold`;
      el.style.filter = 'drop-shadow(0 0 10px gold) sepia(1) hue-rotate(-30deg) saturate(3)';
    } else {
      el.innerHTML = '🐛';
      el.className = `asteroid fly ${type}`;
      el.style.filter = 'none';
    }
    
    if (currentAsteroidTimeout) clearTimeout(currentAsteroidTimeout);
    currentAsteroidTimeout = setTimeout(() => {
      if (state.asteroidActive) {
        el.className = 'asteroid hidden';
        setState('asteroidActive', false);
        setState('nextAsteroidAt', Date.now() + rand(180e3, 480e3));
      }
    }, 15000);
  }

  function handleClickAsteroid() {
    if (!state.asteroidActive) return;
    const el = document.getElementById('asteroid');
    if (el) el.className = 'asteroid hidden';
    if (currentAsteroidTimeout) clearTimeout(currentAsteroidTimeout);
    const type = el?.dataset?.type || 'scrap';
    clickAnomaly(type);
    renderAll();
    saveState();
  }

  function isTypingTarget(target) {
    const tag = target?.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
  }

  function runManualClick(sourceEl) {
    const gained = handleManualClick();
    renderAll();
    saveState();

    const btn = sourceEl || document.querySelector('[data-action="manual-click"]');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const x = rect.left + rect.width / 2 + (Math.random() - 0.5) * 40;
    const y = rect.top + rect.height / 2 + (Math.random() - 0.5) * 40;

    const particle = document.createElement('div');
    particle.className = 'click-particle';
    particle.style.left = x + 'px';
    particle.style.top = y + 'px';
    particle.style.color = 'var(--good)';
    particle.innerHTML = `+${fmt(gained.scrap || 1)}`;
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 1000);
  }

  function handleAction(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'click-asteroid') { handleClickAsteroid(); return; }
    if (action === 'cyber-event-click') { clickCyberEvent(); renderAll(); return; }
    if (action === 'toggle-lang') {
      setLang(lang() === 'de' ? 'en' : 'de');
      renderAll(true);
      return;
    }
    if (action === 'manual-click') {
      runManualClick(btn);
      return;
    }
    if (action === 'modal-confirm') { closeModal(true); return; }
    if (action === 'modal-cancel') { closeModal(false); return; }
    if (action === 'modal-doctrine') {
      closeModal(null);
      setDoctrine(btn.dataset.id);
      renderAll();
      saveState();
      return;
    }
    if (action === 'focus-auth') {
      setState('selectedTab', 'account');
      renderAll(true);
      setTimeout(() => document.getElementById('auth-user')?.focus(), 0);
      return;
    }
    if (action === 'tab') {
      const nextTab = btn.dataset.tab;
      if (!VALID_TABS.has(nextTab)) return;
      setState('selectedTab', nextTab);
      renderAll(true);
      saveState();
      if (nextTab === 'account') refreshLeaderboard();
      if (nextTab === 'admin') refreshAdminData();
      return;
    }
    if (action === 'admin-refresh') { refreshAdminData(); return; }
    if (action === 'admin-unflag') {
      const uname = btn.dataset.username;
      AstraforgeAPI.unflagUser(uname)
        .then(() => { showToast(`${uname} entflaggt.`); refreshAdminData(); })
        .catch(e => showToast(`Fehler: ${e.message}`, 'error'));
      return;
    }
    if (action === 'admin-ban') {
      const uname = btn.dataset.username;
      const reason = prompt(`Neuer Grund für "${uname}":`) || 'Manuell geflaggt von Admin';
      AstraforgeAPI.flagUser(uname, reason)
        .then(() => { showToast(`${uname} geflaggt.`); refreshAdminData(); })
        .catch(e => showToast(`Fehler: ${e.message}`, 'error'));
      return;
    }
    if (action === 'admin-rename-user') {
      const uname = (btn.dataset.username || document.getElementById('admin-rename-old-username')?.value || '').trim();
      const newName = (btn.dataset.username
        ? (prompt(`Neuer Name für "${uname}":`) || '')
        : (document.getElementById('admin-rename-new-username')?.value || '')
      ).trim();
      if (!uname || !newName) return;
      showModal(
        'Account umbenennen',
        `Soll <strong>${escapeHtml(uname)}</strong> in <strong>${escapeHtml(newName)}</strong> umbenannt werden?`,
        [
          { label: 'Abbrechen', action: 'cancel', cls: '' },
          { label: 'Umbenennen', action: 'confirm', cls: 'active' }
        ]
      ).then(result => {
        if (result !== 'confirm') return;
        AstraforgeAPI.renameUser(uname, newName)
          .then(() => { showToast(`${uname} umbenannt in ${newName}.`); refreshAdminData(); })
          .catch(e => showToast(`Fehler: ${e.message}`, 'error'));
      });
      return;
    }
    if (action === 'admin-delete-user') {
      const uname = (btn.dataset.username || document.getElementById('admin-delete-username')?.value || '').trim();
      if (!uname) return;
      showModal(
        'Account löschen',
        `Soll der Account <strong>${escapeHtml(uname)}</strong> endgültig gelöscht werden?`,
        [
          { label: 'Abbrechen', action: 'cancel', cls: '' },
          { label: 'Account löschen', action: 'confirm', cls: 'danger' }
        ]
      ).then(result => {
        if (result !== 'confirm') return;
        AstraforgeAPI.deleteUser(uname)
          .then(() => { showToast(`${uname} gelöscht.`); refreshAdminData(); })
          .catch(e => showToast(`Fehler: ${e.message}`, 'error'));
      });
      return;
    }
    if (action === 'admin-flag-submit') {
      const uname = (document.getElementById('admin-flag-username')?.value || '').trim();
      const reason = (document.getElementById('admin-flag-reason')?.value || '').trim() || 'Manuell geflaggt von Admin';
      if (!uname) return;
      AstraforgeAPI.flagUser(uname, reason)
        .then(() => { showToast(`${uname} geflaggt.`); refreshAdminData(); })
        .catch(e => showToast(`Fehler: ${e.message}`, 'error'));
      return;
    }
    if (action === 'admin-load-user') {
      const uname = (document.getElementById('admin-editor-username')?.value || '').trim();
      if (!uname) return;
      AstraforgeAPI.getAdminUserData(uname)
        .then(data => { setAdminSelectedUser(data); renderAll(true); })
        .catch(e => showToast(`Fehler: ${e.message}`, 'error'));
      return;
    }
    if (action === 'admin-clear-editor') {
      setAdminSelectedUser(null);
      renderAll(true);
      return;
    }
    if (action === 'admin-save-user-data') {
      const uname = (btn.dataset.username || '').trim();
      if (!uname) return;
      const payload = {
        prestige_score: Number(document.getElementById('admin-editor-prestige')?.value || 0),
        total_scrap: Number(document.getElementById('admin-editor-scrap')?.value || 0),
        flagged: Boolean(document.getElementById('admin-editor-flagged')?.checked),
        flag_reason: document.getElementById('admin-editor-flag-reason')?.value ?? '',
        game_save: collectAdminSaveEdits(),
      };
      const newPw = (document.getElementById('admin-editor-new-password')?.value || '').trim();
      if (newPw) payload.new_password = newPw;
      showModal(
        'Daten speichern',
        `Sollen die Daten von <strong>${escapeHtml(uname)}</strong> überschrieben werden?`,
        [
          { label: 'Abbrechen', action: 'cancel', cls: '' },
          { label: 'Speichern', action: 'confirm', cls: 'active' }
        ]
      ).then(result => {
        if (result !== 'confirm') return;
        AstraforgeAPI.updateAdminUserData(uname, payload)
          .then(() => {
            showToast(`${uname} aktualisiert.`);
            if (uname === AstraforgeAPI.username && payload.game_save) {
              try {
                applyRemoteSave(JSON.parse(payload.game_save), { force: true });
                saveState();
                renderAll(true);
              } catch(e) {}
            }
          })
          .catch(e => showToast(`Fehler: ${e.message}`, 'error'));
      });
      return;
    }
    if (action === 'view-profile') {
      const username = btn.dataset.id;
      AstraforgeAPI.getProfile(username).then(data => {
        const safeUsername = escapeHtml(username);
        const msg = `
          <div class="stat-list" style="margin-top:10px;">
            <div><span>Seniorität</span><strong>${data.prestige}</strong></div>
            <div><span>Code gesamt</span><strong>${fmt(data.totalScrap)}</strong></div>
            <div><span>Arbeitszeit</span><strong>${fmtSec(data.lifetime)}</strong></div>
            <div><span>Releases</span><strong>${data.projects}</strong></div>
            <div><span>Aufträge</span><strong>${data.expeditions}</strong></div>
            <div><span>Legacy-Code</span><strong>${data.artifacts}</strong></div>
            <div><span>Standorte</span><strong>${data.colonies}</strong></div>
          </div>
        `;
        showModal(`Dev-Profil: ${safeUsername}`, msg, [{label: 'Schließen', action: 'cancel'}]);
      }).catch(e => showModal('Fehler', 'Profil konnte nicht geladen werden.', [{label: 'Ok', action: 'cancel'}]));
      return;
    }
    if (action === 'buy-building') { purchaseBuilding(btn.dataset.id, Number(btn.dataset.qty || 1)); renderAll(); saveState(); return; }
    if (action === 'sell-building') { sellBuilding(btn.dataset.id, Number(btn.dataset.qty || 1)); renderAll(); saveState(); return; }
    if (action === 'buy-tech') { purchaseTech(btn.dataset.id); renderAll(); saveState(); return; }
    if (action === 'buy-project') { purchaseProject(btn.dataset.id); renderAll(); saveState(); return; }
    if (action === 'buy-chronicle') { buyChronicle(btn.dataset.id); renderAll(); saveState(); return; }
    if (action === 'toggle') {
      const key = btn.dataset.id;
      setState('auto', key, !state.auto[key]);
      gameLog(`${key} ${state.auto[key] ? 'aktiviert' : 'deaktiviert'}.`);
      renderAll(); saveState(); return;
    }
    if (action === 'set-converter-throttle') {
      const raw = Number(btn.dataset.value || 1);
      const next = Math.min(1, Math.max(0.25, raw));
      setState('converterThrottle', next);
      gameLog(`Konverter-Drossel auf ${Math.round(next * 100)}% gesetzt.`);
      renderAll();
      saveState();
      return;
    }
    if (action === 'set-operations-mode') {
      const modeId = String(btn.dataset.id || '');
      setOperationsMode(modeId);
      renderAll();
      saveState();
      return;
    }
    if (action === 'activate-protocol') {
      const protocolId = String(btn.dataset.id || '');
      const result = activateProtocol(protocolId);
      if (!result.ok) {
        if (result.reason === 'active') {
          showModal('Protokoll aktiv', 'Es laeuft bereits ein anderes Protokoll.', [{ label: 'OK', action: 'cancel' }]);
        } else if (result.reason === 'cooldown') {
          const sec = Math.ceil((result.remaining || 0) / 1000);
          showModal('Abklingzeit', `Dieses Protokoll ist noch ${fmtSec(sec)} im Cooldown.`, [{ label: 'OK', action: 'cancel' }]);
        } else if (result.reason === 'cost') {
          showModal('Ressourcen fehlen', 'Nicht genug Ressourcen fuer dieses Protokoll.', [{ label: 'OK', action: 'cancel' }]);
        }
      }
      renderAll();
      saveState();
      return;
    }
    if (action === 'prestige') {
      const gain = prestigeGain();
      if (gain <= 0) return;
      const keepList = [
        `${state.artifacts.length} Artifacts / Patente`,
        `${state.achievements.length} Errungenschaften`,
        `${state.ownedChips.length} Mainframe-Chips`,
        `Chronicle: ${fmt(state.chronicle)} → ${fmt(state.chronicle + gain)} XP`
      ].map(s => `<li>${s}</li>`).join('');
      const resetList = [
        'Alle Gebäude & Mitarbeiter',
        'Tech-Stack / Forschung',
        'Projekte & Releases',
        'Kolonien & Expeditionen',
        'Ressourcen (außer Start-Kapital)',
        'Doktrin (neu wählen nach Reset)'
      ].map(s => `<li>${s}</li>`).join('');
      showModal(
        '⚠ Hard Refactor',
        `<strong>+${fmt(gain)} XP</strong> bei Abschluss.<br>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;font-size:0.85rem;">
          <div>
            <p style="color:var(--good);margin:0 0 4px;font-weight:700;">BLEIBT ERHALTEN</p>
            <ul style="margin:0;padding-left:18px;opacity:0.9;">${keepList}</ul>
          </div>
          <div>
            <p style="color:var(--bad);margin:0 0 4px;font-weight:700;">WIRD ZURÜCKGESETZT</p>
            <ul style="margin:0;padding-left:18px;opacity:0.9;">${resetList}</ul>
          </div>
        </div>`,
        [
          { label: 'Abbrechen', action: 'cancel', cls: '' },
          { label: `Refactor (+${fmt(gain)} XP)`, action: 'confirm', cls: 'active' }
        ]
      ).then(confirmed => {
        if (!confirmed) return;
        doPrestigeReset();
        showToast(`Hard Refactor abgeschlossen: +${fmt(gain)} XP`, 'good');
        renderAll();
        saveState();
        const b2 = computeBonuses();
        if (b2.doctrineUnlock) showDoctrineModal();
      });
      return;
    }
    if (action === 'found-colony') { foundColony(); renderAll(); saveState(); return; }
    if (action === 'upgrade-colony') { upgradeColony(btn.dataset.id); renderAll(); saveState(); return; }
    if (action === 'upgrade-all-colonies') { upgradeAllColonies(); renderAll(); saveState(); return; }
    if (action === 'cycle-focus') { cycleColonyFocus(btn.dataset.id); renderAll(); saveState(); return; }
    if (action === 'send-mission') { launchMission(btn.dataset.id); renderAll(); saveState(); return; }
    if (action === 'doctrine') { setDoctrine(btn.dataset.id); renderAll(); saveState(); return; }
    if (action === 'equip-chip') { equipChip(btn.dataset.id); renderAll(); saveState(); return; }
    if (action === 'unequip-chip') { unequipChip(btn.dataset.id); renderAll(); saveState(); return; }
    if (action === 'buy-stock') {
      buyStockAction(btn.dataset.id, Number(btn.dataset.shares || 1));
      renderAll(); saveState(); return;
    }
    if (action === 'sell-stock') {
      sellStockAction(btn.dataset.id, Number(btn.dataset.shares || 1));
      renderAll(); saveState(); return;
    }

    // Backend actions
    if (action === 'auth-register') {
      const u = document.getElementById('auth-user')?.value;
      const p = document.getElementById('auth-pass')?.value;
      if (!u || !p) return showModal('Fehler', 'Name und Passkey eintragen.', [{label: 'Ok', action: 'cancel'}]);
      const doRegister = () => AstraforgeAPI.register(u, p).then(() => {
        showModal(
          'Erfolg',
          'Account erstellt. Das lokale Spiel wird jetzt frisch geladen, damit kein alter Fortschritt auf einen neuen Account kopiert wird.',
          [{label: 'Ok', action: 'confirm'}]
        ).then(() => reloadWithoutLocalSave());
      }).catch(e => showModal('Fehler', String(e), [{label: 'Ok', action: 'cancel'}]));

      if (hasMeaningfulLocalProgress()) {
        showModal(
          'Lokaler Fortschritt vorhanden',
          'Ein neuer Account startet frisch. Wenn du fortfährst, wird der lokale Spielstand nach der Registrierung von diesem Gerät entfernt.',
          [
            { label: 'Abbrechen', action: 'cancel', cls: '' },
            { label: 'Frisch registrieren', action: 'confirm', cls: 'danger' }
          ]
        ).then(result => {
          if (result === 'confirm') doRegister();
        });
      } else {
        doRegister();
      }
      return;
    }
    if (action === 'auth-login') {
      const u = document.getElementById('auth-user')?.value;
      const p = document.getElementById('auth-pass')?.value;
      if (!u || !p) return;
      AstraforgeAPI.login(u, p).then(() => {
        gameLog('Erfolgreich ins Netzwerk eingeloggt.');
        return AstraforgeAPI.loadGame().then(res => {
          if (res && res.gameData) {
            // In a fresh browser we want to restore cloud progress immediately.
            const applied = applyRemoteSave(res.gameData, { force: true });
            if (applied) {
              gameLog('Cloud-Save geladen.');
              saveState();
            }
          }
        }).catch(e => console.warn('Konnte Cloud-Save nach Login nicht laden', e))
          .finally(() => {
            renderAll(true);
            refreshLeaderboard();
          });
      }).catch(e => showModal('Login Fehlgeschlagen', String(e), [{label: 'Ok', action: 'cancel'}]));
      return;
    }
    if (action === 'auth-logout') {
      // Try one final cloud sync before local data is removed.
      forceCloudSync()
        .catch(e => console.warn('Finaler Cloud-Sync vor Logout fehlgeschlagen', e))
        .finally(() => {
          AstraforgeAPI.logout();
          // Anti-duping: Destroy local save and reload to fresh state.
          reloadWithoutLocalSave();
        });
      return;
    }
    if (action === 'force-sync') {
      forceCloudSync().then(() => { gameLog('Cloud-Sync erfolgreich.'); showToast('Cloud-Sync gespeichert.', 'good'); })
        .catch(e => showModal('Sync Fehler', String(e), [{label: 'Ok', action: 'cancel'}]));
      return;
    }
    if (action === 'load-cloud') {
      AstraforgeAPI.loadGame().then(res => {
        if (res && res.gameData) {
          const applied = applyRemoteSave(res.gameData, { force: true });
          if (applied) {
            offlineCatchup();
            saveState();
            renderAll(true);
            showToast('Cloud-Save geladen!', 'good');
            gameLog('Cloud-Save manuell geladen.');
          } else {
            showToast('Kein Cloud-Save gefunden.', 'bad');
          }
        } else {
          showToast('Kein Cloud-Save gefunden.', 'bad');
        }
      }).catch(e => showModal('Fehler', String(e), [{label: 'Ok', action: 'cancel'}]));
      return;
    }
    if (action === 'refresh-lb') {
      refreshLeaderboard();
      return;
    }
  }

  function handleKeydown(e) {
    if (e.code !== 'Space' || e.repeat || state.selectedTab !== 'overview' || isTypingTarget(e.target)) return;
    e.preventDefault();
    runManualClick();
  }

  function refreshAdminData() {
    if (state.selectedTab !== 'admin') return;
    AstraforgeAPI.getFlaggedUsers().then(data => {
      setAdminUsers(Array.isArray(data) ? data : []);
      renderAll(true);
    }).catch(e => console.error('Admin fetch error:', e));
  }

  function refreshLeaderboard() {
    if (state.selectedTab !== 'account') return;
    // We update the state, which triggers a re-render via renderAll or manual call
    AstraforgeAPI.getLeaderboard().then(data => {
      setState('cache', 'leaderboard', data || []);
      renderAll(true);
    }).catch(e => {
      console.error('Leaderboard fetch error:', e);
      // Optional: set an error state in cache
    });
  }

  function refreshAccountStatus() {
    if (!AstraforgeAPI.isLoggedIn()) return;
    const wasFlagged = Boolean(AstraforgeAPI.flagged);
    const oldReason = AstraforgeAPI.flagReason || '';
    AstraforgeAPI.getAccountStatus().then(() => {
      const isFlagged = Boolean(AstraforgeAPI.flagged);
      const newReason = AstraforgeAPI.flagReason || '';
      if (isFlagged === wasFlagged && newReason === oldReason) return;

      renderAll(true);
      if (isFlagged && !wasFlagged) {
        showToast('Account wurde geflaggt.', 'bad');
      } else if (!isFlagged && wasFlagged) {
        showToast('Account-Flag wurde entfernt.', 'good');
      }
    }).catch(() => {});
  }

  async function fetchChat() {
    try {
      const data = await AstraforgeAPI.getChatMessages(lastChatId);
      if (!data.messages) return;
      const msgs = data.messages;
      if (msgs.length === 0) {
        if (lastChatId === null) lastChatId = 0;
        return;
      }
      const latestId = msgs[msgs.length - 1].id;
      let clearIndex = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].username === 'System' && msgs[i].message === 'Chat wurde geleert.') {
          clearIndex = i;
          break;
        }
      }
      const visibleMsgs = clearIndex >= 0 ? msgs.slice(clearIndex) : msgs;
      if (lastChatId === null) {
        setChatMessages(visibleMsgs);
      } else {
        setChatMessages(prev => (clearIndex >= 0 ? visibleMsgs : [...prev, ...visibleMsgs]).slice(-50));
        if (!chatOpen()) setChatUnread(n => n + visibleMsgs.length);
      }
      lastChatId = latestId;
      if (chatOpen() && chatMsgsRef) {
        requestAnimationFrame(() => { chatMsgsRef.scrollTop = chatMsgsRef.scrollHeight; });
      }
    } catch { /* network errors silently ignored */ }
  }

  function addLocalChatMsg(username, message) {
    setChatMessages(prev => [...prev, {
      id: `local-${Date.now()}-${Math.random()}`,
      username,
      message,
      local: true,
      created_at: new Date().toISOString()
    }]);
    requestAnimationFrame(() => { if (chatMsgsRef) chatMsgsRef.scrollTop = chatMsgsRef.scrollHeight; });
  }

  function showChatHelp() {
    const isAdmin = AstraforgeAPI.username === (import.meta.env.VITE_ADMIN_USERNAME || 'Dominik');
    addLocalChatMsg('System', '— Benutzer-Befehle —');
    addLocalChatMsg('System', '/help — Diese Hilfe anzeigen');
    addLocalChatMsg('System', '/me <aktion> — Emote senden (alle sehen es)');
    addLocalChatMsg('System', '/stats — Deine Spielstatistiken');
    addLocalChatMsg('System', '/top — Top 5 Leaderboard');
    addLocalChatMsg('System', '/ping — Verbindung testen');
    addLocalChatMsg('System', '/version — Spielversion');
    if (isAdmin) {
      addLocalChatMsg('System', '— Moderator-Befehle —');
      addLocalChatMsg('System', '/announce <text> — Systemankündigung posten');
      addLocalChatMsg('System', '/warn <user> [grund] — Verwarnung im Chat');
      addLocalChatMsg('System', '/clear — Chat leeren');
      addLocalChatMsg('System', '— Admin-Befehle —');
      addLocalChatMsg('System', '/ban <user> [grund] — User bannen');
      addLocalChatMsg('System', '/unban <user> — User entbannen');
      addLocalChatMsg('System', '/users — Nutzer-Statistiken');
    }
  }

  function showChatStats() {
    const s = state.stats;
    addLocalChatMsg('System', `— ${AstraforgeAPI.username || 'Dein'} Status —`);
    addLocalChatMsg('System', `Prestige: ${s.prestigeCount || 0}x Refactor`);
    addLocalChatMsg('System', `Spielzeit: ${fmtSec(s.lifetime || 0)}`);
    addLocalChatMsg('System', `Gebäude: ${totalBuildings()} · Techs: ${techCount()}`);
    addLocalChatMsg('System', `Projekte: ${s.projectsBuilt || 0} · Expeditionen: ${s.expeditionsDone || 0}`);
    addLocalChatMsg('System', `Klicks: ${fmt(s.manualClicks || 0)}`);
  }

  async function sendChat() {
    if (!chatInputRef) return;
    const text = chatInputRef.value.trim();
    if (!text) return;

    // Client-side commands — no server roundtrip needed
    if (text === '/help') { chatInputRef.value = ''; showChatHelp(); return; }
    if (text === '/stats') { chatInputRef.value = ''; showChatStats(); return; }
    if (text === '/version') {
      chatInputRef.value = '';
      addLocalChatMsg('System', `Dev Tycoon · Astraforge Engine · Build ${new Date().getFullYear()}`);
      return;
    }

    chatInputRef.value = '';
    const sentAt = Date.now();
    try {
      const result = await AstraforgeAPI.sendChatMessage(text);
      if (result?.command === 'clear') {
        setChatMessages([]);
        lastChatId = null;
      } else if (result?.command === 'ping') {
        addLocalChatMsg('System', `Pong! Latenz: ${Date.now() - sentAt}ms`);
      } else if (result?.command === 'top') {
        const rows = result.rows || [];
        const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
        addLocalChatMsg('System', '— Top 5 Leaderboard —');
        if (rows.length === 0) {
          addLocalChatMsg('System', 'Noch keine Einträge.');
        } else {
          rows.forEach((r, i) => addLocalChatMsg('System', `${medals[i]} ${r.username}  Prestige ${r.prestige_score}`));
        }
      } else if (result?.command === 'users') {
        addLocalChatMsg('System', `👥 Accounts: ${result.total} gesamt · ${result.active} aktiv (7d) · ${result.flagged} geflaggt`);
      }
      await fetchChat();
      if (chatMsgsRef) chatMsgsRef.scrollTop = chatMsgsRef.scrollHeight;
    } catch (e) {
      showToast(String(e).replace('Error: ', ''), 'bad');
    }
  }

  function toggleChat() {
    const willOpen = !chatOpen();
    setChatOpen(willOpen);
    if (willOpen) {
      setChatUnread(0);
      requestAnimationFrame(() => { if (chatMsgsRef) chatMsgsRef.scrollTop = chatMsgsRef.scrollHeight; });
    }
  }

  function applyRemoteSave(remoteSave, options = {}) {
    if (!remoteSave || typeof remoteSave !== 'object') return false;
    const normalized = normalizeState(remoteSave);
    const localLastSave = Number(state?.stats?.lastSave || 0);
    const remoteLastSave = Number(normalized?.stats?.lastSave || 0);
    const shouldApply = options.force === true || remoteLastSave > localLastSave;
    if (!shouldApply) return false;
    for (const k in normalized) {
      if (k === 'stockMarket') continue; // kommt immer vom Server, nie aus dem Save
      setState(k, normalized[k]);
    }
    return true;
  }

  function initTooltipLogic() {
    if (!tooltipRef) return;
    let rafId = null;
    let mouseX = 0, mouseY = 0;
    let ttW = 320, ttH = 0;
    let touchHideTimer = null;

    const hideTooltip = () => {
      tooltipRef.classList.remove('visible');
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (touchHideTimer) { clearTimeout(touchHideTimer); touchHideTimer = null; }
    };

    const showTooltipEl = (el) => {
      try {
        const payload = decodeURIComponent(el.dataset.tt);
        if (payload) {
          tooltipRef.innerHTML = payload;
          tooltipRef.classList.add('visible');
          ttW = tooltipRef.offsetWidth;
          ttH = tooltipRef.offsetHeight;
        }
      } catch (err) {}
    };

    const onMouseOver = (e) => {
      const el = e.target.closest('[data-tt]');
      if (!el) return;
      showTooltipEl(el);
    };

    const positionTooltip = () => {
      rafId = null;
      const w = window.innerWidth, h = window.innerHeight;
      let x = mouseX + 15, y = mouseY + 15;
      if (x + ttW > w - 10) x = mouseX - ttW - 15;
      if (y + ttH > h - 10) y = h - ttH - 15;
      tooltipRef.style.left = x + 'px';
      tooltipRef.style.top = y + 'px';
    };

    const onMouseMove = (e) => {
      if (!tooltipRef.classList.contains('visible')) return;
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!rafId) rafId = requestAnimationFrame(positionTooltip);
    };

    const onMouseOut = (e) => {
      const el = e.target.closest('[data-tt]');
      if (el) hideTooltip();
    };

    // Touch: long-press 400ms to show tooltip; quick tap = action, no tooltip shown
    let touchLongPressTimer = null;

    const positionTooltipAtEl = (el) => {
      const rect = el.getBoundingClientRect();
      const w = window.innerWidth, h = window.innerHeight;
      ttW = tooltipRef.offsetWidth;
      ttH = tooltipRef.offsetHeight;
      let x = rect.left + rect.width / 2 - ttW / 2;
      let y = rect.top - ttH - 8;
      if (y < 8) y = rect.bottom + 8;
      if (x + ttW > w - 8) x = w - ttW - 8;
      if (x < 8) x = 8;
      tooltipRef.style.left = x + 'px';
      tooltipRef.style.top = y + 'px';
    };

    const onTouchStart = (e) => {
      if (touchLongPressTimer) { clearTimeout(touchLongPressTimer); touchLongPressTimer = null; }
      const el = e.target.closest('[data-tt]');
      if (!el) { hideTooltip(); return; }
      touchLongPressTimer = setTimeout(() => {
        touchLongPressTimer = null;
        showTooltipEl(el);
        positionTooltipAtEl(el);
        if (touchHideTimer) clearTimeout(touchHideTimer);
        touchHideTimer = setTimeout(hideTooltip, 2500);
      }, 400);
    };

    const onTouchEnd = () => {
      if (touchLongPressTimer) { clearTimeout(touchLongPressTimer); touchLongPressTimer = null; }
    };

    const onTouchMove = () => {
      if (touchLongPressTimer) { clearTimeout(touchLongPressTimer); touchLongPressTimer = null; }
      hideTooltip();
    };

    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseout', onMouseOut);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    tooltipHandlers = { onMouseOver, onMouseMove, onMouseOut, onTouchStart, onTouchEnd, onTouchMove };
  }

  function gameLoop(now) {
    const dt = Math.min(2, (now - lastFrame) / 1000);
    lastFrame = now;
    processTick(dt, { silent: true, auto: true });
    const rates = state.cache?.rates || {};
    const hasDeficitNow = !!rates.__hadNegative;
    if (hasDeficitNow && !hadConsumptionDeficitLastFrame) {
      const nowMs = Date.now();
      if (nowMs - lastConsumptionDeficitModalAt > 60000) {
        const topDeficit = Array.isArray(rates.__deficits) ? rates.__deficits[0] : null;
        const detail = topDeficit
          ? `<br><br><strong>Hauptengpass:</strong> ${topDeficit.resource} (Verbrauch ${fmt(topDeficit.consumed)}/s vs Produktion ${fmt(topDeficit.produced)}/s)`
          : '';
        showModal(
          '⚠ Verbrauchs-Engpass erkannt',
          `Deine Konverter verbrauchen aktuell mehr als produziert wird. Netto-Einkommen wird daher auf 0 begrenzt.${detail}<br><br><strong>Tipp:</strong> Konverter-Drossel auf 25-50% setzen und Basisproduktion (Schrott/Energie) zuerst ausbauen.`,
          [{ label: 'Verstanden', action: 'confirm', cls: '' }]
        );
        lastConsumptionDeficitModalAt = nowMs;
      }
    }
    hadConsumptionDeficitLastFrame = hasDeficitNow;
    if (!state.asteroidActive && Date.now() > (state.nextAsteroidAt || 0)) spawnAsteroid();
    if (now - lastCounterUpdate > 100) { updateResourceCounters(); lastCounterUpdate = now; }
    if (now - lastRender > 2000) { renderAll(); lastRender = now; }
    animationFrameId = requestAnimationFrame(gameLoop);
  }

  onMount(() => {
    // Initial Load Logic
    if (AstraforgeAPI.isLoggedIn()) {
      AstraforgeAPI.loadGame().then(res => {
        if (res && res.gameData) {
          // Force-apply if this device has no local save (fresh device / new browser)
          const applied = applyRemoteSave(res.gameData, { force: !hadLocalSave });
          if (applied) gameLog('Cloud-Save geladen.');
        }
      }).catch(e => console.warn('Konnte Cloud-Save nicht lesen', e))
        .finally(finishMount);
    } else {
      finishMount();
    }
    
    function finishMount() {
      offlineCatchup();
      setState('cache', 'rates', estimateRatesSnapshot());
      renderAll();
      if (state.selectedTab === 'account') refreshLeaderboard();
      
      const b = computeBonuses();
      if (!state.doctrine && b.doctrineUnlock) showDoctrineModal();

      saveState();
      initTooltipLogic();
      toastUnsubscribe = onToast((msg, type) => showToast(msg, type));

      // Welcome toast for guests — shown once per browser
      if (!AstraforgeAPI.isLoggedIn() && !localStorage.getItem('astraforge_welcomed')) {
        localStorage.setItem('astraforge_welcomed', '1');
        setTimeout(() => {
          if (!toastContainerRef) return;
          const el = document.createElement('div');
          el.className = 'toast toast--good toast--long';
          el.textContent = '👋 Willkommen! Geh zu // ~/config um dich anzumelden oder zu registrieren — dann wird dein Fortschritt in der Cloud gespeichert.';
          toastContainerRef.appendChild(el);
          setTimeout(() => el.remove(), 6000);
        }, 1200);
      }
      fetchServerStockPrices();
      stockPriceIntervalId = setInterval(fetchServerStockPrices, 30000);
      fetchChat();
      chatIntervalId = setInterval(fetchChat, 5000);
      refreshAccountStatus();
      accountStatusIntervalId = setInterval(refreshAccountStatus, 30000);
      autosaveIntervalId = setInterval(() => {
        if (Date.now() - state.stats.lastSave > 10000) saveState();
      }, 5000);
      // Periodically pull cloud save so progress from other devices is picked up
      cloudPollIntervalId = setInterval(() => {
        if (!AstraforgeAPI.isLoggedIn()) return;
        AstraforgeAPI.loadGame().then(res => {
          if (res && res.gameData) {
            const applied = applyRemoteSave(res.gameData, { force: false });
            if (applied) {
              offlineCatchup();
              renderAll();
              gameLog('Cloud-Save synchronisiert (anderes Gerät erkannt).');
            }
          }
        }).catch(() => {});
      }, 5 * 60 * 1000);
      animationFrameId = requestAnimationFrame(gameLoop);
      appClickHandler = handleAction;
      appKeydownHandler = handleKeydown;
      beforeUnloadHandler = saveState;
      document.addEventListener('click', appClickHandler);
      document.addEventListener('keydown', appKeydownHandler);
      window.addEventListener('beforeunload', beforeUnloadHandler);

      // Keep ticking at 1 Hz when tab is hidden (rAF pauses in background)
      function onVisibilityChange() {
        if (document.hidden) {
          if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
          if (!backgroundTickId) {
            backgroundTickId = setInterval(() => {
              const now = performance.now();
              const dt = Math.min(2, (now - lastFrame) / 1000);
              lastFrame = now;
              processTick(dt, { silent: true, auto: true });
              if (Date.now() - state.stats.lastSave > 10000) saveState();
            }, 1000);
          }
        } else {
          if (backgroundTickId) { clearInterval(backgroundTickId); backgroundTickId = null; }
          lastFrame = performance.now();
          if (!animationFrameId) animationFrameId = requestAnimationFrame(gameLoop);
        }
      }
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
  });

  onCleanup(() => {
    if (currentAsteroidTimeout) clearTimeout(currentAsteroidTimeout);
    if (autosaveIntervalId) clearInterval(autosaveIntervalId);
    if (cloudPollIntervalId) clearInterval(cloudPollIntervalId);
    if (accountStatusIntervalId) clearInterval(accountStatusIntervalId);
    if (stockPriceIntervalId) clearInterval(stockPriceIntervalId);
    if (chatIntervalId) clearInterval(chatIntervalId);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (backgroundTickId) clearInterval(backgroundTickId);
    if (appClickHandler) document.removeEventListener('click', appClickHandler);
    if (appKeydownHandler) document.removeEventListener('keydown', appKeydownHandler);
    if (beforeUnloadHandler) window.removeEventListener('beforeunload', beforeUnloadHandler);
    if (toastUnsubscribe) toastUnsubscribe();
    if (tooltipHandlers) {
      document.removeEventListener('mouseover', tooltipHandlers.onMouseOver);
      document.removeEventListener('mousemove', tooltipHandlers.onMouseMove);
      document.removeEventListener('mouseout', tooltipHandlers.onMouseOut);
      document.removeEventListener('touchstart', tooltipHandlers.onTouchStart);
      document.removeEventListener('touchend', tooltipHandlers.onTouchEnd);
      document.removeEventListener('touchmove', tooltipHandlers.onTouchMove);
    }
  });

  return (
    <>
      <div class="backdrop"></div>
      <header class="topbar" id="topbar">
        <div>
          <p class="brand">Dev Tycoon</p>
          <h1>{t('misc.core_mgmt')}</h1>
        </div>
        <div class="topbar-right" style="display:flex; gap:12px; align-items:center;">
          <div ref={statusRef} id="status" class="status">{t('ui.loading')}</div>
          <button class="chip" data-action="toggle-lang" title="DE / EN" style="min-width:40px">
            {lang() === 'de' ? 'EN' : 'DE'}
          </button>
        </div>
      </header>
      <div ref={stickyRef} id="resources-sticky" class="resources-sticky hidden"></div>
      <nav ref={tabsRef} id="tabs" class="tabs"></nav>
      <main ref={contentRef} id="content" class="content"></main>
      <div ref={tooltipRef} id="tooltip"></div>

      {/* Modal */}
      <div id="modal-overlay" class={`modal-overlay ${modalVisible() ? '' : 'hidden'}`} onClick={() => closeModal('cancel')}></div>
      <div id="modal-box" class={`modal-box ${modalVisible() ? '' : 'hidden'}`}>
        <div id="modal-content" innerHTML={`<h3>${modalTitle()}</h3><p>${modalMessage()}</p>`}></div>
        <div id="modal-buttons" class="modal-buttons">
          {modalButtons().map(b => (
            <button class={b.cls} onClick={() => closeModal(b.action)}>{b.label}</button>
          ))}
        </div>
      </div>

      {/* Asteroid */}
      <div id="asteroid" class="asteroid hidden" data-action="click-asteroid" title="Bug fixen!" data-tt={encodeURIComponent('<h4>Bug entdeckt!</h4><p>Fixe den Bug für einen Sofort-Bonus (Code, Revenue oder seltene Hacks).</p>')}></div>

      {/* Cyber Event Overlay */}
      <div ref={cyberEventRef} id="cyber-event-overlay" class="cyber-event-overlay hidden"></div>

      {/* Toast Notifications */}
      <div ref={toastContainerRef} id="toast-container"></div>

      {/* Global Chat Widget */}
      <div id="chat-widget">
        <div class={`chat-panel ${chatOpen() ? 'open' : ''}`}>
          <div class="chat-header">
            <span>// Global Chat</span>
            <button onClick={toggleChat} title="Schließen">×</button>
          </div>
          <div class="chat-messages" ref={chatMsgsRef}>
            {chatMessages().length === 0
              ? <p class="chat-empty">Noch keine Nachrichten. Sei der Erste!</p>
              : chatMessages().map(msg => {
                  const isEmote = typeof msg.message === 'string' && msg.message.startsWith('\x01');
                  const isSystem = msg.username === 'System';
                  const displayMessage = isEmote ? msg.message.slice(1) : msg.message;
                  const timeStr = !msg.local && msg.created_at
                    ? new Date(msg.created_at + (msg.created_at.endsWith('Z') ? '' : 'Z')).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
                    : null;
                  return (
                    <div class={`chat-msg${isEmote ? ' chat-msg--emote' : ''}${isSystem ? ' chat-msg--system' : ''}`}>
                      {isEmote
                        ? <span class="chat-user chat-user--emote">* {msg.username}</span>
                        : <span class="chat-user">{msg.username}</span>
                      }
                      <span class="chat-text">{displayMessage}</span>
                      {timeStr && <span class="chat-time">{timeStr}</span>}
                    </div>
                  );
                })
            }
          </div>
          <div class="chat-input-row">
            {AstraforgeAPI.isLoggedIn()
              ? <>
                  <input
                    ref={chatInputRef}
                    class="chat-input"
                    placeholder="Nachricht eingeben…"
                    maxLength={200}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
                  />
                  <button class="chat-send active" onClick={sendChat} title="Senden">→</button>
                </>
              : <p class="chat-login-hint muted">Zum Schreiben einloggen (// ~/config)</p>
            }
          </div>
        </div>
        <button
          class={`chat-toggle ${chatUnread() > 0 && !chatOpen() ? 'has-unread' : ''}`}
          onClick={toggleChat}
          title="Chat öffnen / schließen"
        >
          {chatOpen() ? '× Chat' : '// Chat'}
          {chatUnread() > 0 && !chatOpen() ? <span class="chat-badge">{chatUnread()}</span> : null}
        </button>
      </div>
    </>
  );
}
