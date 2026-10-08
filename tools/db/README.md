# Guardia, storico e anomalie per `public.diary`

- `001_guard_history.sql`: migrazione (idempotente). **Stato: APPLICATA a produzione l'08/10/2026** (SQL Editor di Supabase; l'applicazione via MCP veniva annullata dall'ambiente). Verificata: 2 tabelle, 2 funzioni, 3 trigger su `diary`, primo snapshot creato per entrambe le righe, guardia provata con rollback (3 chiavi su 117 rifiutate).
- `test_001.sql`: collaudo su un Postgres locale vuoto (mai su produzione). Esito atteso: `TUTTI I TEST OK` (16 test).

## Cosa fa
1. Snapshot completo una volta per riga e per giorno (stato prima della prima scrittura del giorno) in `diary_history`, e registro delle modifiche per chiave con valore vecchio/nuovo. Conservazione 120 giorni.
2. Rifiuta UPDATE che azzerano `data` o fanno sparire 3 o piu' chiavi (o oltre il 5%), e DELETE/TRUNCATE. Override voluto: `SET LOCAL app.allow_destructive = 'on'` nella stessa transazione.
3. `diary_anomalies`: segnala senza bloccare valori fuori scala nei giorni `p2_day_N` modificati (peso, HRV, RHR, pressione, ore di sonno, RPE; HRV min > max).

## Collaudo locale
    initdb in una cartella temporanea, avvio su porta libera, poi:
    psql -d t -c "create role anon; create role authenticated;"
    cd tools/db && psql -d t -f test_001.sql

## Ripristino (esempi)
    -- stato di un giorno specifico
    select data->'p2_day_80' from diary_history where kind='snapshot' and diary_id=<id> and day='2026-10-08';
    -- cosa e' cambiato su una chiave
    select changed_at, changes->'p2_day_80' from diary_history where kind='change' and changes ? 'p2_day_80' order by id desc;
