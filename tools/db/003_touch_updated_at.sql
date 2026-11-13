-- 13/11/2026 — "ultimo aggiornamento" sempre vero (da eseguire nel SQL Editor di Supabase)
--
-- Problema trovato il 13/11: diary.updated_at era fermo al 12/11 (riga archivio) e all'11/11 (riga v2),
-- mentre le modifiche vere erano di quel giorno stesso. Causa: v2.html inviava solo { data }, e il campo
-- lo scriveva soltanto v1 (index.html), dal 13/11 archivio in sola lettura. Conseguenze: la data "Caricato"
-- mostrata in v1 era sbagliata e il campo non era piu' utilizzabile per capire se i dati fossero freschi.
--
-- v2.html ora invia updated_at a ogni scrittura. Questo trigger copre anche cio' che l'app non fa:
-- scritture via SQL Editor, correzioni fatte da Claude con l'MCP, script di manutenzione.
-- E' indipendente dal trigger diary_before_update (le guardie e lo storico restano come sono).

create or replace function public.diary_touch_updated_at() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- si tocca solo quando cambia davvero il contenuto, cosi' un UPDATE che non modifica nulla non sposta la data
  if new.data is distinct from old.data then
    new.updated_at := now();
  end if;
  return new;
end $$;

revoke execute on function public.diary_touch_updated_at() from public, anon, authenticated;

-- nome con "a_" davanti: tra piu' trigger BEFORE Postgres segue l'ordine alfabetico, questo gira per primo
drop trigger if exists a_diary_touch_updated_at on public.diary;
create trigger a_diary_touch_updated_at before update on public.diary
  for each row execute function public.diary_touch_updated_at();

-- verifica: dopo un salvataggio dall'app, updated_at e l'ultima riga di storico devono coincidere a meno di pochi secondi
select user_id, updated_at, (select max(changed_at) from diary_history h where h.user_id = d.user_id) ultima_modifica
from diary d where user_id in ('giorgio_protocollo_2026', 'giorgio_proto2_2026');
