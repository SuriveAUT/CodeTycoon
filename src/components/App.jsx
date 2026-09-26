import { onMount, onCleanup, createSignal } from 'solid-js';
import { state, setState, saveState, log as gameLog, SAVE_KEY, normalizeState, hadLocalSave, totalBuildings, techCount, projectCount, forceCloudSync, snapshotState, getTech, BUY_AMOUNTS } from '../store/gameState.js';
import { computeBonuses, estimateRatesSnapshot, currentBonuses, currentRates, clickValue } from '../store/bonuses.js';
import { processTick } from '../engine/tick.js';
import { simulateOffline } from '../engine/offline.js';
import {
  purchaseBuilding, sellBuilding, purchaseTech, purchaseProject, doPrestigeReset, buyChronicle, foundColony, upgradeColony,
  upgradeAllColonies, setColonyFocus, launchMission, setDoctrine, setOperationsMode, activateProtocol, prestigeGain,
  handleManualClick, equipChip, unequipChip
} from '../engine/actions.js';
import { clickAnomaly } from '../engine/events.js';
import { autoExpeditions } from '../engine/automation.js';
import { clickCyberEvent } from '../engine/cyberEvents.js';
import { renderTabContent, renderNav, renderTopbar, renderSidebarFoot, renderCyberEventOverlay, renderKeepReset, doctrineCard, challengeGoalText, setAdminUsers, setAdminSelectedUser, collectAdminSaveEdits, TABS, VALID_TABS, navBadges } from './renderers.js';
import { AstraforgeAPI } from '../lib/api-client.js';
import { RESOURCES, RESOURCE_LABELS, DOCTRINES } from '../data/misc.js';
import { fmt, fmtSec, fmtRate, rand } from '../lib/format.js';
import { escapeHtml } from '../lib/sanitize.js';
import { onToast } from '../lib/toast.js';
import { fetchServerStockPrices, buyStock, sellStock } from '../engine/stocks.js';
import { resolveDecision } from '../engine/decisions.js';
import { getSetting, toggleSetting } from '../lib/settings.js';
import { claimStandup, useCoffee, rewardText } from '../engine/daily.js';
import { startChallenge, abortChallenge, activeChallenge } from '../engine/challenges.js';
import { getChallenge } from '../data/challenges.js';

const FRESH_FLAG = 'codetycoon-fresh-start';

// Tastatur-Shortcuts: Tab-Tasten aus TABS, Kaufmenge 1–4 aus BUY_AMOUNTS
const TAB_KEYS = Object.fromEntries(TABS.filter(t => t.key).map(t => [t.key.toLowerCase(), t.id]));

export default function App() {
  let contentRef, navRef, bottomNavRef, topbarRef, footRef, tooltipRef, cyberEventRef, toastContainerRef;
  let lastFrame = performance.now();
  let lastRender = 0;
  let lastCounterUpdate = 0;
  let currentBugTimeout = null;
  let autosaveIntervalId = null;
  let animationFrameId = null;
  let tooltipHandlers = null;
  let appClickHandler = null;
  let appKeydownHandler = null;
  let beforeUnloadHandler = null;
  let toastUnsubscribe = null;
  let cloudPollIntervalId = null;
  let accountStatusIntervalId = null;
  let stockPriceIntervalId = null;
  let lastScrolledTab = null;

  const [modalVisible, setModalVisible] = createSignal(false);
  const [modalTitle, setModalTitle] = createSignal('');
  const [modalMessage, setModalMessage] = createSignal('');
  const [modalButtons, setModalButtons] = createSignal([]);
  let modalResolve = null;

  const [chatOpen, setChatOpen] = createSignal(false);
  const [chatMessages, setChatMessages] = createSignal([]);
  const [chatUnread, setChatUnread] = createSignal(0);
  let chatMsgsRef, chatInputRef;
  let lastChatId = null;
  let chatIntervalId = null;

  // ── Modal ──
  // Löst mit der `action` des geklickten Buttons auf ('cancel' bei Esc/Overlay)
  function showModal(title, message, buttons) {
    return new Promise(resolve => {
      modalResolve = resolve;
      setModalTitle(title);
      setModalMessage(message);
      setModalButtons(buttons);
      setModalVisible(true);
    });
  }
  function closeModal(result) {
    setModalVisible(false);
    if (modalResolve) { modalResolve(result); modalResolve = null; }
  }
  // Ja/Nein-Dialog → Promise<boolean>
  function confirmModal(title, message, okLabel, okCls = 'primary') {
    return showModal(title, message, [{ label: 'Abbrechen', action: 'cancel' }, { label: okLabel, action: 'confirm', cls: okCls }]).then(r => r === 'confirm');
  }
  function showError(title, err) {
    showModal(title, `<p>${escapeHtml(String(err))}</p>`, [{ label: 'Ok', action: 'cancel' }]);
  }
  function showDoctrineModal() {
    showModal('Core Values wählen', `<p class="muted small" style="margin-bottom:8px">Eine Doktrin pro Run. Sie gilt bis zum nächsten Hard Refactor.</p><div class="grid-auto-sm">${DOCTRINES.map(d => doctrineCard(d)).join('')}</div>`, [{ label: 'Später', action: 'cancel' }]);
  }

  // passive = Engine-Benachrichtigung (Quests, Errungenschaften …); direkte Aktions-Rückmeldungen bleiben immer sichtbar
  function showToast(message, type = 'good', long = false, passive = false) {
    if (!toastContainerRef) return;
    if (passive && !getSetting('toasts')) return;
    while (toastContainerRef.children.length >= 4) toastContainerRef.firstChild.remove();
    const el = document.createElement('div');
    el.className = `toast toast--${type}${long ? ' toast--long' : ''}`;
    el.textContent = message;
    toastContainerRef.appendChild(el);
    setTimeout(() => el.remove(), long ? 7000 : 3300);
  }

  function hasMeaningfulLocalProgress() {
    return hadLocalSave && (
      Number(state.stats?.lifetime || 0) > 30 || Number(state.stats?.manualClicks || 0) > 0
      || totalBuildings() > 0 || techCount() > 0 || projectCount() > 0 || Number(state.stats?.prestigeCount || 0) > 0
    );
  }

  function reloadWithoutLocalSave() {
    if (autosaveIntervalId) { clearInterval(autosaveIntervalId); autosaveIntervalId = null; }
    if (beforeUnloadHandler) { window.removeEventListener('beforeunload', beforeUnloadHandler); beforeUnloadHandler = null; }
    localStorage.removeItem(SAVE_KEY);
    window.location.reload();
  }

  // ── Offline-Fortschritt ──
  // Ohne Argument: Abwesenheit seit dem letzten Speichern (beim Laden). Mit `elapsedSec`: Lücke nach einem
  // versteckten Tab oder Standby; dann erst ab 5 Minuten ein Dialog, damit kurze Tab-Wechsel nicht stören.
  function offlineCatchup(elapsedSec, { resumed = false } = {}) {
    const last = state.stats.lastSave > 0 ? state.stats.lastSave : Date.now();
    const elapsed = elapsedSec ?? Math.max(0, (Date.now() - last) / 1000);
    if (elapsed < 10) return;
    const { sim, cap, efficiency, gains: gainsByRes } = simulateOffline(elapsed);
    const gains = RESOURCES.map(r => [r, gainsByRes[r]]).filter(([, d]) => d >= 0.5).sort((a, z) => z[1] - a[1]).slice(0, 4);
    const summary = gains.length ? gains.map(([r, d]) => `+${fmt(d)} ${RESOURCE_LABELS[r]}`).join(', ') : 'nichts Nennenswertes';
    gameLog(`Offline ${fmtSec(sim)} (${Math.round(efficiency * 100)}%): ${summary}.`);
    if (sim > (resumed ? 300 : 60)) {
      setTimeout(() => showModal('Willkommen zurück', `<p>Du warst <strong>${fmtSec(elapsed)}</strong> weg. Berechnet: ${fmtSec(sim)} mit ${Math.round(efficiency * 100)}% Effizienz${elapsed > cap ? ` (Offline-Limit ${fmt(cap / 3600)}h)` : ''}.</p><div class="tag-list" style="margin-top:10px">${gains.map(([r, d]) => `<span class="cost ok">+${fmt(d)} ${escapeHtml(RESOURCE_LABELS[r])}</span>`).join('') || '<span class="muted">Nichts produziert.</span>'}</div>`, [{ label: 'Weiter', action: 'confirm', cls: 'primary' }]), 300);
    }
    setState('nextAsteroidAt', Date.now() + rand(30e3, 90e3));
  }

  // ── Rendering ──
  function renderAll(force) {
    liveNodes = null;
    if (contentRef) {
      const skipContent = (!force && state.selectedTab === 'account' && contentRef.querySelector('#auth-user') && document.activeElement && contentRef.contains(document.activeElement))
        || (!force && state.selectedTab === 'admin' && contentRef.querySelector('#admin-flag-username'));
      if (!skipContent) {
        const detailsState = new Map();
        contentRef.querySelectorAll('details[data-cat]').forEach(d => detailsState.set(d.dataset.cat, d.open));
        const scrollY = window.scrollY;
        contentRef.innerHTML = renderTabContent();
        contentRef.querySelectorAll('details[data-cat]').forEach(d => { if (detailsState.has(d.dataset.cat)) d.open = detailsState.get(d.dataset.cat); });
        if (!force) window.scrollTo(0, scrollY);
      }
    }
    renderChrome();
    if (cyberEventRef) {
      cyberEventRef.innerHTML = renderCyberEventOverlay();
      cyberEventRef.classList.toggle('hidden', !state.cyberEvent && !state.decision);
    }
    refreshTooltipUnderCursor();
  }

  // Nur neu setzen, wenn sich das HTML geändert hat (spart Layout und erhält Scroll-Position)
  const setHtmlIfChanged = (el, html) => { if (el && el.__html !== html) { el.__html = html; el.innerHTML = html; return true; } return false; };

  function renderChrome() {
    document.title = `${fmt(state.resources.scrap || 0)} Code · CodeTycoon`;
    if (topbarRef) topbarRef.innerHTML = renderTopbar();
    const badges = navBadges();
    setHtmlIfChanged(navRef, renderNav(false, badges));
    if (bottomNavRef) {
      const scrollLeft = bottomNavRef.scrollLeft;
      if (setHtmlIfChanged(bottomNavRef, renderNav(true, badges))) bottomNavRef.scrollLeft = scrollLeft;
      // Nur beim Tab-Wechsel zum aktiven Tab scrollen, nicht bei jedem Sekunden-Render
      if (lastScrolledTab !== state.selectedTab && bottomNavRef.clientWidth > 0) {
        lastScrolledTab = state.selectedTab;
        const active = bottomNavRef.querySelector('.nav-item.active');
        if (active) bottomNavRef.scrollTo({ left: active.offsetLeft - (bottomNavRef.clientWidth - active.offsetWidth) / 2, behavior: 'smooth' });
      }
    }
    setHtmlIfChanged(footRef, renderSidebarFoot());
  }

  // Live-Zähler (10 Hz): Knoten einmal pro Render einsammeln statt bei jedem Update das Dokument zu durchsuchen
  let liveNodes = null;
  function collectLiveNodes() {
    const byRes = attr => Object.fromEntries(RESOURCES.map(r => [r, [...document.querySelectorAll(`[${attr}="${r}"]`)]]));
    return { vals: byRes('data-res-val'), rates: byRes('data-res-rate'), click: document.querySelector('[data-live="click"]') };
  }
  function updateResourceCounters() {
    if (!liveNodes) liveNodes = collectLiveNodes();
    const rates = currentRates();
    RESOURCES.forEach(r => {
      liveNodes.vals[r].forEach(el => { el.textContent = fmt(state.resources[r] || 0); });
      const rate = Number(rates[r] || 0);
      liveNodes.rates[r].forEach(el => {
        el.textContent = fmtRate(rate);
        el.classList.toggle('good', rate > 0.0001);
        el.classList.toggle('bad', rate < -0.0001);
      });
    });
    if (liveNodes.click) liveNodes.click.textContent = fmt(clickValue(currentBonuses(), rates));
  }

  // ── Bug-Anomalie ──
  function spawnBug() {
    setState('asteroidActive', true);
    const el = document.getElementById('bug');
    if (!el) return;
    el.style.top = rand(15, 75) + 'vh';
    const rnd = Math.random();
    let type = 'scrap';
    if (rnd > 0.97) type = 'relics';
    else if (rnd > 0.85) type = 'frenzy';
    else if (rnd > 0.75) type = 'click_frenzy';
    else if (rnd > 0.55) type = 'energy';
    el.dataset.type = type;
    const gold = type === 'frenzy' || type === 'click_frenzy' || type === 'relics';
    el.textContent = gold ? '✨' : '🐛';
    el.className = `bug fly ${gold ? 'gold' : ''}`;
    if (currentBugTimeout) clearTimeout(currentBugTimeout);
    currentBugTimeout = setTimeout(() => {
      if (state.asteroidActive) {
        el.className = 'bug hidden';
        setState('asteroidActive', false);
        setState('nextAsteroidAt', Date.now() + rand(180e3, 480e3));
      }
    }, 15000);
  }

  function handleClickBug() {
    if (!state.asteroidActive) return;
    const el = document.getElementById('bug');
    if (el) el.className = 'bug hidden';
    if (currentBugTimeout) clearTimeout(currentBugTimeout);
    const result = clickAnomaly(el?.dataset?.type || 'scrap');
    if (result) showToast(result.text, result.type);
    renderAll(); saveState();
  }

  function isTypingTarget(target) {
    const tag = target?.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
  }

  // ── Klick ──
  let clickBurst = 0;
  function runManualClick(sourceEl, fromKeyboard = false) {
    const gained = handleManualClick();
    updateResourceCounters();
    if (Date.now() - lastSaveTs > 3000) { saveState(); lastSaveTs = Date.now(); }

    const btn = sourceEl || document.querySelector('.click-btn') || document.querySelector('[data-action="manual-click"]');
    if (!btn) return;
    if (fromKeyboard) { btn.classList.add('pressed'); setTimeout(() => btn.classList.remove('pressed'), 90); }
    if (!getSetting('particles')) return;
    const rect = btn.getBoundingClientRect();
    const x = rect.left + rect.width / 2 + (Math.random() - 0.5) * rect.width * 0.6;
    const y = rect.top + rect.height * 0.35 + (Math.random() - 0.5) * 20;
    const particle = document.createElement('div');
    particle.className = 'click-particle';
    particle.style.left = x + 'px';
    particle.style.top = y + 'px';
    particle.style.fontSize = clickBurst > 8 ? '1.15rem' : '0.95rem';
    particle.textContent = `+${fmt(gained.scrap || 1)}`;
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 900);
    clickBurst++;
    setTimeout(() => { clickBurst = Math.max(0, clickBurst - 1); }, 1000);
  }
  let lastSaveTs = 0;

  function selectTab(tab) {
    if (!VALID_TABS.has(tab)) return;
    setState('selectedTab', tab);
    renderAll(true);
    window.scrollTo({ top: 0 });
    saveState();
    if (tab === 'account') refreshLeaderboard();
    if (tab === 'admin') refreshAdminData();
  }

  // ── Aktionen ──
  function handleAction(e) {
    // Nach Mausklicks den Fokus von Buttons/Links nehmen, damit die Leertaste weiter Code schreibt
    const focusable = e.target.closest('button, a');
    if (focusable && e.detail > 0) setTimeout(() => focusable.blur(), 0);
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const done = () => { renderAll(); saveState(); };

    switch (action) {
      case 'click-bug': handleClickBug(); return;
      case 'cyber-event-click': clickCyberEvent(); renderAll(); return;
      case 'decide': resolveDecision(Number(btn.dataset.index || 0)); done(); return;
      case 'toggle-setting': toggleSetting(id); renderAll(true); return;
      case 'manual-click': runManualClick(btn); return;
      case 'tab': selectTab(btn.dataset.tab); return;
      case 'set-buy-amount': {
        const v = btn.dataset.value === 'max' ? 'max' : Number(btn.dataset.value);
        setState('buyAmount', v); done(); return;
      }
      case 'buy-building': {
        const qty = btn.dataset.qty === 'max' ? 'max' : Number(btn.dataset.qty || 1);
        const bought = purchaseBuilding(id, qty);
        if (bought) flashButton(btn);
        done(); return;
      }
      case 'sell-building': sellBuilding(id, 1); done(); return;
      case 'buy-tech': {
        if (purchaseTech(id)) showToast(`Gelernt: ${getTech(id)?.name || id}`, 'good');
        done(); return;
      }
      case 'buy-project': { if (purchaseProject(id)) showToast('Release erfolgreich!', 'good'); done(); return; }
      case 'buy-chronicle': buyChronicle(id); done(); return;
      case 'toggle': setState('auto', id, !state.auto[id]); done(); return;
      case 'set-converter-throttle': setState('converterThrottle', Math.min(1, Math.max(0.25, Number(btn.dataset.value || 1)))); done(); return;
      case 'set-operations-mode': setOperationsMode(id); done(); return;
      case 'activate-protocol': {
        const result = activateProtocol(id);
        if (!result.ok) {
          if (result.reason === 'active') showToast('Es läuft bereits ein Protokoll.', 'warn');
          else if (result.reason === 'cooldown') showToast(`Cooldown: noch ${fmtSec((result.remaining || 0) / 1000)}.`, 'warn');
          else if (result.reason === 'cost') showToast('Nicht genug Ressourcen.', 'bad');
        }
        done(); return;
      }
      case 'prestige': {
        const gain = prestigeGain();
        if (gain <= 0) return;
        const sprint = activeChallenge();
        confirmModal('Hard Refactor',
          `<p>Du bekommst <strong class="good">+${fmt(gain)} XP</strong> (Guthaben danach: ${fmt(state.chronicle + gain)}).</p>${sprint ? `<p class="bad" style="margin-top:6px">Der laufende Sprint „${escapeHtml(sprint.name)}“ endet dabei ohne Belohnung.</p>` : ''}<div style="margin-top:12px">${renderKeepReset()}</div>`,
          `Refactor (+${fmt(gain)} XP)`
        ).then(confirmed => {
          if (!confirmed || !doPrestigeReset()) return;
          showToast(`Hard Refactor abgeschlossen: +${fmt(gain)} XP`, 'good', true);
          setState('selectedTab', 'prestige');
          done();
          if (currentBonuses().doctrineUnlock && !state.doctrine) setTimeout(showDoctrineModal, 400);
        });
        return;
      }
      case 'found-colony': if (foundColony()) showToast('Standort eröffnet!', 'good'); done(); return;
      case 'upgrade-colony': upgradeColony(id); done(); return;
      case 'upgrade-all-colonies': upgradeAllColonies(); done(); return;
      case 'set-focus': setColonyFocus(id, btn.dataset.focus); done(); return;
      case 'send-mission': if (launchMission(id)) showToast('Auftrag angenommen.', 'good'); done(); return;
      case 'fill-missions': {
        const before = state.expeditions.length;
        autoExpeditions(currentBonuses());
        const started = state.expeditions.length - before;
        showToast(started > 0 ? `${started} Auftrag${started > 1 ? 'e' : ''} gestartet.` : 'Kein Auftrag startbar (Slots/Power).', started > 0 ? 'good' : 'warn');
        done(); return;
      }
      case 'doctrine': closeModal(null); setDoctrine(id); done(); return; // auch aus dem Doktrin-Modal
      // ── Tages-Loop ──
      case 'daily-claim': {
        const info = claimStandup();
        if (info) showToast(`Daily Standup, Tag ${info.streak}:${rewardText(info.reward)}${info.week ? ' + Retro-Bonus ×2' : ''}`, 'good', true);
        done(); return;
      }
      case 'coffee-use': {
        const result = useCoffee(id);
        showToast(result.text, result.ok ? 'good' : 'warn');
        done(); return;
      }
      // ── Sprints ──
      case 'sprint-start': {
        const def = getChallenge(id);
        if (!def) return;
        const gain = prestigeGain();
        confirmModal(`Sprint: ${escapeHtml(def.name)}`,
          `<p>Startet einen neuen Run wie ein Hard Refactor${gain > 0 ? ` (<strong class="good">+${fmt(gain)} XP</strong>)` : ' (aktuell 0 XP)'}.</p>
           <ul class="muted small" style="margin:8px 0 0 18px"><li>Handicap: ${escapeHtml(def.modLabel)}</li><li>Ziel: ${escapeHtml(challengeGoalText(def))}${def.timeLimit ? ` in ${fmtSec(def.timeLimit / 1000)}` : ''}</li><li>Belohnung: ${escapeHtml(def.rewardLabel)} (permanent)</li></ul>
           <div style="margin-top:12px">${renderKeepReset()}</div>`,
          'Sprint starten'
        ).then(ok => {
          if (!ok || !startChallenge(id)) return;
          showToast(`Sprint gestartet: ${def.name} – ${def.modLabel}`, 'good', true);
          setState('selectedTab', 'overview');
          done();
        });
        return;
      }
      case 'sprint-abort':
        confirmModal('Sprint beenden?', '<p>Das Handicap fällt weg und der Run läuft normal weiter. Eine Belohnung gibt es dann nicht.</p>', 'Sprint beenden', 'danger').then(ok => {
          if (ok && abortChallenge()) { showToast('Sprint beendet.', 'warn'); done(); }
        });
        return;
      case 'equip-chip': equipChip(id); done(); return;
      case 'unequip-chip': unequipChip(id); done(); return;
      case 'buy-stock': buyStock(id, Number(btn.dataset.shares || 1)); done(); return;
      case 'sell-stock': sellStock(id, Number(btn.dataset.shares || 1)); done(); return;
      case 'export-save': {
        const text = btoa(unescape(encodeURIComponent(JSON.stringify(snapshotState()))));
        navigator.clipboard?.writeText(text).then(() => showToast('Spielstand in Zwischenablage kopiert.', 'good')).catch(() => {
          showModal('Export', `<textarea class="input" style="height:120px;font-size:11px">${escapeHtml(text)}</textarea>`, [{ label: 'Schließen', action: 'cancel' }]);
        });
        return;
      }
      case 'import-save': {
        confirmModal('Import', '<p class="muted small">Exportierten Spielstand einfügen. Der aktuelle lokale Stand wird überschrieben.</p><textarea id="import-text" class="input" style="height:120px;font-size:11px;margin-top:8px"></textarea>', 'Laden', 'danger').then(ok => {
          if (!ok) return;
          try {
            const raw = document.getElementById('import-text')?.value?.trim() || '';
            const json = raw.startsWith('{') ? raw : decodeURIComponent(escape(atob(raw)));
            const parsed = JSON.parse(json);
            if (applyRemoteSave(parsed, { force: true })) { saveState(); renderAll(true); showToast('Spielstand importiert.', 'good'); }
          } catch (err) { showToast('Import fehlgeschlagen: ungültige Daten.', 'bad'); }
        });
        return;
      }
      case 'hard-reset': {
        confirmModal('Alles löschen?', `<p>Kompletter Neustart – auch XP, Funde und Chips gehen verloren.${AstraforgeAPI.isLoggedIn() ? ' Der Cloud-Save wird dabei ebenfalls überschrieben.' : ''}</p>`, 'Ja, alles löschen', 'danger').then(ok => {
          if (!ok) return;
          try { localStorage.setItem(FRESH_FLAG, '1'); } catch (_) { /* ignore */ }
          reloadWithoutLocalSave();
        });
        return;
      }
      case 'view-profile': {
        AstraforgeAPI.getProfile(id).then(data => {
          showModal(`Profil: ${escapeHtml(id)}`, `<div class="stat-list" style="margin-top:8px">
            <div><span>Refactors</span><strong>${fmt(data.prestige)}</strong></div>
            <div><span>Code gesamt</span><strong>${fmt(data.totalScrap)}</strong></div>
            <div><span>Spielzeit</span><strong>${fmtSec(data.lifetime)}</strong></div>
            <div><span>Releases</span><strong>${fmt(data.projects)}</strong></div>
            <div><span>Aufträge</span><strong>${fmt(data.expeditions)}</strong></div>
            <div><span>Funde</span><strong>${fmt(data.artifacts)}</strong></div>
            <div><span>Standorte</span><strong>${fmt(data.colonies)}</strong></div>
          </div>`, [{ label: 'Schließen', action: 'cancel' }]);
        }).catch(() => showToast('Profil konnte nicht geladen werden.', 'bad'));
        return;
      }
      // ── Auth / Cloud ──
      case 'auth-register': {
        const u = document.getElementById('auth-user')?.value?.trim();
        const p = document.getElementById('auth-pass')?.value;
        if (!u || !p) { showToast('Name und Passwort eingeben.', 'warn'); return; }
        const doRegister = () => AstraforgeAPI.register(u, p).then(() => {
          showModal('Account erstellt', '<p>Das Spiel wird frisch geladen, damit kein alter Fortschritt auf den neuen Account kopiert wird.</p>', [{ label: 'Ok', action: 'confirm', cls: 'primary' }]).then(() => reloadWithoutLocalSave());
        }).catch(err => showError('Fehler', err));
        if (hasMeaningfulLocalProgress()) {
          confirmModal('Lokaler Fortschritt vorhanden', '<p>Ein neuer Account startet frisch. Der lokale Spielstand wird nach der Registrierung von diesem Gerät entfernt.</p>', 'Frisch registrieren', 'danger').then(ok => { if (ok) doRegister(); });
        } else doRegister();
        return;
      }
      case 'auth-login': {
        const u = document.getElementById('auth-user')?.value?.trim();
        const p = document.getElementById('auth-pass')?.value;
        if (!u || !p) { showToast('Name und Passwort eingeben.', 'warn'); return; }
        AstraforgeAPI.login(u, p).then(() => {
          gameLog('Eingeloggt.');
          return AstraforgeAPI.loadGame().then(res => {
            if (res?.gameData && applyRemoteSave(res.gameData, { force: true })) { gameLog('Cloud-Save geladen.'); saveState(); }
          }).catch(err => console.warn('Cloud-Save nach Login nicht geladen', err)).finally(() => { renderAll(true); refreshLeaderboard(); showToast(`Willkommen, ${u}!`, 'good'); });
        }).catch(err => showError('Login fehlgeschlagen', err));
        return;
      }
      case 'auth-logout':
        forceCloudSync().catch(() => {}).finally(() => { AstraforgeAPI.logout(); reloadWithoutLocalSave(); });
        return;
      case 'force-sync':
        forceCloudSync().then(() => showToast('In der Cloud gespeichert.', 'good')).catch(err => showError('Sync-Fehler', err));
        return;
      case 'load-cloud':
        AstraforgeAPI.loadGame().then(res => {
          if (res?.gameData && applyRemoteSave(res.gameData, { force: true })) { offlineCatchup(); saveState(); renderAll(true); showToast('Cloud-Save geladen.', 'good'); }
          else showToast('Kein Cloud-Save gefunden.', 'bad');
        }).catch(err => showError('Fehler', err));
        return;
      case 'refresh-lb': refreshLeaderboard(); return;
      // ── Admin ──
      case 'admin-refresh': refreshAdminData(); return;
      case 'admin-unflag': adminCall(AstraforgeAPI.unflagUser(btn.dataset.username), `${btn.dataset.username} entflaggt.`); return;
      case 'admin-ban': {
        const uname = btn.dataset.username;
        const reason = prompt(`Grund für "${uname}":`) || 'Manuell geflaggt von Admin';
        adminCall(AstraforgeAPI.flagUser(uname, reason), `${uname} geflaggt.`);
        return;
      }
      case 'admin-rename-user': {
        const uname = (btn.dataset.username || document.getElementById('admin-rename-old-username')?.value || '').trim();
        const newName = (btn.dataset.username ? (prompt(`Neuer Name für "${uname}":`) || '') : (document.getElementById('admin-rename-new-username')?.value || '')).trim();
        if (!uname || !newName) return;
        confirmModal('Account umbenennen', `<p>${escapeHtml(uname)} → <strong>${escapeHtml(newName)}</strong>?</p>`, 'Umbenennen').then(ok => {
          if (ok) adminCall(AstraforgeAPI.renameUser(uname, newName), `${uname} → ${newName}.`);
        });
        return;
      }
      case 'admin-delete-user': {
        const uname = (btn.dataset.username || document.getElementById('admin-delete-username')?.value || '').trim();
        if (!uname) return;
        confirmModal('Account löschen', `<p>Account <strong>${escapeHtml(uname)}</strong> endgültig löschen?</p>`, 'Löschen', 'danger').then(ok => {
          if (ok) adminCall(AstraforgeAPI.deleteUser(uname), `${uname} gelöscht.`);
        });
        return;
      }
      case 'admin-flag-submit': {
        const uname = (document.getElementById('admin-flag-username')?.value || '').trim();
        const reason = (document.getElementById('admin-flag-reason')?.value || '').trim() || 'Manuell geflaggt von Admin';
        if (!uname) return;
        adminCall(AstraforgeAPI.flagUser(uname, reason), `${uname} geflaggt.`);
        return;
      }
      case 'admin-load-user': {
        const uname = (document.getElementById('admin-editor-username')?.value || '').trim();
        if (!uname) return;
        AstraforgeAPI.getAdminUserData(uname).then(data => { setAdminSelectedUser(data); renderAll(true); }).catch(err => showToast(`Fehler: ${err.message}`, 'bad'));
        return;
      }
      case 'admin-clear-editor': setAdminSelectedUser(null); renderAll(true); return;
      case 'admin-save-user-data': {
        const uname = (btn.dataset.username || '').trim();
        if (!uname) return;
        const payload = {
          prestige_score: Number(document.getElementById('admin-editor-prestige')?.value || 0),
          total_scrap: Number(document.getElementById('admin-editor-scrap')?.value || 0),
          flagged: Boolean(document.getElementById('admin-editor-flagged')?.checked),
          flag_reason: document.getElementById('admin-editor-flag-reason')?.value ?? '',
          game_save: collectAdminSaveEdits()
        };
        const newPw = (document.getElementById('admin-editor-new-password')?.value || '').trim();
        if (newPw) payload.new_password = newPw;
        confirmModal('Daten speichern', `<p>Daten von <strong>${escapeHtml(uname)}</strong> überschreiben?</p>`, 'Speichern').then(ok => {
          if (!ok) return;
          adminCall(AstraforgeAPI.updateAdminUserData(uname, payload).then(() => {
            if (uname === AstraforgeAPI.username && payload.game_save) {
              try { applyRemoteSave(JSON.parse(payload.game_save), { force: true }); saveState(); renderAll(true); } catch (_) { /* ignore */ }
            }
          }), `${uname} aktualisiert.`);
        });
        return;
      }
      default: return;
    }
  }

  function flashButton(btn) {
    btn.style.transform = 'scale(0.94)';
    setTimeout(() => { btn.style.transform = ''; }, 90);
  }

  function handleKeydown(e) {
    if (e.repeat || isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' && modalVisible()) { closeModal('cancel'); return; }
    if (modalVisible()) return; // Modal: Tastatur gehört den Modal-Buttons
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    if (e.code === 'Space') {
      if (activeTag === 'button' || activeTag === 'a') return; // native Aktivierung nicht blockieren
      e.preventDefault(); runManualClick(null, true); return;
    }
    const tab = TAB_KEYS[e.key?.toLowerCase()];
    if (tab) { e.preventDefault(); selectTab(tab); return; }
    const buyAmount = BUY_AMOUNTS[Number(e.key) - 1];
    if (buyAmount !== undefined && state.selectedTab === 'buildings') { setState('buyAmount', buyAmount); renderAll(); saveState(); }
  }

  // Admin-Aufruf: Erfolg → Toast + Liste neu laden, Fehler → Toast
  function adminCall(promise, okMsg) {
    promise.then(() => { showToast(okMsg); refreshAdminData(); }).catch(err => showToast(`Fehler: ${err.message}`, 'bad'));
  }

  function refreshAdminData() {
    if (state.selectedTab !== 'admin') return;
    AstraforgeAPI.getFlaggedUsers().then(data => { setAdminUsers(Array.isArray(data) ? data : []); renderAll(true); }).catch(err => console.error('Admin fetch error:', err));
  }

  function refreshLeaderboard() {
    if (state.selectedTab !== 'account') return;
    AstraforgeAPI.getLeaderboard().then(data => { setState('cache', 'leaderboard', data || []); renderAll(true); }).catch(err => console.error('Leaderboard fetch error:', err));
  }

  function refreshAccountStatus() {
    if (!AstraforgeAPI.isLoggedIn()) return;
    const wasFlagged = Boolean(AstraforgeAPI.flagged);
    AstraforgeAPI.getAccountStatus().then(() => {
      const isFlagged = Boolean(AstraforgeAPI.flagged);
      if (isFlagged === wasFlagged) return;
      renderAll(true);
      showToast(isFlagged ? 'Account wurde geflaggt.' : 'Account-Flag wurde entfernt.', isFlagged ? 'bad' : 'good');
    }).catch(() => {});
  }

  // ── Chat ──
  async function fetchChat() {
    try {
      const data = await AstraforgeAPI.getChatMessages(lastChatId);
      if (!data.messages) return;
      const msgs = data.messages;
      if (msgs.length === 0) { if (lastChatId === null) lastChatId = 0; return; }
      const latestId = msgs[msgs.length - 1].id;
      let clearIndex = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].username === 'System' && msgs[i].message === 'Chat wurde geleert.') { clearIndex = i; break; }
      }
      const visibleMsgs = clearIndex >= 0 ? msgs.slice(clearIndex) : msgs;
      if (lastChatId === null) setChatMessages(visibleMsgs);
      else {
        setChatMessages(prev => (clearIndex >= 0 ? visibleMsgs : [...prev, ...visibleMsgs]).slice(-50));
        if (!chatOpen()) setChatUnread(n => n + visibleMsgs.length);
      }
      lastChatId = latestId;
      if (chatOpen() && chatMsgsRef) requestAnimationFrame(() => { chatMsgsRef.scrollTop = chatMsgsRef.scrollHeight; });
    } catch { /* offline */ }
  }

  function addLocalChatMsg(username, message) {
    setChatMessages(prev => [...prev, { id: `local-${Date.now()}-${Math.random()}`, username, message, local: true, created_at: new Date().toISOString() }]);
    requestAnimationFrame(() => { if (chatMsgsRef) chatMsgsRef.scrollTop = chatMsgsRef.scrollHeight; });
  }

  function showChatHelp() {
    const isAdmin = AstraforgeAPI.username === (import.meta.env.VITE_ADMIN_USERNAME || 'Dominik');
    ['— Befehle —', '/help — Hilfe', '/me <aktion> — Emote', '/stats — Deine Statistiken', '/top — Top 5', '/ping — Latenz', '/version — Version'].forEach(m => addLocalChatMsg('System', m));
    if (isAdmin) ['— Moderation —', '/announce <text>', '/warn <user> [grund]', '/clear', '/ban <user> [grund]', '/unban <user>', '/users'].forEach(m => addLocalChatMsg('System', m));
  }

  function showChatStats() {
    const s = state.stats;
    addLocalChatMsg('System', `— ${AstraforgeAPI.username || 'Dein'} Status —`);
    addLocalChatMsg('System', `Refactors ${s.prestigeCount || 0} · Spielzeit ${fmtSec(s.lifetime || 0)}`);
    addLocalChatMsg('System', `Team ${totalBuildings()} · Techs ${techCount()} · Releases ${s.projectsBuilt || 0} · Aufträge ${s.expeditionsDone || 0}`);
  }

  async function sendChat() {
    if (!chatInputRef) return;
    const text = chatInputRef.value.trim();
    if (!text) return;
    if (text === '/help') { chatInputRef.value = ''; showChatHelp(); return; }
    if (text === '/stats') { chatInputRef.value = ''; showChatStats(); return; }
    if (text === '/version') { chatInputRef.value = ''; addLocalChatMsg('System', 'CodeTycoon v2 (Rework)'); return; }
    chatInputRef.value = '';
    const sentAt = Date.now();
    try {
      const result = await AstraforgeAPI.sendChatMessage(text);
      if (result?.command === 'clear') { setChatMessages([]); lastChatId = null; }
      else if (result?.command === 'ping') addLocalChatMsg('System', `Pong! ${Date.now() - sentAt}ms`);
      else if (result?.command === 'top') {
        const rows = result.rows || [];
        addLocalChatMsg('System', '— Top 5 —');
        if (!rows.length) addLocalChatMsg('System', 'Noch keine Einträge.');
        rows.forEach((r, i) => addLocalChatMsg('System', `${['🥇', '🥈', '🥉', '4.', '5.'][i]} ${r.username} · ${r.prestige_score} Refactors`));
      } else if (result?.command === 'users') addLocalChatMsg('System', `👥 ${result.total} Accounts · ${result.active} aktiv (7d) · ${result.flagged} geflaggt`);
      await fetchChat();
      if (chatMsgsRef) chatMsgsRef.scrollTop = chatMsgsRef.scrollHeight;
    } catch (err) {
      showToast(String(err).replace('Error: ', ''), 'bad');
    }
  }

  function toggleChat() {
    const willOpen = !chatOpen();
    setChatOpen(willOpen);
    if (willOpen) { setChatUnread(0); requestAnimationFrame(() => { if (chatMsgsRef) chatMsgsRef.scrollTop = chatMsgsRef.scrollHeight; }); }
  }

  function applyRemoteSave(remoteSave, options = {}) {
    if (!remoteSave || typeof remoteSave !== 'object') return false;
    const normalized = normalizeState(remoteSave);
    const localLastSave = Number(state?.stats?.lastSave || 0);
    const remoteLastSave = Number(normalized?.stats?.lastSave || 0);
    if (!(options.force === true || remoteLastSave > localLastSave)) return false;
    for (const k in normalized) {
      if (k === 'stockMarket' || k === 'cache') continue;
      setState(k, normalized[k]);
    }
    setState('cache', 'bonuses', computeBonuses());
    setState('cache', 'rates', estimateRatesSnapshot());
    return true;
  }

  // ── Tooltip ──
  let tooltipEl = null;
  let mouseX = 0, mouseY = 0;
  function positionTooltip() {
    if (!tooltipRef) return;
    const w = window.innerWidth, h = window.innerHeight;
    const ttW = tooltipRef.offsetWidth, ttH = tooltipRef.offsetHeight;
    let x = mouseX + 14, y = mouseY + 14;
    if (x + ttW > w - 8) x = mouseX - ttW - 14;
    if (y + ttH > h - 8) y = h - ttH - 8;
    if (x < 8) x = 8;
    tooltipRef.style.left = x + 'px';
    tooltipRef.style.top = y + 'px';
  }
  function showTooltipFor(el) {
    try {
      const payload = el.dataset.tt;
      if (!payload) return;
      tooltipRef.innerHTML = payload;
      tooltipRef.classList.add('visible');
      tooltipEl = el;
      positionTooltip();
    } catch (_) { /* ignore */ }
  }
  function hideTooltip() { tooltipRef?.classList.remove('visible'); tooltipEl = null; }
  function refreshTooltipUnderCursor() {
    if (!tooltipRef || !tooltipRef.classList.contains('visible')) return;
    const el = document.elementFromPoint(mouseX, mouseY)?.closest('[data-tt]');
    if (el) showTooltipFor(el); else hideTooltip();
  }
  function initTooltipLogic() {
    if (!tooltipRef) return;
    let touchTimer = null, touchHideTimer = null;
    const onMouseOver = (e) => { const el = e.target.closest('[data-tt]'); if (el && el !== tooltipEl) showTooltipFor(el); };
    const onMouseMove = (e) => { mouseX = e.clientX; mouseY = e.clientY; if (tooltipRef.classList.contains('visible')) positionTooltip(); };
    const onMouseOut = (e) => { const el = e.target.closest('[data-tt]'); if (el && !el.contains(e.relatedTarget)) hideTooltip(); };
    const onTouchStart = (e) => {
      if (touchTimer) clearTimeout(touchTimer);
      const el = e.target.closest('[data-tt]');
      if (!el) { hideTooltip(); return; }
      const t = e.touches[0];
      touchTimer = setTimeout(() => {
        mouseX = t.clientX; mouseY = Math.max(60, t.clientY - 40);
        showTooltipFor(el);
        if (touchHideTimer) clearTimeout(touchHideTimer);
        touchHideTimer = setTimeout(hideTooltip, 2500);
      }, 450);
    };
    const onTouchEnd = () => { if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; } };
    const onTouchMove = () => { if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; } hideTooltip(); };
    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseout', onMouseOut);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    tooltipHandlers = { onMouseOver, onMouseMove, onMouseOut, onTouchStart, onTouchEnd, onTouchMove };
  }

  // ── Game Loop ──
  let mountedAt = 0;
  // Wanduhrzeit, bis zu der das Spiel gerechnet ist. Lücken über RESUME_GAP_MS (Tab im Hintergrund,
  // Standby) laufen über die Offline-Regeln, statt verloren zu gehen.
  const RESUME_GAP_MS = 10000;
  let lastTickWall = Date.now();
  function catchUpGap() {
    const elapsedMs = Date.now() - lastTickWall;
    lastTickWall = Date.now();
    if (elapsedMs > RESUME_GAP_MS) offlineCatchup(elapsedMs / 1000, { resumed: true });
  }
  function gameLoop(now) {
    if (Date.now() - lastTickWall > RESUME_GAP_MS) { catchUpGap(); lastFrame = now; }
    const dt = Math.min(2, (now - lastFrame) / 1000);
    lastFrame = now;
    lastTickWall = Date.now();
    // Die ersten Sekunden nach dem Laden still halten (keine Toast-Flut bei alten Saves)
    processTick(dt, { silent: now - mountedAt < 2000, auto: true });
    if (!state.asteroidActive && Date.now() > (state.nextAsteroidAt || 0) && state.stats.lifetime > 60) spawnBug();
    if (now - lastCounterUpdate > 100) { updateResourceCounters(); lastCounterUpdate = now; }
    if (now - lastRender > 1000) { renderAll(); lastRender = now; }
    animationFrameId = requestAnimationFrame(gameLoop);
  }

  onMount(() => {
    let freshStart = false;
    try { freshStart = localStorage.getItem(FRESH_FLAG) === '1'; if (freshStart) localStorage.removeItem(FRESH_FLAG); } catch (_) { /* ignore */ }
    if (freshStart && AstraforgeAPI.isLoggedIn()) {
      // Bewusster Neustart: Cloud nicht laden, sondern frischen Stand hochladen (Server drosselt Saves < 8s → Retry)
      const uploadFresh = (attempt) => forceCloudSync().then(() => showToast('Cloud-Save zurückgesetzt.', 'good')).catch(() => {
        if (attempt < 4) setTimeout(() => uploadFresh(attempt + 1), 10000);
        else showToast('Cloud-Save konnte nicht überschrieben werden – bitte unter Account „Jetzt speichern“.', 'bad', true);
      });
      uploadFresh(0);
      finishMount();
    } else if (AstraforgeAPI.isLoggedIn()) {
      AstraforgeAPI.loadGame().then(res => {
        if (res?.gameData && applyRemoteSave(res.gameData, { force: !hadLocalSave })) gameLog('Cloud-Save geladen.');
      }).catch(err => console.warn('Cloud-Save nicht lesbar', err)).finally(finishMount);
    } else finishMount();

    function finishMount() {
      setState('cache', 'bonuses', computeBonuses());
      setState('cache', 'rates', estimateRatesSnapshot());
      offlineCatchup();
      lastTickWall = Date.now();
      setState('cache', 'rates', estimateRatesSnapshot());
      renderAll(true);
      if (state.selectedTab === 'account') refreshLeaderboard();
      if (!state.doctrine && currentBonuses().doctrineUnlock && state.stats.prestigeCount > 0) setTimeout(showDoctrineModal, 600);
      saveState();
      initTooltipLogic();
      toastUnsubscribe = onToast((msg, type) => showToast(msg, type, false, true));

      if (!AstraforgeAPI.isLoggedIn() && !localStorage.getItem('astraforge_welcomed')) {
        localStorage.setItem('astraforge_welcomed', '1');
        setTimeout(() => showToast('Willkommen bei CodeTycoon! Tipp: Unter „Account“ kannst du deinen Fortschritt in der Cloud sichern.', 'info', true), 1500);
      }
      fetchServerStockPrices();
      stockPriceIntervalId = setInterval(fetchServerStockPrices, 30000);
      fetchChat();
      chatIntervalId = setInterval(fetchChat, 5000);
      refreshAccountStatus();
      accountStatusIntervalId = setInterval(refreshAccountStatus, 30000);
      // Im versteckten Tab ruht das Spiel: nicht speichern, sonst rückt lastSave ohne Fortschritt vor
      autosaveIntervalId = setInterval(() => { if (!document.hidden && Date.now() - state.stats.lastSave > 10000) saveState(); }, 5000);
      cloudPollIntervalId = setInterval(() => {
        if (document.hidden || !AstraforgeAPI.isLoggedIn()) return;
        AstraforgeAPI.loadGame().then(res => {
          if (res?.gameData && applyRemoteSave(res.gameData, { force: false })) { offlineCatchup(); renderAll(); gameLog('Cloud-Save synchronisiert (anderes Gerät).'); }
        }).catch(() => {});
      }, 5 * 60 * 1000);
      mountedAt = performance.now();
      animationFrameId = requestAnimationFrame(gameLoop);
      appClickHandler = handleAction;
      appKeydownHandler = handleKeydown;
      // Versteckter Tab wird geschlossen: Stand vom Verstecken behalten, damit der nächste Start die Zeit nachholt
      beforeUnloadHandler = () => { if (!document.hidden) saveState(); };
      document.addEventListener('click', appClickHandler);
      document.addEventListener('keydown', appKeydownHandler);
      window.addEventListener('beforeunload', beforeUnloadHandler);

      // Versteckter Tab: speichern und pausieren. Beim Zurückkommen erst prüfen, ob ein anderes Gerät
      // weitergespielt hat, dann die Lücke nach den Offline-Regeln nachholen.
      function onVisibilityChange() {
        if (document.hidden) {
          if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
          saveState();
          if (AstraforgeAPI.isLoggedIn()) forceCloudSync().catch(() => {});
          return;
        }
        const resume = () => {
          if (document.hidden) return;
          catchUpGap();
          lastFrame = performance.now();
          if (!animationFrameId) animationFrameId = requestAnimationFrame(gameLoop);
        };
        if (!AstraforgeAPI.isLoggedIn()) { resume(); return; }
        AstraforgeAPI.loadGame().then(res => {
          if (res?.gameData && applyRemoteSave(res.gameData, { force: false })) {
            lastTickWall = Math.min(Date.now(), state.stats.lastSave || Date.now());
            gameLog('Cloud-Save synchronisiert (anderes Gerät).');
          }
        }).catch(() => {}).finally(resume);
      }
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
  });

  onCleanup(() => {
    [autosaveIntervalId, cloudPollIntervalId, accountStatusIntervalId, stockPriceIntervalId, chatIntervalId].forEach(id => { if (id) clearInterval(id); });
    if (currentBugTimeout) clearTimeout(currentBugTimeout);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
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
    <div class="app">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-logo">{'</>'}</div>
          <div><strong>CodeTycoon</strong><small>Idle Dev Empire</small></div>
        </div>
        <nav ref={navRef} class="nav"></nav>
        <div ref={footRef} class="sidebar-foot"></div>
      </aside>
      <div class="main">
        <header ref={topbarRef} class="topbar"></header>
        <main ref={contentRef} class="content"></main>
      </div>
      <nav ref={bottomNavRef} class="bottomnav"></nav>

      <div ref={tooltipRef} id="tooltip"></div>

      <div class={`modal-overlay ${modalVisible() ? '' : 'hidden'}`} onClick={() => closeModal('cancel')}></div>
      <div class={`modal-box ${modalVisible() ? '' : 'hidden'}`} role="dialog" aria-modal="true">
        <div innerHTML={`<h3>${modalTitle()}</h3><div>${modalMessage()}</div>`}></div>
        <div class="modal-buttons">
          {modalButtons().map(b => <button class={`btn ${b.cls || ''}`} onClick={() => closeModal(b.action)}>{b.label}</button>)}
        </div>
      </div>

      <div id="bug" class="bug hidden" data-action="click-bug" title="Bug fixen!"></div>
      <div ref={cyberEventRef} class="cyber-event-overlay hidden"></div>
      <div ref={toastContainerRef} id="toast-container"></div>

      <div id="chat-widget">
        <div class={`chat-panel ${chatOpen() ? 'open' : ''}`}>
          <div class="chat-header"><span>Global Chat</span><button onClick={toggleChat} title="Schließen">×</button></div>
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
                    <span class={`chat-user${isEmote ? ' chat-user--emote' : ''}`}>{isEmote ? `* ${msg.username}` : msg.username}</span>
                    <span class="chat-text">{displayMessage}</span>
                    {timeStr && <span class="chat-time">{timeStr}</span>}
                  </div>
                );
              })}
          </div>
          <div class="chat-input-row">
            {AstraforgeAPI.isLoggedIn()
              ? <>
                <input ref={chatInputRef} class="chat-input" placeholder="Nachricht…" maxLength={200} onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }} />
                <button class="btn primary sm" onClick={sendChat} title="Senden">→</button>
              </>
              : <p class="chat-login-hint">Zum Schreiben einloggen (Tab Account)</p>}
          </div>
        </div>
        <button class={`btn sm chat-toggle ${chatUnread() > 0 && !chatOpen() ? 'primary' : ''}`} onClick={toggleChat} title="Chat">
          💬 Chat {chatUnread() > 0 && !chatOpen() ? <span class="chat-badge">{chatUnread()}</span> : null}
        </button>
      </div>
    </div>
  );
}
