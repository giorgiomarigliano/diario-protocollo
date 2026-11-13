#!/usr/bin/env python3
"""Genera i dati FINTI per i test automatici (tests/fixtures/), partendo dalla STRUTTURA degli snapshot reali in .snap/.

    python3 tools/audit/make_fixture.py            # scrive tests/fixtures/*.json e stampa il controllo anti-fuga

Nessun valore reale finisce nei file generati:
  - testi liberi (note, alimenti, titoli, log, valutazioni, nomi file)  -> segnaposto numerati, coerenti tra loro (gli id restano collegati)
  - misure e valori numerici (peso, pressione, sonno, esami, DEXA, carichi, nutrienti...) -> numeri casuali (intervalli generici scritti qui, non ricavati dai dati)
  - stati e scale (iniezioni fatte/saltate, integratori, punteggi 1-10)    -> estratti a caso dal vocabolario del campo
  - restano com'erano solo struttura e configurazione gia' pubbliche nel codice: nomi dei campi, date, vocabolari, stato dei vial.
Il seme e' fisso: a parita' di struttura il risultato e' identico.
"""
import json, random, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SNAP, OUT = HERE / '.snap', ROOT / 'tests' / 'fixtures'
RECORDS = ('giorgio_proto2_2026', 'giorgio_protocollo_2026')
SRC = (ROOT / 'v2.html').read_text() + (ROOT / 'index.html').read_text()
rnd = random.Random(20261113)

KEEP = {'v', 'src', 't', 'u', 'ul', 'ver', 'slot', 'cat', 'on', 'attivi', 'dal', 'al', 'stato', 'sentinel', 'last_run_status', 'mg', 'bac_ml', 'vial_mg', 'ref', 'mig',
        'bar', 'ok', 'fav', 'est', 'label', 'unit', 'better', 'key'}
ENUM = {'abdom_full', 'sleep_inj', 'wo_override', 'muscle', 'label'}            # vocabolario del campo, estratto a caso
# storico clinico (clin_data): si tiene l'impalcatura (nomi esami, unita', range, date, esito), si falsificano SEMPRE i valori e i testi liberi
CLIN_PARENTS = {'points', 'instr', 'panels'}
CLIN_KEEP = {'iso', 'date', 'unit', 'ref', 'cat', 'name', 'panel', 'id', 'cens', 'unitMismatch', 'key', 'better', 'ok'}
CLIN_FAKE = {'v', 'val', 'src', 'note', 'label'}   # label di pannello/referto porta il nome del laboratorio
SCALE10 = {'energia', 'umore', 'recupero', 'libido', 'chiarezza', 'appetito', 'sonno_sogg', 'rpe', 'wo_rpe', 'qualita_sonno', 'formicolio', 'pienezza_add', 'ritenzione'}
RANGE = {  # intervalli generici (min, max, decimali): NON derivano dai dati reali
    'peso': (65, 85, 1), 'peso_manual': (65, 85, 1), 'bp_sys': (105, 135, 0), 'bp_dia': (60, 85, 0), 'rhr': (48, 65, 0), 'ore_sonno': (5.5, 8.5, 1),
    'sonno_principale_min': (330, 480, 0), 'sonno_profondo_min': (40, 90, 0), 'sonno_rem_min': (60, 120, 0), 'sonno_veglia_min': (10, 50, 0), 'sonno_risvegli': (0, 4, 0),
    'passi': (4000, 12000, 0), 'wo_durata': (40, 80, 0), 'wo_kcal': (300, 600, 0), 'wo_volume': (5000, 15000, 0), 'circ_addome': (80, 95, 1), 'girovita_cm': (80, 95, 1), 'vita': (80, 95, 1),
    'reps': (5, 15, 0), 'duration_min': (40, 80, 0), 'total_sets': (12, 24, 0), 'kcal': (300, 600, 0), 'volume_kg': (2000, 9000, 0), 'weight': (10, 60, 1), 'min_reps': (6, 12, 0),
}
FREE_PREFIX = {'val': 'valore di prova', 'src': 'Laboratorio di prova', 'label': 'Pannello di prova', 'n': 'Voce di prova', 'note': 'Nota di prova', 'wo_note': 'Nota di prova', 'photo_note': 'Nota di prova', 'testo': 'Testo di prova', 'text': 'Testo di prova',
               'title': 'Seduta di prova', 'motra_log': 'Log di prova', 'fonte': 'Fonte di prova', 'name': 'Esercizio di prova', 'luogo': 'Luogo', 'q': 'porzione', 'repo': 'repo-di-prova'}
NUMRE = re.compile(r'^([<>]?)(-?)(\d+)(?:([.,])(\d+))?$')
DATERE = re.compile(r'^\d{4}-\d{2}-\d{2}(T[\d:.+Z-]*)?$')


def leaf_key(k):
    if re.match(r'^inj_\d_', k): return 'inj_sito' if k.endswith('_sito') else ('inj_distretto' if k.endswith('_distretto') else 'inj')
    if re.match(r'^sl_\w+_(reps|sets|kg)$', k): return 'sl_' + k.rsplit('_', 1)[1]
    if re.match(r'^ck_\w+?(_skip)?$', k): return 'ck'
    return k


def collect(x, key, vocab, parent=''):
    if isinstance(x, dict):
        for k, v in x.items(): collect(v, k, vocab, key)
    elif isinstance(x, list):
        for v in x: collect(v, key, vocab, parent)
    elif isinstance(x, str) and x != '':
        vocab.setdefault('ex_name' if (key == 'name' and parent == 'exercises') else leaf_key(key), set()).add(x)


class Faker:
    def __init__(self, vocab):
        self.vocab = {k: sorted(v) for k, v in vocab.items()}; self.map = {}; self.count = {}

    def free(self, key, s):
        if s not in self.map:
            p = FREE_PREFIX.get(key, 'x'); self.count[p] = self.count.get(p, 0) + 1
            m = re.match(r'^(\d{4}-\d{2}-\d{2})_.*(\.\w+)$', s)
            self.map[s] = f'{m.group(1)}_prova{self.count[p]:04d}{m.group(2)}' if m else (f'{p} {self.count[p]}' if p != 'x' else f'x{self.count[p]}')
        return self.map[s]

    def shape(self, s):
        m = NUMRE.match(s); pre, neg, i, sep, dec = m.groups()
        lo = 10 ** (len(i) - 1) if len(i) > 1 else 1
        out = str(rnd.randint(lo, 10 ** len(i) - 1)) + ((sep + ''.join(rnd.choice('0123456789') for _ in dec)) if dec else '')
        return pre + neg + out

    def ranged(self, key, as_str, sep='.'):
        lo, hi, d = RANGE[key]; v = round(rnd.uniform(lo, hi), d)
        if as_str: return (f'{v:.{d}f}' if d else str(int(v))).replace('.', sep)
        return v if d else int(v)

    def value(self, key, x, parent):
        lk = leaf_key(key)
        if x is None or isinstance(x, bool) or x == '': return x
        if parent in CLIN_PARENTS:            # prima di KEEP: in clin_data 'v' e 'src' sono valore di laboratorio e nome del laboratorio, non versione e provenienza
            if key in CLIN_KEEP: return x
            if key in CLIN_FAKE:
                if isinstance(x, (int, float)):
                    r = self.shape(repr(abs(x)) if isinstance(x, float) else str(abs(int(x))))
                    return float(r) if isinstance(x, float) else int(r)      # stesso tipo dell'originale
                if NUMRE.match(x): return self.shape(x)
                return self.free('val' if key == 'val' else key, x)
        if key in KEEP or (key in ('sc', 'im', 'bac') and parent != 'consumabili_stock'): return x
        if isinstance(x, (int, float)):
            if lk in RANGE: return self.ranged(lk, False)
            if lk in SCALE10: return rnd.randint(1, 10)
            if x == int(x) and 0 <= x <= 1 and lk not in ('k', 'p', 'c', 'g', 'q', 'kg'): return x          # contatori/flag 0-1
            r = self.shape(repr(abs(x)) if isinstance(x, float) else str(abs(int(x)))); return float(r) if isinstance(x, float) else int(r)
        s = x
        if DATERE.match(s): return s
        if re.match(r'^\d{1,2}:\d{2}$', s): return f'{rnd.randint(6, 21):02d}:{rnd.randint(0, 59):02d}'
        if lk == 'ck' and not key.endswith('_skip'): return '1' if rnd.random() < 0.85 else ''   # integratori: presi/non presi a caso
        if key == 'name' and parent == 'exercises':                             # esercizi: a caso tra i nomi gia' nel codice pubblico
            pool = [v for v in self.vocab.get('ex_name', []) if v in SRC and len(v) <= 40]; return rnd.choice(pool) if pool else self.free(key, s)
        if key == 'luogo': pool = [v for v in self.vocab.get('luogo', []) if v in SRC and len(v) <= 40]; return rnd.choice(pool) if pool else self.free(key, s)
        if lk == 'sleep_inj': return ''
        if lk in ('inj', 'inj_sito', 'inj_distretto', 'ck', 'sl_sets') or lk in ENUM:                       # stati: a caso dal vocabolario del campo (solo voci gia' nel codice pubblico o numeriche)
            pool = [v for v in self.vocab.get(lk, []) if NUMRE.match(v) or (v in SRC and len(v) <= 24)]
            return rnd.choice(pool) if pool else self.free(key, s)
        if NUMRE.match(s):
            if lk in RANGE: return self.ranged(lk, True, ',' if ',' in s else '.')
            if lk in SCALE10: return str(rnd.randint(1, 10))
            if lk in ('hrv', 'hrv_min', 'hrv_max'): return s                    # sistemati dopo, coerenti tra loro
            if re.fullmatch(r'[01]', s): return s if lk in ('bkk_riposo',) else rnd.choice('01')
            return self.shape(s)
        if lk in SCALE10: return str(rnd.randint(1, 10))                        # es. appetito testuale nei giorni v1
        if key == 'id' and s.startswith('gt_'): return s                        # giornate tipo: id previsti dal codice
        if key == 'name' and s in SRC and len(s) <= 40: return s                # nomi dei composti (ricostituzioni) gia' nel codice
        return self.free(key, s)

    def walk(self, x, key='', parent=''):
        if isinstance(x, dict):
            out = {k: self.walk(v, k, key) for k, v in x.items()}
            if 'hrv_min' in out or 'hrv_max' in out or 'hrv' in out:           # HRV: minimo < punto medio < massimo
                h = rnd.randint(30, 60)
                for k, v in (('hrv', h), ('hrv_min', h - rnd.randint(5, 12)), ('hrv_max', h + rnd.randint(8, 20))):
                    if out.get(k) not in (None, ''): out[k] = str(v)
            return out
        if isinstance(x, list): return [self.walk(v, key, parent) for v in x]
        return self.value(key, x, parent)


def leak_check(real, fake):
    """Controllo anti-fuga: nessun testo libero reale deve sopravvivere; i numeri uguali nello stesso punto devono essere rari (coincidenze)."""
    free_real, same_num, tot_num = set(), 0, 0
    def w(a, b, key):
        nonlocal same_num, tot_num
        if isinstance(a, dict):
            for k in a: w(a[k], b[k], k)
        elif isinstance(a, list):
            for i in range(len(a)): w(a[i], b[i], key)
        elif isinstance(a, str) and a and not DATERE.match(a):
            if NUMRE.match(a):
                if key not in KEEP: tot_num += 1; same_num += (a == b)
            elif key not in KEEP and not (a in SRC and len(a) <= 40): free_real.add(a)
        elif isinstance(a, (int, float)) and not isinstance(a, bool) and key not in KEEP: tot_num += 1; same_num += (a == b)
    w(real, fake, '')
    blob = json.dumps(fake, ensure_ascii=False)
    survived = [s for s in free_real if len(s) >= 6 and s in blob]
    return survived, same_num, tot_num


def main():
    real = {r: json.loads((SNAP / f'{r}.json').read_text())[0]['data'] for r in RECORDS}
    vocab = {}
    for r in RECORDS: collect(real[r], '', vocab)
    fk = Faker(vocab); OUT.mkdir(parents=True, exist_ok=True); bad = False
    for r in RECORDS:
        fake = fk.walk(real[r]); survived, same, tot = leak_check(real[r], fake)
        (OUT / f'{r}.json').write_text(json.dumps([{'data': fake}], ensure_ascii=False, separators=(',', ':')))
        print(f'{r}: {len(fake)} chiavi, testi reali sopravvissuti {len(survived)}, numeri identici nello stesso punto {same}/{tot}')
        for s in survived[:10]: print('   FUGA:', s[:60])
        bad |= bool(survived)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
