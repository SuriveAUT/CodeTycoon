// pyWorker.js – Python im Browser (Pyodide) für den Coding-Tab. Modul-Worker: lädt Pyodide von jsDelivr, führt den
// Prüf-Harness aus (lib/pyHarness.js) und beantwortet Läufe { id, code, fn, cases, approx }.
// Nachrichten an den Hauptthread: ready | error { message } | start { id } (ab hier läuft das Zeitlimit) |
// result { id, result } bzw. { id, error }. Endlosschleifen beendet lib/pyRunner.js per terminate().
import { PY_HARNESS } from '../lib/pyHarness.js';

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';

const ready = (async () => {
  const { loadPyodide } = await import(/* @vite-ignore */ PYODIDE_URL + 'pyodide.mjs');
  const pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
  pyodide.runPython(PY_HARNESS);
  return pyodide.globals.get('run_task');
})();

ready.then(
  () => postMessage({ type: 'ready' }),
  (e) => postMessage({ type: 'error', message: String(e?.message || e) })
);

self.onmessage = async (ev) => {
  const { id, code, fn, cases, approx } = ev.data || {};
  let runTask;
  try {
    runTask = await ready;
  } catch {
    return;   // Ladefehler wurde schon gemeldet
  }
  postMessage({ type: 'start', id });
  try {
    postMessage({ type: 'result', id, result: JSON.parse(runTask(code, fn, JSON.stringify(cases), !!approx)) });
  } catch (e) {
    postMessage({ type: 'result', id, error: String(e?.message || e) });
  }
};
