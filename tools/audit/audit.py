#!/usr/bin/env python3
"""Audit automatico di v2.html — un solo comando, esito pass/fail (exit 0 / 1).

    python3 tools/audit/audit.py [--src v2.html] [--quick] [--en] [--offline] [--update-baseline]

Cosa fa (vedi README.md):
  1. scarica i due record dati (Supabase via proxy, chiave pubblica gia' nel codice) in .snap/ (NON in git)
  2. strumenta v2.html (acorn) e lo serve in locale con Supabase simulato dagli snapshot
  3. crawl: ogni giorno di Oggi (Giorno+Settimana) e click su tutto in Andamento/Clinica/Gestione,
     a 1440 e 390 px (+ EN con --en); gate: 0 testi anomali (undefined/NaN/...), 0 overflow, 0 errori JS
  4. letture "mai presenti" (campo letto sempre senza valore): gate contro baseline.json
  5. coerenza: dayAdherence == AN_dayAdh giorno per giorno, adherence() == somma dei giorni
"""
import argparse, base64, datetime, http.server, json, os, re, shutil, socketserver, subprocess, sys, threading, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SNAP, BUILD, OUT = HERE / '.snap', HERE / '.build', HERE / 'out'
PROXY = 'https://viarmvaukgwdoursfnwu.supabase.co/functions/v1/diario-proxy/rest/v1/diary'
KEY = 'sb_publishable_ppqlo1IbPDjWqnkw_h5wuA_WH8dCtPx'   # chiave pubblica, la stessa di CFG.PROXY_KEY in v2.html
RECORDS = ('giorgio_proto2_2026', 'giorgio_protocollo_2026')
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
BAD = re.compile(r'undefined|NaN|\[object|Infinity|\bnull\b')
DANGER = re.compile(r'elimina|cancella|reset|svuota|salva|registra|importa|scarica|genera|esporta|delete|remove|logout|backup|ripristina|sync|invia|copia|nuovo scatto|excel|pdf', re.I)
CLICKABLE = '#app button, #app [data-an-tab], #app [data-an-fmode], #app summary, #app [role=tab], #app [onclick]'
CYCLE_START = datetime.date(2026, 7, 20)


def fetch_snapshots():
    SNAP.mkdir(exist_ok=True)
    for rec in RECORDS:
        req = urllib.request.Request(f'{PROXY}?user_id=eq.{rec}&select=data', headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}'})
        body = urllib.request.urlopen(req, timeout=60).read()
        rows = json.loads(body)
        if not rows or not rows[0].get('data'):
            sys.exit(f'snapshot vuoto per {rec}: audit interrotto (dati non verificabili)')
        (SNAP / f'{rec}.json').write_bytes(body)


def make_handler(snap_dir):
    def handle(route):
        req = route.request; u = req.url
        if 'supabase.co' not in u:
            return route.continue_() if '127.0.0.1' in u else route.abort()
        if req.method != 'GET':
            return route.abort()          # l'audit NON scrive mai sui dati
        H = {'access-control-allow-origin': '*'}
        if '/rest/v1/diary' not in u:
            return route.fulfill(status=200, content_type='image/png', headers=H, body=PNG)
        rec = 'giorgio_proto2_2026' if 'proto2' in u else 'giorgio_protocollo_2026'
        rows = json.load(open(snap_dir / f'{rec}.json'))
        sel = re.search(r'select=([^&]*)', u).group(1)
        if sel != 'data':
            keys = re.findall(r'data-%3E([a-z_0-9]+)', sel); d = rows[0]['data']
            rows = [{k: d.get(k) for k in keys}]
        route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(rows))
    return handle


def serve():
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(s, *a, **k): super().__init__(*a, directory=str(BUILD), **k)
        def log_message(s, *a): pass
    srv = socketserver.TCPServer(('127.0.0.1', 0), H); srv.allow_reuse_address = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def crawl(p, port, vw, lang, quick):
    res = {'bad': [], 'overflow': [], 'errors': [], 'clicked': 0}
    def scan(pg, label):
        t = pg.evaluate('document.body.innerText')
        for m in BAD.finditer(t):
            res['bad'].append((label, t[max(0, m.start() - 40):m.end() + 40].replace('\n', ' | ')))
        o = pg.evaluate('[document.documentElement.scrollWidth,document.documentElement.clientWidth]')
        if o[0] > o[1] + 1: res['overflow'].append((label, o))
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': vw, 'height': 900}); pg.route('**/*', make_handler(SNAP))
    pg.on('pageerror', lambda e: res['errors'].append(('pageerror', str(e)[:200])))
    pg.on('console', lambda m: res['errors'].append(('console', m.text[:200])) if m.type == 'error' and 'ERR_' not in m.text and 'Failed to load' not in m.text else None)
    pg.goto(f'http://127.0.0.1:{port}/instr.html'); pg.wait_for_timeout(5000)
    if lang == 'en':
        pg.evaluate("[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='EN').click()"); pg.wait_for_timeout(500)
    views = ('Giorno', 'Settimana') if lang == 'it' else ('Day', 'Week')
    for i in range(0, 82, 7 if quick else 1):
        iso = (CYCLE_START + datetime.timedelta(days=i)).isoformat()
        for v in views:
            try:
                pg.evaluate(f"selDate='{iso}'; render();"); pg.click(f'button:text-is("{v}")', timeout=1500); pg.wait_for_timeout(60)
            except Exception: pass
            scan(pg, f'oggi {iso} {v}')
    for k, tab in enumerate(('Oggi', 'Andamento', 'Clinica', 'Gestione')):
        if k == 0: continue
        pg.click(f'button.hdr-tab >> nth={k}'); pg.wait_for_timeout(800); scan(pg, tab)
        seen = set()
        for _ in range(3):
            n = pg.evaluate(f"document.querySelectorAll('{CLICKABLE}').length")
            for j in range(min(n, 400)):
                try:
                    info = pg.evaluate("""k=>{const e=[...document.querySelectorAll(%r)][k];if(!e||!e.offsetParent)return null;return {t:(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,40),sig:e.tagName+'|'+e.className+'|'+(e.innerText||'').trim().slice(0,40)+'|'+Object.values(e.dataset).join(',')}}""" % CLICKABLE, j)
                    if not info or DANGER.search(info['t']) or info['sig'] in seen: continue
                    seen.add(info['sig'])
                    pg.evaluate("k=>[...document.querySelectorAll(%r)][k].click()" % CLICKABLE, j)
                    pg.wait_for_timeout(120); res['clicked'] += 1; scan(pg, f'{tab} click {info["t"]}')
                except Exception as e:
                    res['errors'].append(('driver', str(e)[:120]))
            pg.wait_for_timeout(300)
    miss = pg.evaluate('window.__miss'); tot = pg.evaluate('window.__tot'); b.close()
    return res, miss, tot


CONSIST_JS = '''()=>{
 const out={A:[],B:null};
 const t0=new Date('2026-07-20T00:00:00'); const todayIdx=dayIdxFromISO(today);
 for(let i=0;i<=todayIdx;i++){
   const d=new Date(t0);d.setDate(d.getDate()+i);const iso=isoLocal(d);
   const a=dayAdherence(iso), b=__AN_dayAdh(i); const diff=[];
   if(a.injDone!==b.injDone||a.injTot!==b.injTot)diff.push('inj '+a.injDone+'/'+a.injTot+' vs '+b.injDone+'/'+b.injTot);
   if(a.suppDone!==b.suppDone||a.suppTot!==b.suppTot)diff.push('supp '+a.suppDone+'/'+a.suppTot+' vs '+b.suppDone+'/'+b.suppTot);
   if((a.woPlanned?1:0)!==b.woTot)diff.push('woPlanned '+a.woPlanned+' vs woTot '+b.woTot);
   if(a.woPlanned&&(a.woDone?1:0)!==b.woDone)diff.push('woDone '+a.woDone+' vs '+b.woDone);
   if(diff.length)out.A.push(iso+' (idx '+i+'): '+diff.join('; '));
 }
 const ad=adherence(store.blob); let s={injDone:0,injTot:0,suppDone:0,suppTot:0,woDone:0,woTot:0};
 const ts=new Date(TEST_PROTO_START+'T00:00:00'),td=new Date(today+'T00:00:00');
 for(let d=new Date(ts);d<=td;d.setDate(d.getDate()+1)){const r=dayAdherence(isoLocal(d));s.injDone+=r.injDone;s.injTot+=r.injTot;s.suppDone+=r.suppDone;s.suppTot+=r.suppTot;if(r.woPlanned){s.woTot++;if(r.woDone)s.woDone++;}}
 out.B={adherence:ad,sumDay:s};
 return out;}'''


def consist(p, port):
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1440, 'height': 900}); pg.route('**/*', make_handler(SNAP))
    pg.goto(f'http://127.0.0.1:{port}/exp.html'); pg.wait_for_timeout(4500)
    r = pg.evaluate(CONSIST_JS); b.close()
    problems = list(r['A'])
    ad, sm = r['B']['adherence'], r['B']['sumDay']
    for k, v in sm.items():
        if k in ad and ad[k] != v: problems.append(f'adherence().{k}={ad[k]} ma somma giorni={v}')
    return problems, r['B']


def build(src):
    BUILD.mkdir(exist_ok=True)
    r = subprocess.run(['node', str(HERE / 'instr.js'), str(src), str(BUILD / 'instr.html')], capture_output=True, text=True)
    if r.returncode or 'fails []' not in r.stdout: sys.exit('strumentazione fallita: ' + (r.stdout + r.stderr)[-400:])
    html = Path(src).read_text()
    if 'function AN_dayAdh(' not in html: sys.exit('AN_dayAdh non trovata: aggiornare audit.py (test di coerenza)')
    (BUILD / 'exp.html').write_text(html.replace('function AN_dayAdh(', 'window.__AN_dayAdh=AN_dayAdh;\nfunction AN_dayAdh(', 1))


def never_present(miss, tot):
    return sorted({m['k'] for key, m in miss.items() if m['n'] == tot.get(key, 0)})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=str(ROOT / 'v2.html')); ap.add_argument('--quick', action='store_true')
    ap.add_argument('--en', action='store_true'); ap.add_argument('--offline', action='store_true')
    ap.add_argument('--update-baseline', action='store_true')
    a = ap.parse_args()
    if not a.offline or not all((SNAP / f'{r}.json').exists() for r in RECORDS): fetch_snapshots()
    if not (HERE / 'node_modules' / 'acorn').exists(): subprocess.run(['npm', 'install', '--silent'], cwd=HERE, check=True)
    build(a.src); OUT.mkdir(exist_ok=True)
    srv, port = serve(); fails = []; allnever = set(); runs = [(1440, 'it'), (390, 'it')] + ([(1440, 'en')] if a.en else [])
    with sync_playwright() as p:
        for vw, lang in runs:
            res, miss, tot = crawl(p, port, vw, lang, a.quick)
            allnever |= set(never_present(miss, tot))
            tag = f'{vw}/{lang}'
            print(f'[{tag}] click {res["clicked"]}  anomali {len(res["bad"])}  overflow {len(res["overflow"])}  errori {len(res["errors"])}')
            for k in ('bad', 'overflow', 'errors'):
                for x in res[k][:8]: fails.append(f'[{tag}] {k}: {x}')
        problems, B = consist(p, port)
        print(f'[coerenza] {len(problems)} divergenze  (woDone/woTot {B["adherence"].get("woDone")}/{B["adherence"].get("woTot")})')
        fails += [f'[coerenza] {x}' for x in problems[:10]]
    bl = HERE / 'baseline.json'
    if a.update_baseline: bl.write_text(json.dumps(sorted(allnever), indent=1)); print('baseline aggiornata:', len(allnever), 'campi')
    elif bl.exists():
        new = sorted(allnever - set(json.load(open(bl))))
        print(f'[letture mai presenti] {len(allnever)} campi, {len(new)} nuovi rispetto alla baseline')
        fails += [f'[mai presente] campo letto senza mai un valore: {k}' for k in new]
    else: print('baseline.json assente: eseguire con --update-baseline su un codice noto per buono')
    srv.shutdown()
    print('\nAUDIT', 'FALLITO' if fails else 'OK')
    for f in fails: print(' -', f)
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
