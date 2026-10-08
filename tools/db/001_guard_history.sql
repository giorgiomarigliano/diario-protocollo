-- 001 — Guardia sui dati, storico e segnalazione anomalie per public.diary
-- Applicata il 08/10/2026 (vedi tools/db/README.md). Idempotente: si puo' rieseguire.
--
-- Cosa fa (tutto nel database, nessuna modifica all'app):
--  1. diary_history: (a) uno snapshot completo per riga e per giorno (stato PRIMA della prima scrittura del giorno,
--     fuso Europe/Rome); (b) un registro delle modifiche per chiave di primo livello con valore vecchio e nuovo.
--  2. Guardia: blocca UPDATE che azzerano il dato o fanno sparire troppe chiavi (sovrascrittura con copia vecchia),
--     blocca DELETE e TRUNCATE. Per un intervento voluto: SET LOCAL app.allow_destructive = 'on' nella stessa transazione.
--  3. diary_anomalies: segnala (senza bloccare) valori fuori scala nei giorni p2_day_N modificati.
--  4. Pulizia: storico e snapshot piu' vecchi di 120 giorni vengono eliminati alla prima scrittura del giorno.

create table if not exists public.diary_history (
  id         bigint generated always as identity primary key,
  diary_id   bigint      not null,
  user_id    text,
  kind       text        not null check (kind in ('snapshot','change')),
  day        date        not null default ((now() at time zone 'Europe/Rome')::date),
  changed_at timestamptz not null default now(),
  data       jsonb,      -- kind='snapshot': stato completo della riga prima della prima scrittura del giorno
  changes    jsonb       -- kind='change':   {"<chiave>": {"old": ..., "new": ...}}
);
create index if not exists diary_history_lookup on public.diary_history (diary_id, day, kind);
create index if not exists diary_history_time   on public.diary_history (changed_at);

create table if not exists public.diary_anomalies (
  id          bigint generated always as identity primary key,
  diary_id    bigint      not null,
  user_id     text,
  detected_at timestamptz not null default now(),
  day_key     text        not null,
  field       text        not null,
  value       text,
  rule        text        not null
);

alter table public.diary_history   enable row level security;
alter table public.diary_anomalies enable row level security;
revoke all on public.diary_history, public.diary_anomalies from anon, authenticated;

-- ── UPDATE: guardia + storico + anomalie ──────────────────────────────────────
create or replace function public.diary_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  override boolean := coalesce(current_setting('app.allow_destructive', true), '') = 'on';
  today    date    := (now() at time zone 'Europe/Rome')::date;
  old_n    int; lost int; chg jsonb; k text; f text; ov text; nv text; num numeric; r record;
begin
  -- 1. guardia
  if not override then
    if NEW.data is null or jsonb_typeof(NEW.data) <> 'object' then
      raise exception 'diary guard: data nullo o non oggetto (user_id=%). Per forzare: SET LOCAL app.allow_destructive=''on''', OLD.user_id;
    end if;
    if OLD.data is not null and jsonb_typeof(OLD.data) = 'object' then
      select count(*) into old_n from jsonb_object_keys(OLD.data);
      select count(*) into lost  from jsonb_object_keys(OLD.data) x where not (NEW.data ? x);
      if lost >= 3 or lost * 20 > old_n then
        raise exception 'diary guard: la scrittura farebbe sparire % chiavi su % (user_id=%): probabile sovrascrittura con una copia vecchia. Per forzare: SET LOCAL app.allow_destructive=''on''', lost, old_n, OLD.user_id;
      end if;
    end if;
  end if;

  if OLD.data is null or jsonb_typeof(OLD.data) <> 'object' or NEW.data is null or jsonb_typeof(NEW.data) <> 'object' then
    return NEW;
  end if;

  -- 2. snapshot giornaliero (una volta per riga e per giorno) + pulizia
  if not exists (select 1 from diary_history where diary_id = OLD.id and kind = 'snapshot' and day = today) then
    insert into diary_history (diary_id, user_id, kind, day, data) values (OLD.id, OLD.user_id, 'snapshot', today, OLD.data);
    delete from diary_history where changed_at < now() - interval '120 days';
  end if;

  -- 3. registro modifiche per chiave di primo livello
  select jsonb_object_agg(x.key, jsonb_build_object('old', OLD.data -> x.key, 'new', NEW.data -> x.key))
    into chg
    from (select key from jsonb_object_keys(OLD.data) key union select key from jsonb_object_keys(NEW.data) key) x
   where (OLD.data -> x.key) is distinct from (NEW.data -> x.key);
  if chg is null then return NEW; end if;
  insert into diary_history (diary_id, user_id, kind, day, changes) values (OLD.id, OLD.user_id, 'change', today, chg);

  -- 4. anomalie (solo segnalazione) sui campi modificati dei giorni p2_day_N
  for k in select key from jsonb_object_keys(chg) key where key ~ '^p2_day_[0-9]+$' loop
    if jsonb_typeof(NEW.data -> k) <> 'object' then continue; end if;
    for r in
      select * from (values
        ('peso',40,200),('hrv',5,250),('hrv_min',5,250),('hrv_max',5,250),('rhr',30,120),
        ('bp_sys',80,220),('bp_dia',40,130),('ore_sonno',0.1,14),('rpe',1,10)
      ) t(field, lo, hi)
    loop
      nv := NEW.data -> k ->> r.field; ov := OLD.data -> k ->> r.field;
      if nv is distinct from ov and nv is not null and btrim(nv) <> '' then
        if replace(btrim(nv), ',', '.') !~ '^-?[0-9]+(\.[0-9]+)?$' then
          insert into diary_anomalies (diary_id, user_id, day_key, field, value, rule) values (OLD.id, OLD.user_id, k, r.field, nv, 'non_numerico');
        else
          num := replace(btrim(nv), ',', '.')::numeric;
          if num < r.lo or num > r.hi then
            insert into diary_anomalies (diary_id, user_id, day_key, field, value, rule) values (OLD.id, OLD.user_id, k, r.field, nv, 'fuori_scala ' || r.lo || '-' || r.hi);
          end if;
        end if;
      end if;
    end loop;
    -- HRV: minimo non puo' superare il massimo
    if (NEW.data -> k ->> 'hrv_min') ~ '^[0-9]+(\.[0-9]+)?$' and (NEW.data -> k ->> 'hrv_max') ~ '^[0-9]+(\.[0-9]+)?$'
       and (NEW.data -> k ->> 'hrv_min')::numeric > (NEW.data -> k ->> 'hrv_max')::numeric
       and ((NEW.data -> k ->> 'hrv_min') is distinct from (OLD.data -> k ->> 'hrv_min') or (NEW.data -> k ->> 'hrv_max') is distinct from (OLD.data -> k ->> 'hrv_max')) then
      insert into diary_anomalies (diary_id, user_id, day_key, field, value, rule)
      values (OLD.id, OLD.user_id, k, 'hrv_min/hrv_max', (NEW.data -> k ->> 'hrv_min') || '>' || (NEW.data -> k ->> 'hrv_max'), 'min_maggiore_di_max');
    end if;
  end loop;
  return NEW;
end $$;

drop trigger if exists diary_before_update on public.diary;
create trigger diary_before_update before update on public.diary
  for each row execute function public.diary_before_update();

-- ── DELETE / TRUNCATE: bloccati salvo override ────────────────────────────────
create or replace function public.diary_block_destructive() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.allow_destructive', true), '') = 'on' then
    if TG_OP = 'DELETE' then return OLD; end if;
    return null;
  end if;
  raise exception 'diary guard: % su diary bloccato. Per forzare: SET LOCAL app.allow_destructive=''on''', TG_OP;
end $$;

drop trigger if exists diary_block_delete on public.diary;
create trigger diary_block_delete before delete on public.diary
  for each row execute function public.diary_block_destructive();
drop trigger if exists diary_block_truncate on public.diary;
create trigger diary_block_truncate before truncate on public.diary
  for each statement execute function public.diary_block_destructive();
