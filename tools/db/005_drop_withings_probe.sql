-- 005_drop_withings_probe.sql — 24/11/2026
-- Elimina la tabella di prova usata durante il collaudo dell'integrazione Withings
-- (ottobre 2026). Non e' letta da nessuna funzione ne' dall'app: verificato il
-- 24/11/2026 con una ricerca su `withings_probe` nel sorgente delle edge function
-- versionate in diario-protocollo-backups/functions/ e in v2.html.
-- E' una DDL, quindi la esegue Giorgio nel SQL Editor (le DDL di Claude vengono annullate).
-- Contiene 1 riga di prova, nessun dato reale.

drop table if exists public.withings_probe;

-- verifica: deve restituire 0
select count(*) as tabelle_rimaste
from information_schema.tables
where table_schema = 'public' and table_name = 'withings_probe';
