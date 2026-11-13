# Audit automatico di v2.html

Un comando, esito pass/fail (exit 0 = OK, 1 = fallito):

    python3 tools/audit/audit.py --backup-dir ../diario-protocollo-backups   # completo (~3 min per viewport)
    python3 tools/audit/audit.py --quick    # Oggi ogni 7 giorni (controllo rapido, piu' falsi positivi sulla baseline)
    python3 tools/audit/audit.py --en       # aggiunge il giro in inglese
    python3 tools/audit/audit.py --src X    # audit di un altro file (es. versione precedente)

Requisiti: Python 3 + playwright (Chromium), Node + npm (acorn si installa da solo in `tools/audit/node_modules`).

## Cosa controlla
1. **Crawl** a 1440 e 390 px: ogni giorno di Oggi (Giorno e Settimana) e click su tutti i controlli di Andamento, Clinica, Gestione (esclusi quelli che scrivono/esportano). Gate: 0 testi anomali (`undefined`, `NaN`, `[object`, `Infinity`, `null`), 0 overflow orizzontale, 0 errori JS.
2. **Letture "mai presenti"**: v2.html viene strumentato (acorn) e ogni lettura `oggetto.campo` registra se il campo manca. Un campo letto sempre e mai trovato e' quasi sempre un nome sbagliato (cosi' furono trovati `inj` e `workout` dello Scrubber). Gate: nessun campo nuovo rispetto a `baseline.json`.
3. **Coerenza**: `dayAdherence` == `AN_dayAdh` per ogni giorno del ciclo; `adherence()` == somma dei giorni.

## Dati
Dal 14/10/2026 il proxy richiede il login, quindi l'audit non scarica piu' i dati da solo: li prende dall'ultimo snapshot del repo **privato** dei backup con `--backup-dir <cartella del repo>` e li copia in `.snap/` (**ignorata da git: sono dati di salute, non vanno mai committati**). `--offline` riusa gli snapshot gia' presenti. L'audit usa solo GET e simula il proxy in locale: non scrive mai sui dati. La copia di prova gira con l'accesso in modalita' permissiva (`AUTH_REQUIRED = false` solo nella copia in `.build/`); il login si prova a parte con `tools/auth/test_auth.py`.

Coerenza allenamenti: dal 24/10/2026 `adherence()` usa lo standard di 5 sedute a settimana (`woCycleStats`), quindi si confronta con quello e non con la somma del piano giornaliero.

## Baseline
`baseline.json` = campi che legittimamente non hanno mai un valore oggi (dati assenti nel ciclo corrente). Se l'audit segnala un campo nuovo: prima verificare nel codice se e' un errore; solo se e' legittimo, `--update-baseline` su codice noto per buono e commit del file.

## Limiti (non verificabile qui)
Non copre Safari/iPhone reale, i flussi che scrivono dati (salva, importa, esporta Excel/PDF), ne' la correttezza clinica dei valori: controlla coerenza interna e assenza di rotture visibili.

## Test automatici (GitHub Actions) e dati finti
A ogni push su `main` il workflow `.github/workflows/test.yml` esegue test statici, test di regressione e questo audit (desktop, iPhone, inglese) su **dati finti**:

    python3 tools/audit/audit.py --data-dir tests/fixtures --today 2026-11-12 --baseline tools/audit/baseline.fake.json --en

- `tests/fixtures/*.json` si rigenerano con `python3 tools/audit/make_fixture.py` a partire dalla sola STRUTTURA degli snapshot reali in `.snap/`: testi liberi sostituiti da segnaposto, misure/esami/DEXA/carichi/nutrienti sostituiti da numeri casuali, stati (iniezioni, integratori, scale 1-10) estratti a caso. Lo script termina con errore se un testo reale sopravvive.
- Restano reali solo struttura e configurazione gia' pubbliche nel codice: nomi dei campi, date (giorni con dati, sedute, foto), stato e date dei vial, pausa.
- `--today` ferma l'orologio del browser: il test non dipende dal giorno in cui gira. Dopo aver rigenerato i dati finti: aggiornare `--today` nel workflow e `baseline.fake.json` (`--update-baseline` con gli stessi parametri).
- L'audit sui dati reali (`--backup-dir`) resta il controllo da fare in locale prima di pubblicare: i dati finti non coprono i casi particolari dei dati veri.
