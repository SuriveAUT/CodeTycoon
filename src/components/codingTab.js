// codingTab.js – Tab „Coding“ (engine/coding.js): Levelliste, Aufgabe, Editor und Testausgabe als HTML-String wie die
// übrigen Renderer. Die Aktionen (coding-*) und Editor-Tasten verdrahtet App.jsx. Entwürfe liegen je Aufgabe in
// localStorage, nicht im Spielstand; die letzte Testausgabe je Aufgabe nur für die Sitzung.
import { state } from '../store/gameState.js';
import { CODE_LEVELS, getCodeTask, starterCode } from '../data/codeTasks.js';
import {
  codingUnlocked, codingRun, levelReward, codingRewardText, codingXpFactor,
  CODING_MINUTES_PER_LEVEL, CODING_XP_PER_LEVEL, CODING_REPEAT_FACTOR
} from '../engine/coding.js';
import { pythonStatus, PY_TIME_LIMIT_MS } from '../lib/pyRunner.js';
import { getIcon } from '../lib/icons.js';
import { escapeHtml } from '../lib/sanitize.js';

const DRAFT_PREFIX = 'codetycoon-code:';
const MAX_SHOWN = 160;   // Zeichen je Wert in der Ausgabe

// ── Ansichtszustand der Sitzung ──
let selectedLevel = null;
let running = null;               // Aufgabe, deren Test gerade läuft
const outputs = new Map();        // Aufgabe → { mode: 'examples' | 'submit', res, reward? }

// Nächstes ungelöste Level nach `after` (ringsum), sonst null
function nextOpenLevel(solved, after = 0) {
  for (let i = 1; i <= CODE_LEVELS; i++) {
    const level = ((after + i - 1) % CODE_LEVELS) + 1;
    if (!solved.includes(level)) return level;
  }
  return null;
}
// Gewähltes Level; beim ersten Öffnen das erste ungelöste – danach bleibt die Wahl stehen (auch nach dem Lösen)
export function codingSelectedLevel(s = state) {
  if (!selectedLevel) selectedLevel = nextOpenLevel(codingRun(s).solved) || 1;
  return selectedLevel;
}
export function selectCodingLevel(level) {
  if (Number.isInteger(level) && level >= 1 && level <= CODE_LEVELS) selectedLevel = level;
}
export function codingBusy() { return running !== null; }
export function setCodingRunning(taskId) { running = taskId; }
export function setCodingOutput(taskId, out) { outputs.set(taskId, out); }
export function clearCodingOutput(taskId) { outputs.delete(taskId); }

// ── Entwürfe ──
export function loadDraft(task) {
  try {
    const saved = localStorage.getItem(DRAFT_PREFIX + task.id);
    return saved !== null ? saved : starterCode(task);
  } catch {
    return starterCode(task);
  }
}
export function saveDraft(taskId, code) {
  try { localStorage.setItem(DRAFT_PREFIX + taskId, code); } catch { /* Speicher voll oder gesperrt */ }
}
export function clearDraft(taskId) {
  try { localStorage.removeItem(DRAFT_PREFIX + taskId); } catch { /* egal */ }
}

// ── Editor: Tab rückt ein, Shift+Tab aus, Enter behält die Einrückung (nach „:“ vier mehr), Strg+Enter testet ──
const INDENT = '    ';
function insertText(el, text) {
  // execCommand erhält die Rückgängig-Historie; setRangeText als Rückfall
  if (!document.execCommand || !document.execCommand('insertText', false, text)) {
    el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
// Gibt 'test' zurück, wenn Strg+Enter einen Test auslösen soll
export function handleEditorKeydown(e) {
  const el = e.target;
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); return 'test'; }
  if (e.key === 'Escape') { el.blur(); return null; }
  const { selectionStart: start, selectionEnd: end, value } = el;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    const multi = value.slice(start, end).includes('\n');
    if (!e.shiftKey && !multi) { insertText(el, INDENT); return null; }
    // Mehrere Zeilen (oder Shift): ganze Zeilen ein- bzw. ausrücken
    const blockEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
    const lines = value.slice(lineStart, blockEnd).split('\n');
    const changed = lines.map(l => (e.shiftKey ? l.replace(/^ {1,4}/, '') : INDENT + l)).join('\n');
    el.setSelectionRange(lineStart, blockEnd);
    insertText(el, changed);
    el.setSelectionRange(lineStart, lineStart + changed.length);
    return null;
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    const line = value.slice(lineStart, start);
    const indent = line.match(/^\s*/)[0] + (/:\s*$/.test(line) ? INDENT : '');
    insertText(el, '\n' + indent);
  }
  return null;
}

// ── Darstellung ──
// Werte wie Python sie schreibt (None, True, 'text'), gekürzt
function pyRepr(v, depth = 0) {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    const esc = v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
    return esc.includes("'") && !esc.includes('"') ? `"${esc}"` : `'${esc.replace(/'/g, "\\'")}'`;
  }
  if (Array.isArray(v)) return `[${v.map(x => pyRepr(x, depth + 1)).join(', ')}]`;
  if (typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${pyRepr(k)}: ${pyRepr(x, depth + 1)}`).join(', ')}}`;
  return String(v);
}
const shortRepr = (v) => { const r = pyRepr(v); return r.length > MAX_SHOWN ? r.slice(0, MAX_SHOWN) + ' …' : r; };
const call = (task, args) => `${task.fn}(${args.map(shortRepr).join(', ')})`;
const pct = (x) => `${String(Math.round(x * 10000) / 100).replace('.', ',')} %`;

// Aufgabentext: `code` → <code>, Zeilenumbrüche
function taskText(text) {
  return escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>');
}

function caseLine(task, entry) {
  const mark = entry.pass ? '✓' : '✗';
  const got = entry.error !== undefined ? '' : ` → <code>${escapeHtml(shortRepr(entry.got))}</code>`;
  const expected = entry.pass ? '' : ` <span class="muted">erwartet <code>${escapeHtml(shortRepr(entry.expected))}</code></span>`;
  const err = entry.error !== undefined ? `<pre>${escapeHtml(entry.error)}</pre>` : '';
  return `<div class="code-case ${entry.pass ? 'pass' : 'fail'}"><span class="mark">${mark}</span><code>${escapeHtml(call(task, entry.args))}</code>${got}${expected}${err}</div>`;
}

function stdoutBlock(res) {
  if (!res.stdout) return '';
  return `<details class="code-stdout"><summary>Ausgabe von print()</summary><pre>${escapeHtml(res.stdout)}</pre></details>`;
}

function renderOutput(task, level) {
  if (running === task.id) {
    const loading = pythonStatus().status === 'loading';
    return `<div class="code-out">${loading ? 'Python wird geladen … (beim ersten Mal ein paar Sekunden)' : 'Läuft …'}</div>`;
  }
  const out = outputs.get(task.id);
  if (!out) return '';
  const { res, mode } = out;
  if (res.timeout) return `<div class="code-out bad">⏱ Zeitlimit von ${PY_TIME_LIMIT_MS / 1000} s überschritten – Endlosschleife oder zu langsamer Algorithmus?</div>`;
  if (res.error) return `<div class="code-out bad">${escapeHtml(res.error)}</div>`;
  if (res.compileError) return `<div class="code-out bad"><pre>${escapeHtml(res.compileError)}</pre>${stdoutBlock(res)}</div>`;
  const nEx = task.examples.length;
  const examples = res.results.slice(0, nEx).map(e => caseLine(task, e)).join('');
  let summary;
  if (mode === 'examples') {
    const passed = res.results.filter(e => e.pass).length;
    summary = res.ok
      ? `<div class="good">Alle ${nEx} Beispiele stimmen. Jetzt abgeben – dabei laufen auch versteckte Tests.</div>`
      : `<div>${passed} von ${nEx} Beispielen stimmen.</div>`;
  } else {
    const hidden = res.results.slice(nEx);
    const hiddenPassed = hidden.filter(e => e.pass).length;
    const firstFail = hidden.find(e => !e.pass);
    if (res.ok) {
      const reward = out.reward;
      const next = nextOpenLevel(codingRun().solved, level);
      summary = `<div class="good"><strong>Alle ${res.results.length} Tests bestanden!</strong> ${reward
        ? `Level ${level} gelöst: ${escapeHtml(codingRewardText(reward.resources))} · +${pct(reward.xp)} XP beim nächsten Refactor.`
        : 'Dieses Level ist in diesem Run schon gelöst.'}</div>
        ${next ? `<div><button class="btn xs" data-action="coding-level" data-level="${next}">Weiter zu Level ${next}</button></div>` : ''}`;
    } else {
      summary = `<div>Versteckte Tests: ${hiddenPassed} von ${hidden.length} bestanden.</div>${firstFail ? `<div class="muted small">Erster fehlgeschlagener Test:</div>${caseLine(task, firstFail)}` : ''}`;
    }
  }
  const cls = res.ok ? (mode === 'submit' ? 'good' : '') : 'bad';
  return `<div class="code-out ${cls}">${examples}${summary}${stdoutBlock(res)}</div>`;
}

function levelButton(level, run, active) {
  const task = getCodeTask(run.tasks[level]);
  const solved = run.solved.includes(level);
  const repeat = !!run.repeat[level];
  const factor = repeat ? CODING_REPEAT_FACTOR : 1;
  const sub = solved ? 'gelöst' : `${level * CODING_MINUTES_PER_LEVEL * factor} min · +${pct(CODING_XP_PER_LEVEL * factor)} XP${repeat ? ' · Wdh.' : ''}`;
  return `<button class="code-level${active ? ' active' : ''}${solved ? ' solved' : ''}" data-action="coding-level" data-level="${level}" aria-label="Level ${level}: ${escapeHtml(task?.title || '')} – ${sub}">
    <span class="code-level-num">${solved ? getIcon('check') : level}</span>
    <span class="code-level-main"><strong class="truncate">${escapeHtml(task?.title || '–')}</strong><span class="muted small">${sub}</span></span>
  </button>`;
}

export function pythonStatusText() {
  const py = pythonStatus();
  if (py.status === 'loading') return 'Python wird geladen …';
  if (py.status === 'ready') return 'Python 3 bereit';
  if (py.status === 'error') return `Python nicht verfügbar – ${py.error}`;
  return '';
}

export function renderCoding() {
  const intro = `Echte Programmieraufgaben in Python, direkt im Browser. Pro Run gibt es zehn Level von leicht bis knifflig, alle frei wählbar. Level n bringt n × ${CODING_MINUTES_PER_LEVEL} Minuten Produktion aller Ressourcen und +${pct(CODING_XP_PER_LEVEL)} XP beim nächsten Refactor. Nach dem Refactor kommen neue Aufgaben; kennst du schon alle eines Levels, gibt es eine Wiederholung für ein Viertel.`;
  if (!codingUnlocked()) {
    return `<section class="panel">
      <div class="panel-head"><div><div class="eyebrow">Coding</div><h3>${getIcon('code')} Selbst programmieren</h3><div class="sub">${intro}</div></div></div>
      <div class="empty">${getIcon('lock')}<strong>Ab dem ersten Hard Refactor</strong><span>Den Refactor findest du im Tab Prestige.</span></div>
    </section>`;
  }
  const run = codingRun();
  const level = codingSelectedLevel();
  const task = getCodeTask(run.tasks[level]);
  const solved = run.solved.includes(level);
  const repeat = !!run.repeat[level];
  const bonus = codingXpFactor() - 1;
  const busy = running !== null ? 'disabled' : '';
  const reward = levelReward(level, repeat);
  const levels = Array.from({ length: CODE_LEVELS }, (_, i) => levelButton(i + 1, run, i + 1 === level)).join('');
  return `<section class="panel">
    <div class="panel-head"><div><div class="eyebrow">Coding</div><h3>${getIcon('code')} Selbst programmieren</h3><div class="sub">${intro}</div></div>
      <span class="meta">${run.solved.length}/${CODE_LEVELS} gelöst${bonus > 0 ? ` · Coding-Bonus +${pct(bonus)} XP` : ''}</span></div>
    <div class="code-layout">
      <div class="code-levels">${levels}</div>
      <div class="code-task">
        <div class="row-between" style="align-items:flex-start;gap:8px">
          <div><div class="eyebrow">Level ${level}${repeat ? ' · Wiederholung (¼ Belohnung)' : ''}</div><h3>${escapeHtml(task.title)}</h3></div>
          ${solved ? '<span class="badge good">gelöst</span>' : ''}
        </div>
        <div class="code-text">${taskText(task.text)}</div>
        <div class="code-examples"><div class="eyebrow">Beispiele</div>${task.examples.map(([args, exp]) => `<div><code>${escapeHtml(call(task, args))}</code> → <code>${escapeHtml(shortRepr(exp))}</code></div>`).join('')}</div>
        <textarea id="code-editor" class="code-editor" data-task="${task.id}" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" aria-label="Python-Code für ${escapeHtml(task.fn)}">
${escapeHtml(loadDraft(task))}</textarea>
        <div class="code-actions">
          <button class="btn" data-action="coding-test" ${busy}>Beispiele testen</button>
          <button class="btn primary" data-action="coding-submit" ${busy}>Abgeben</button>
          <button class="btn" data-action="coding-reset" ${busy}>Zurücksetzen</button>
          <span class="muted small" id="py-status">${escapeHtml(pythonStatusText())}</span>
        </div>
        ${renderOutput(task, level)}
        <p class="muted small" style="margin-top:8px">${solved ? 'Belohnung für dieses Level ist in diesem Run schon abgeholt.' : `Belohnung beim Abgeben (aktuelle Produktion): ${escapeHtml(codingRewardText(reward.resources))} · +${pct(reward.xp)} XP beim nächsten Refactor.`} Tipp: Strg+Enter testet die Beispiele, Esc verlässt den Editor.</p>
      </div>
    </div>
  </section>`;
}
