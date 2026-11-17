# Import Motra — prove

Il codice dell'import vive in `v2.html` (cerca `IMPORT MOTRA`): `parseMotraText`,
`MOTRA_SENTINEL_MAP`, le conversioni, il piano di scrittura e il pannello.
È l'unica implementazione: il percorso SQL di Claude legge le stesse funzioni da lì.

Tre livelli di prova, dal più leggero al più pesante.

### 1. Regole, senza browser e senza dati veri — in CI

    node tests/motra.test.js

Estrae le funzioni vere da `v2.html` e le esegue su un log **inventato**. Fissa le
regole della KB sezione 12: `wo_volume` dal totale dichiarato da Motra, riepilogo
muscoli con la somma grezza non raddoppiata, raddoppi solo nel controllo di
coerenza (tolleranza ±60 kg), mappa delle sentinelle che non si allarga.

### 2. Andata e ritorno su una seduta vera

    node tools/motra/fixture.js

Ricostruisce il testo del log dal `motra_log` di una seduta già in archivio
(snapshot del repo privato dei backup) e verifica che il parser torni allo stesso
JSON, con lo stesso volume, le stesse sentinelle e lo stesso scarto di coerenza
registrato quel giorno. Scrive il testo in `/tmp/claude-0/motra_15nov.txt`, che
serve alla prova 3. Nessun dato esce dalla sandbox e nulla viene scritto nel repo.

### 3. Pannello nel browser vero, scrittura compresa

    python3 tools/motra/e2e.py        # anteprima a 390 e 1440 px (IT/EN) + import completo
    python3 tools/motra/errori.py     # percorsi d'errore

Server finto **con stato**: le PATCH vengono applicate a una copia in memoria dei
due record, così la rilettura di controllo dell'app vede davvero ciò che ha
scritto. Si parte dagli snapshot del repo dei backup: **il database vero non viene
mai toccato**. `errori.py` copre testo non valido, seduta già in archivio, somma
fuori tolleranza, esercizio senza tag muscolo e archivio che risponde 500 (il
giorno resta scritto e il pannello lo dice).

Le prove 2 e 3 richiedono il repo privato `diario-protocollo-backups` accanto a
questo; in CI gira solo la prova 1.
