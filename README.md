# Diario Protocollo

Diario personale di allenamento, biometria e protocollo per un ciclo di 112 giorni. Due app a pagina singola, servite da GitHub Pages:

| File | Cosa è |
|---|---|
| `v2.html` | App attuale (Ciclo 1, dal 20/07/2026): Oggi, Andamento, Clinica, Gestione. |
| `index.html` | App precedente (v1, warm-up e storico). |
| `test-passkey.html` | Prova di accesso con passkey (sperimentale, non collegata all'app). |

Nessuna build: ogni app è un singolo file HTML con CSS e JS in linea, aperto direttamente dal browser.

## Dati
Archiviati in Supabase (tabella `diary`, una riga per app). L'app non parla direttamente col database: passa da una Edge Function (`diario-proxy`). Sul database ci sono una guardia contro le scritture distruttive, uno storico giornaliero e un registro delle anomalie: vedi `tools/db/`.

**Questo repository è pubblico: non committare mai dati sanitari, referti, valori di laboratorio o dosaggi personali.** Regole complete e procedura di backup in `SAFETY.md`.

## Calendario del ciclo
In `v2.html` date e durata del ciclo (inizio, 112 giorni, T0, T1, T2, fine) sono definite **una sola volta**, nella costante `CAL`. Non riscriverle altrove: `tests/v2.static.test.js` fallisce se ricompaiono.

## Controlli prima di pubblicare
    node tests/v2.static.test.js        # statici, 1 secondo: sintassi, chiavi/id duplicati, calendario
    python3 tools/audit/audit.py        # rendering a 1440 e 390 px, coerenza dei conteggi (vedi tools/audit/README.md)
    node tests/regression.test.js       # regressione di index.html (v1)

Pubblicazione: push su `main` (GitHub Pages ricostruisce da solo). Prima di ogni modifica fare un fetch fresco del file, vedi `SAFETY.md`.

## Cartelle
- `tools/audit/`: audit automatico di `v2.html` (Playwright + strumentazione acorn).
- `tools/db/`: migrazioni SQL, guardia e storico di `public.diary`, con collaudo locale.
- `tests/`: test di regressione e controlli statici.
