#!/usr/bin/env python3
"""Prova funzionale dell'import Motra in v2.html, nel browser vero.

Server finto CON STATO: le PATCH vengono applicate a una copia in memoria dei due
record, cosi' la rilettura di controllo dell'app vede davvero cio' che ha scritto.
Nessun dato reale viene toccato: si parte dagli snapshot del repo dei backup.
"""
import http.server, json, pathlib, re, shutil, socketserver, subprocess, sys, threading, tempfile
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path('/home/claude/diario-protocollo')
SNAPDIR = pathlib.Path('/home/claude/diario-protocollo-backups/snapshots/2026-11-17')
OUT = pathlib.Path('/tmp/claude-0/motra-e2e'); OUT.mkdir(parents=True, exist_ok=True)
BUILD = OUT / 'build'; BUILD.mkdir(exist_ok=True)

def load(prefix):
    f = next(p for p in SNAPDIR.iterdir() if p.name.startswith(prefix))
    rows = json.loads(f.read_text())
    return (rows[0] if isinstance(rows, list) else rows)['data']

DATA = {'giorgio_proto2_2026': load('proto_v2'), 'giorgio_protocollo_2026': load('diario_v1')}
PATCHES = []

raw = (ROOT / 'v2.html').read_text()
noauth = re.sub(r'var AUTH_REQUIRED\s*=\s*true\s*;', 'var AUTH_REQUIRED = false;', raw)
assert 'var AUTH_REQUIRED = false;' in noauth, 'interruttore AUTH_REQUIRED non trovato'
(BUILD / 'index.html').write_text(noauth)

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=str(BUILD), **k)
    def log_message(s, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), H); srv.allow_reuse_address = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
PORT = srv.server_address[1]

PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' + '0d0a2db4' + '0000000049454e44ae426082')

def handler(route):
    req = route.request; u = req.url
    if 'supabase.co' not in u:
        return route.continue_() if '127.0.0.1' in u else route.abort()
    HD = {'access-control-allow-origin': '*'}
    if '/rest/v1/diary' not in u:
        return route.fulfill(status=200, content_type='image/png', headers=HD, body=PNG)
    rec = 'giorgio_proto2_2026' if 'proto2' in u else 'giorgio_protocollo_2026'
    if req.method == 'PATCH':
        body = json.loads(req.post_data)
        PATCHES.append((rec, body))
        DATA[rec] = body['data']          # il server finto tiene lo stato
        return route.fulfill(status=204, headers=HD, body='')
    sel = re.search(r'select=([^&]*)', u)
    sel = sel.group(1) if sel else 'data'
    if sel == 'data':
        rows = [{'data': DATA[rec]}]
    else:
        keys = re.findall(r'data-%3E([a-zA-Z_0-9]+)', sel)
        rows = [{k: DATA[rec].get(k) for k in keys}]
    return route.fulfill(status=200, content_type='application/json', headers=HD, body=json.dumps(rows))

LOG15 = pathlib.Path('/tmp/claude-0/motra_15nov.txt').read_text()
LOG17 = LOG15.replace('15 nov 2026, 9:39', '17 nov 2026, 19:05')

def run(vw, lang, testo, nome, scrivi):
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': vw, 'height': 900 if vw > 500 else 844},
                        device_scale_factor=2, is_mobile=vw < 500, has_touch=vw < 500)
        errori = []
        pg.on('pageerror', lambda e: errori.append(str(e)[:300]))
        pg.on('console', lambda m: errori.append('console: ' + m.text[:300]) if m.type == 'error' else None)
        pg.add_init_script("try{localStorage.setItem('dp-auth-skip','1')}catch(e){}")
        pg.add_init_script("try{localStorage.setItem('dp-lang','%s')}catch(e){}" % lang)
        pg.route('**/*', handler)
        pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(3500)
        if lang == 'en':
            el = pg.query_selector('[data-lang="en"], .hdr-lang [data-l="en"]')
            if el: el.click(); pg.wait_for_timeout(800)
        btn = pg.query_selector('button[onclick="motraOpen()"]')
        if not btn:
            print(f'  {nome}: pulsante NON trovato'); b.close(); return False
        btn.click(); pg.wait_for_timeout(1500)
        pg.fill('[data-mt-ta]', testo)
        pg.click('button:has-text("Analizza"), button:has-text("Analyse")'); pg.wait_for_timeout(900)
        pg.screenshot(path=str(OUT / f'{nome}-anteprima.png'), full_page=True)
        testo_ant = pg.evaluate("document.getElementById('motra-modal').innerText")
        if scrivi:
            for giro in range(2):
                bs = pg.query_selector_all('#motra-modal button')
                b2 = bs[-1] if bs else None
                lab = b2.inner_text() if b2 else ''
                if not b2: break
                if 'Chiudi' in lab or 'Close' in lab: break
                b2.click(); pg.wait_for_timeout(2500)
            pg.screenshot(path=str(OUT / f'{nome}-esito.png'), full_page=True)
            testo_ant += '\n---ESITO---\n' + pg.evaluate("document.getElementById('motra-modal')?document.getElementById('motra-modal').innerText:'(chiuso)'")
        (OUT / f'{nome}.txt').write_text(testo_ant)
        print(f'  {nome}: ok, errori pagina: {len(errori)}')
        for e in errori[:5]: print('     !', e)
        b.close()
        return True

print('1) 390 px, log del 15/11 su un giorno diverso (deve avvisare della data)')
run(390, 'it', LOG15, 'mobile-data-diversa', False)
print('2) 1440 px, inglese, solo anteprima')
run(1440, 'en', LOG17, 'desktop-en', False)
print('3) 390 px, log datato oggi, scrittura completa')
run(390, 'it', LOG17, 'mobile-scrittura', True)

print('\nPATCH ricevute:', len(PATCHES))
for rec, body in PATCHES:
    d = body['data']
    if rec == 'giorgio_proto2_2026':
        day = d.get('p2_day_120', {})
        print(' v2 p2_day_120:', {k: v for k, v in day.items() if k.startswith(('wo_', 'sl_')) or k == 'motra_log'} if not day.get('motra_log') else
              {k: (v[:60] + '…' if k == 'motra_log' else v) for k, v in day.items() if k.startswith(('wo_', 'sl_')) or k == 'motra_log'})
    else:
        ses = [s for s in d.get('history_sessions', []) if s.get('date') == '2026-11-17']
        print(' v1 sedute 17/11:', len(ses), '| sentinelle:', json.dumps(d.get('history_sentinels', {}).get('2026-11-17')))
        print(' v1 riepilogo:', json.dumps({x['muscle']: x['volume_kg'] for x in d.get('muscle_volume_summary', [])}))
json.dump([{'rec': r, 'keys': list(b['data'].keys())[:3]} for r, b in PATCHES], open(OUT / 'patches.json', 'w'))
