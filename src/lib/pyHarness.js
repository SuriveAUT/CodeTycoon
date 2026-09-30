// pyHarness.js – Python-Prüfprogramm für den Coding-Tab. Läuft im Pyodide-Worker (src/workers/pyWorker.js) und
// identisch beim lokalen Prüfen der Aufgaben. run_task führt den Code des Spielers in einem frischen Namensraum aus,
// ruft die geforderte Funktion für jeden Fall mit einer Kopie der Argumente auf und vergleicht das Ergebnis.
// Antwort (JSON): { ok, passed, compileError?, results: [{ args, expected, pass, got?, error? }], stdout }
export const PY_HARNESS = String.raw`
import copy, io, json, linecache, math, sys, traceback

_DATEI = 'dein_code.py'
_MAX_OUT = 4000
_MAX_LISTE = 300
_MAX_TEXT = 1000

def _norm(v):
    if isinstance(v, tuple):
        v = list(v)
    if isinstance(v, list):
        return [_norm(x) for x in v]
    if isinstance(v, dict):
        return {str(k): _norm(x) for k, x in v.items()}
    return v

def _eq(a, b, approx):
    # True und 1 sind in Python gleich – hier nicht: die Aufgabe verlangt den richtigen Typ
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if approx and isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isclose(a, b, rel_tol=1e-6, abs_tol=1e-6)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_eq(x, y, approx) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(_eq(a[k], b[k], approx) for k in a)
    return a == b

def _kurz(text):
    return text if len(text) <= _MAX_TEXT else text[:_MAX_TEXT] + '…'

def _anzeige(v):
    # Für die Ausgabe: gültiges JSON (kein inf/nan) und begrenzte Größe
    if v is None or isinstance(v, bool):
        return v
    if isinstance(v, str):
        return _kurz(v)
    if isinstance(v, int):
        if abs(v) < 2 ** 53:
            return v
        try:
            return _kurz(repr(v))
        except ValueError:
            return '<sehr große Zahl>'
    if isinstance(v, float):
        return v if math.isfinite(v) else repr(v)
    if isinstance(v, list):
        teil = [_anzeige(x) for x in v[:_MAX_LISTE]]
        return teil + ['…'] if len(v) > _MAX_LISTE else teil
    if isinstance(v, dict):
        return {k: _anzeige(x) for k, x in list(v.items())[:_MAX_LISTE]}
    try:
        return _kurz(repr(v))
    except Exception:
        return '<' + type(v).__name__ + '>'

def _fehler(e):
    # Nur Zeilen aus dem Code des Spielers, dazu die Fehlermeldung selbst
    zeilen = ['Zeile %d in %s: %s' % (f.lineno, f.name, (f.line or '').strip())
              for f in traceback.extract_tb(e.__traceback__) if f.filename == _DATEI]
    meldung = ''.join(traceback.format_exception_only(type(e), e)).rstrip()
    return '\n'.join(zeilen[-3:] + [meldung])

def _kein_input(*_):
    raise RuntimeError('input() gibt es hier nicht – deine Funktion bekommt die Werte als Parameter.')

def _pruefen(code, fn, cases, approx, result):
    ns = {'__name__': '__spieler__', 'input': _kein_input}
    # damit Fehlermeldungen die Zeile aus dem Editor zeigen können
    linecache.cache[_DATEI] = (len(code), None, code.splitlines(True), _DATEI)
    try:
        exec(compile(code, _DATEI, 'exec'), ns)
    except BaseException as e:
        result['compileError'] = _fehler(e)
        return
    f = ns.get(fn)
    if not callable(f):
        result['compileError'] = 'Die Funktion ' + fn + '(...) fehlt – achte auf den genauen Namen.'
        return
    for args, expected in cases:
        entry = {'args': args, 'expected': expected, 'pass': False}
        try:
            got = _norm(f(*copy.deepcopy(args)))
            entry['got'] = _anzeige(got)
            entry['pass'] = _eq(got, expected, approx)
        except RecursionError:
            entry['error'] = 'RecursionError: zu tiefe Rekursion – fehlt eine Abbruchbedingung?'
        except BaseException as e:
            entry['error'] = _fehler(e)
        if entry['pass']:
            result['passed'] += 1
        result['results'].append(entry)
    result['ok'] = result['passed'] == len(cases)

def run_task(code, fn, cases_json, approx):
    result = {'ok': False, 'passed': 0, 'results': [], 'stdout': ''}
    out = io.StringIO()
    old_out = sys.stdout
    sys.stdout = out
    try:
        _pruefen(code, fn, json.loads(cases_json), bool(approx), result)
    finally:
        sys.stdout = old_out
    result['stdout'] = out.getvalue()[:_MAX_OUT]
    return json.dumps(result, ensure_ascii=False)
`;
