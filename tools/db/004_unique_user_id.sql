-- 004 — indice unico su diary.user_id
-- 17/11/2026. Trovato durante il collaudo del ripristino: la chiave primaria e' id e su user_id non c'era
-- nessun vincolo. Niente impediva che esistessero due righe con user_id = 'giorgio_proto2_2026': l'app ne
-- avrebbe letta una qualsiasi delle due, e una scrittura sarebbe finita sulla riga sbagliata senza errori.
-- Con questo vincolo un secondo inserimento con lo stesso user_id viene rifiutato dal database.
--
-- Effetto collaterale utile: abilita "insert ... on conflict (user_id) do update", che prima falliva (42P10).
-- Da eseguire nel SQL Editor. La tabella ha 2 righe: il lock e' istantaneo e nulla viene riscritto.

-- 1) controllo preliminare: nessun user_id deve comparire piu' di una volta
select user_id, count(*) righe from public.diary group by user_id order by righe desc;

-- 2) il vincolo
alter table public.diary add constraint diary_user_id_key unique (user_id);

-- 3) verifica
select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid = 'public.diary'::regclass order by conname;
