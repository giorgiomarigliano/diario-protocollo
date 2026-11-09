#!/usr/bin/env node
/* T2 Santagostino -> SQL per scrivere lab_final nella riga v1 (NON esegue nulla, stampa soltanto).
   Uso: node tools/t2_lab_final.js igf1=210 gluc=88 insulina=5.1 ...   (virgola o punto accettati)
   Chiavi ammesse = i 16 marker Santagostino di CLIN_MARKERS. Valori non passati restano assenti (nessuna stima). */
const KEYS = ['igf1','gluc','insulina','homa','hb','t_tot','t_lib','shbg','hdl','ldl','tg','e2','creat','crp','lh','fsh'];
const o = {}; const bad = [];
for (const a of process.argv.slice(2)) {
  const [k, v] = a.split('='); if (!KEYS.includes(k)) { bad.push(k); continue; }
  if (!/^[<>]?-?\d+([.,]\d+)?$/.test((v || '').trim())) { bad.push(a); continue; }
  o['lab_' + k] = v.trim().replace(',', '.');
}
if (bad.length) { console.error('Non validi:', bad.join(', '), '\nAmmessi:', KEYS.join(', ')); process.exit(1); }
console.log('-- lab_final (v1 row) — merge, non sovrascrive chiavi gia presenti non indicate');
console.log("update diary set data = jsonb_set(data, '{lab_final}', coalesce(data->'lab_final','{}'::jsonb) || '" + JSON.stringify(o) + "'::jsonb), updated_at = now() where user_id = 'giorgio_protocollo_2026';");
console.log('-- mancanti:', KEYS.filter(k => !('lab_' + k in o)).join(', ') || 'nessuno');
