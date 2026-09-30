// pyRunner.js – verwaltet den Python-Worker (workers/pyWorker.js) für den Coding-Tab: einmal laden, dann Läufe mit
// Zeitlimit. Hängt ein Lauf (Endlosschleife, zu langsamer Algorithmus), wird der Worker beendet und sofort neu
// gestartet; Pyodide kommt dann meist schon aus dem Browser-Cache.
export const PY_TIME_LIMIT_MS = 5000;
const LOAD_LIMIT_MS = 120000;

let worker = null;
let status = 'idle';            // idle | loading | ready | error
let lastError = '';
let loadTimer = null;
let nextId = 1;
const pending = new Map();      // id → { started(), finish(msg) }
const listeners = new Set();

export function pythonStatus() { return { status, error: lastError }; }

// fn({ status, error }) bei jeder Statusänderung; gibt eine Abmeldefunktion zurück
export function onPythonStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setStatus(next, error = '') {
  status = next;
  lastError = error;
  listeners.forEach(fn => fn(pythonStatus()));
}

function stopWorker(reason) {
  clearTimeout(loadTimer);
  if (worker) worker.terminate();
  worker = null;
  const open = [...pending.values()];
  pending.clear();
  open.forEach(p => p.finish({ error: reason }));
}

function startWorker() {
  worker = new Worker(new URL('../workers/pyWorker.js', import.meta.url), { type: 'module' });
  setStatus('loading');
  loadTimer = setTimeout(() => {
    stopWorker('Python konnte nicht geladen werden (Zeitüberschreitung).');
    setStatus('error', 'Zeitüberschreitung beim Laden');
  }, LOAD_LIMIT_MS);
  worker.onmessage = (ev) => {
    const msg = ev.data || {};
    if (msg.type === 'ready') { clearTimeout(loadTimer); setStatus('ready'); }
    else if (msg.type === 'error') { stopWorker(`Python konnte nicht geladen werden: ${msg.message}`); setStatus('error', msg.message); }
    else if (msg.type === 'start') pending.get(msg.id)?.started();
    else if (msg.type === 'result') pending.get(msg.id)?.finish(msg);
  };
  worker.onerror = (e) => {
    e.preventDefault?.();
    stopWorker(`Python-Worker abgestürzt: ${e.message || 'unbekannter Fehler'}`);
    setStatus('error', e.message || 'Worker-Fehler');
  };
}

// Python vorab laden (beim Öffnen des Tabs), damit der erste Test nicht warten muss
export function warmupPython() {
  if (!worker) startWorker();
}

// Führt `code` gegen `cases` aus. Ergebnis: Harness-Antwort { ok, passed, compileError?, results, stdout }
// oder { timeout: true } bzw. { error: 'Text' }.
export function runPython({ code, fn, cases, approx = false }, limitMs = PY_TIME_LIMIT_MS) {
  if (!worker) startWorker();
  const id = nextId++;
  return new Promise((resolve) => {
    let timer = null;
    const finish = (msg) => {
      clearTimeout(timer);
      pending.delete(id);
      resolve(msg.timeout ? { timeout: true } : msg.error ? { error: msg.error } : msg.result);
    };
    pending.set(id, {
      started: () => {
        timer = setTimeout(() => {
          finish({ timeout: true });
          stopWorker('abgebrochen');
          startWorker();
        }, limitMs);
      },
      finish
    });
    worker.postMessage({ id, code, fn, cases, approx: !!approx });
  });
}
