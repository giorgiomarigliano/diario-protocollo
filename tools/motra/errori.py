#!/usr/bin/env python3
"""Percorsi d'errore dell'import Motra, valutati dentro la pagina vera."""
import http.server, json, pathlib, re, socketserver, threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path('/home/claude/diario-protocollo')
SNAPDIR = pathlib.Path('/home/claude/diario-protocollo-backups/snapshots/2026-11-17')
BUILD = pathlib.Path('/tmp/claude-0/motra-e2e/build')

def load(prefix):
    f = next(p for p in SNAPDIR.iterdir() if p.name.startswith(prefix))
    rows = json.loads(f.read_text())
    return (rows[0] if isinstance(rows, list) else rows)['data']
DATA = {'giorgio_proto2_2026': load('proto_v2'), 'giorgio_protocollo_2026': load('diario_v1')}

raw = (ROOT / 'v2.html').read_text()
BUILD.mkdir(parents=True, exist_ok=True)
(BUILD / 'index.html').write_text(re.sub(r'var AUTH_REQUIRED\s*=\s*true\s*;', 'var AUTH_REQUIRED = false;', raw))

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=str(BUILD), **k)
    def log_message(s, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
PORT = srv.server_address[1]

FALLISCI_ARCHIVIO = {'on': False}

def handler(route):
    req = route.request; u = req.url
    if 'supabase.co' not in u:
        return route.continue_() if '127.0.0.1' in u else route.abort()
    HD = {'access-control-allow-origin': '*'}
    if '/rest/v1/diary' not in u:
        return route.fulfill(status=200, content_type='application/json', headers=HD, body='[]')
    rec = 'giorgio_proto2_2026' if 'proto2' in u else 'giorgio_protocollo_2026'
    if req.method == 'PATCH':
        if rec == 'giorgio_protocollo_2026' and FALLISCI_ARCHIVIO['on']:
            return route.fulfill(status=500, headers=HD, content_type='application/json', body='{"message":"boom"}')
        DATA[rec] = json.loads(req.post_data)['data']
        return route.fulfill(status=204, headers=HD, body='')
    sel = re.search(r'select=([^&]*)', u)
    sel = sel.group(1) if sel else 'data'
    if sel == 'data':
        rows = [{'data': DATA[rec]}]
    else:
        rows = [{k: DATA[rec].get(k) for k in re.findall(r'data-%3E([a-zA-Z_0-9]+)', sel)}]
    return route.fulfill(status=200, content_type='application/json', headers=HD, body=json.dumps(rows))

LOG = pathlib.Path('/tmp/claude-0/motra_15nov.txt').read_text()

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    err = []
    pg.on('pageerror', lambda e: err.append(str(e)[:200]))
    pg.add_init_script("try{localStorage.setItem('dp-auth-skip','1')}catch(e){}")
    pg.route('**/*', handler)
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(3500)
    pg.evaluate("motraOpen()"); pg.wait_for_timeout(1500)

    print('a) testo non valido  :', pg.evaluate("JSON.stringify(motraPlan('ciao come va', '2026-11-17', MT.v1))")[:120])
    print('b) testo vuoto       :', pg.evaluate("JSON.stringify(motraPlan('', '2026-11-17', MT.v1))")[:120])
    dup = pg.evaluate("motraPlan(%s, '2026-11-15', MT.v1).bloccato" % json.dumps(LOG))
    print('c) seduta gia in arch:', dup[:150])
    mezzo = pg.evaluate("JSON.stringify(motraPlan(%s, '2026-11-17', MT.v1).avvisi)" % json.dumps(LOG.replace('Volume: 14,5K kg', 'Volume: 20K kg')))
    print('d) somma fuori toller:', pg.evaluate("JSON.stringify(motraCoerenza(parseMotraText(%s)))" % json.dumps(LOG.replace('Volume: 14,5K kg', 'Volume: 20K kg'))))
    sconosciuto = LOG.replace('Machine Leg Extension', 'Macchina Sconosciuta XYZ')
    print('e) esercizio nuovo   :', pg.evaluate("JSON.stringify(motraPlan(%s, '2026-11-17', MT.v1).senzaTag)" % json.dumps(sconosciuto)))

    # f) archivio che non risponde: il giorno resta scritto, il pannello lo dice
    FALLISCI_ARCHIVIO['on'] = True
    pg.evaluate("MT.text = %s" % json.dumps(LOG.replace('15 nov 2026, 9:39', '17 nov 2026, 19:05')))
    pg.evaluate("motraAnalizza()"); pg.wait_for_timeout(500)
    pg.evaluate("motraConferma()"); pg.wait_for_timeout(3000)
    print('f) archivio ko       :', pg.evaluate("MT.err") , '| giorno scritto:', 'motra_log' in json.dumps(DATA['giorgio_proto2_2026'].get('p2_day_120', {})))
    print('   errori di pagina  :', err[:3])
    b.close()
