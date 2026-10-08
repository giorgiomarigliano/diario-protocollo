# Audit automatico di v2.html

Un comando, esito pass/fail (exit 0 = OK, 1 = fallito):

    python3 tools/audit/audit.py            # completo (~3 min per viewport)
    python3 tools/audit/audit.py --quick    # Oggi ogni 7 giorni (controllo rapido, piu' falsi positivi sulla baseline)
    python3 tools/audit/audit.py --en       # aggiunge il giro in inglese
    python3 tools/audit/audit.py --src X    # audit di un altro file (es. versione precedente)

Requisiti: Python 3 + playwright (Chromium), Node + npm (acorn si installa da solo in `tools/audit/node_modules`).

## Cosa controlla
1. **Crawl** a 1440 e 390 px: ogni giorno di Oggi (Giorno e Settimana) e click su tutti i controlli di Andamento, Clinica, Gestione (esclusi quelli che scrivono/esportano). Gate: 0 testi anomali (`undefined`, `NaN`, `[object`, `Infinity`, `null`), 0 overflow orizzontale, 0 errori JS.
2. **Letture "mai presenti"**: v2.html viene strumentato (acorn) e ogni lettura `oggetto.campo` registra se il campo manca. Un campo letto sempre e mai trovato e' quasi sempre un nome sbagliato (cosi' furono trovati `inj` e `workout` dello Scrubber). Gate: nessun campo nuovo rispetto a `baseline.json`.
3. **Coerenza**: `dayAdherence` == `AN_dayAdh` per ogni giorno del ciclo; `adherence()` == somma dei giorni.

## Dati
Gli snapshot dei due record Supabase si scaricano a ogni run in `.snap/` (**ignorato da git: sono dati di salute, non vanno mai committati**) con la chiave pubblica gia' presente in v2.html. L'audit usa solo GET e simula il proxy in locale: non scrive mai sui dati. `--offline` riusa gli snapshot gia' scaricati.

## Baseline
`baseline.json` = campi che legittimamente non hanno mai un valore oggi (dati assenti nel ciclo corrente). Se l'audit segnala un campo nuovo: prima verificare nel codice se e' un errore; solo se e' legittimo, `--update-baseline` su codice noto per buono e commit del file.

## Limiti (non verificabile qui)
Non copre Safari/iPhone reale, i flussi che scrivono dati (salva, importa, esporta Excel/PDF), ne' la correttezza clinica dei valori: controlla coerenza interna e assenza di rotture visibili.
