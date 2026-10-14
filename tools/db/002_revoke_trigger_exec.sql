-- 002 · Le funzioni trigger di public.diary non devono essere richiamabili via /rest/v1/rpc.
-- Applicata a produzione il 14/10/2026 (apply_migration "revoke_execute_trigger_functions").
-- Verificata: con EXECUTE revocato un update normale passa e un update distruttivo viene ancora
-- bloccato da diary_block_destructive (il privilegio EXECUTE di una funzione trigger si controlla
-- solo al CREATE TRIGGER, non a ogni scatto).
revoke execute on function public.diary_before_update() from public, anon, authenticated;
revoke execute on function public.diary_block_destructive() from public, anon, authenticated;
