#!/usr/bin/env node
/* Ripristino dal backup: genera l'SQL da eseguire nel SQL Editor di Supabase. NON scrive nulla da solo.
   Serve quando una chiave e' stata rovinata o persa (il caso normale) o, in casi estremi, per rimettere l'intera riga.

     node tools/db/restore_from_backup.js <snapshot.json> --chiave p2_day_57 [--chiave food_20261112]   # ripristino mirato (consigliato)
     node tools/db/restore_from_backup.js <snapshot.json> --tutto                                       # intera riga (ultima risorsa)
     node tools/db/restore_from_backup.js <snapshot.json> --prova                                        # collaudo su una riga di prova, senza toccare i dati veri

   L'SQL stampato va riletto prima di eseguirlo. In testa c'e' sempre una SELECT di controllo e in coda una di verifica.
   Gli snapshot stanno nel repo privato diario-protocollo-backups, cartella snapshots/AAAA-MM-GG/.  */
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const chiavi = args.map((a, i) => a === '--chiave' ? args[i + 1] : null).filter(Boolean);
const TUTTO = args.includes('--tutto'), PROVA = args.includes('--prova');
if (!file || (!chiavi.length && !TUTTO && !PROVA)) { console.error('uso: node tools/db/restore_from_backup.js <snapshot.json> (--chiave <nome> | --tutto | --prova)'); process.exit(1); }

const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
const data = (Array.isArray(rows) ? rows[0] : rows).data;
if (!data || !Object.keys(data).length) { console.error('snapshot vuoto o non valido: ' + file); process.exit(1); }
const base = path.basename(file);
const USER = base.startsWith('proto_v2') ? 'giorgio_proto2_2026' : 'giorgio_protocollo_2026';
const q = o => "$dp$" + JSON.stringify(o) + "$dp$::jsonb";   // niente apici da raddoppiare: delimitatore $dp$
const W = ` where user_id = '${USER}'`;
const out = [`-- ripristino da ${base} (snapshot del ${(base.match(/\d{4}-\d{2}-\d{2}/) || ['?'])[0]}) — riga ${USER}`,
  `-- generato da tools/db/restore_from_backup.js, da rileggere ed eseguire nel SQL Editor`];

if (PROVA) {
  /* Collaudo end-to-end su una riga separata: dimostra che lo snapshot si riscrive davvero nel database.
     La riga di prova si cancella solo con l'override delle guardie (il trigger diary_block_destructive blocca le DELETE). */
  const prova = 'prova_ripristino_' + new Date().toISOString().slice(0, 10).replace(/-/g, '');
  out.push(`-- COLLAUDO: scrive su una riga di prova (${prova}), confronta con la riga vera e poi la elimina. I dati veri non vengono toccati.`,
    'begin;',
    `insert into diary (user_id, data) values ('${prova}', ${q(data)}) on conflict (user_id) do update set data = excluded.data;`,
    `-- confronto: stesse chiavi e stesse dimensioni della riga vera?`,
    `select (select count(*) from jsonb_object_keys(p.data)) chiavi_prova, (select count(*) from jsonb_object_keys(v.data)) chiavi_vere,
       length(p.data::text) byte_prova, length(v.data::text) byte_veri,
       (select count(*) from jsonb_each(p.data) a full join jsonb_each(v.data) b on a.key = b.key where a.value is distinct from b.value) chiavi_diverse
     from diary p, diary v where p.user_id = '${prova}' and v.user_id = '${USER}';`,
    `-- pulizia: le DELETE sono bloccate dalle guardie, serve l'override esplicito solo per questa riga di prova`,
    `set local app.allow_destructive = 'on';`,
    `delete from diary where user_id = '${prova}';`,
    'commit;',
    `-- verifica finale: la riga di prova non deve piu' esistere e la riga vera deve essere intatta`,
    `select user_id, (select count(*) from jsonb_object_keys(data)) chiavi, length(data::text) byte from diary where user_id in ('${prova}', '${USER}');`);
} else if (TUTTO) {
  out.push(`-- ATTENZIONE: riscrive l'INTERA riga. Tutto cio' che e' stato registrato dopo lo snapshot viene perso.`,
    `-- Prima di eseguire, confronta cosa c'e' adesso:`,
    `select (select count(*) from jsonb_object_keys(data)) chiavi, length(data::text) byte, updated_at from diary${W};`,
    `-- (lo snapshot ha ${Object.keys(data).length} chiavi e ${JSON.stringify(data).length} byte)`,
    'begin;',
    `update diary set data = ${q(data)}${W};`,
    'commit;',
    `select (select count(*) from jsonb_object_keys(data)) chiavi, length(data::text) byte, updated_at from diary${W};`);
} else {
  const mancanti = chiavi.filter(k => data[k] === undefined);
  if (mancanti.length) { console.error('chiavi non presenti nello snapshot: ' + mancanti.join(', ')); process.exit(1); }
  out.push(`-- ripristino mirato di ${chiavi.length} chiave/i: ${chiavi.join(', ')}`,
    `-- valore attuale (da leggere prima, per sapere cosa si sta sostituendo):`,
    `select ${chiavi.map(k => `length((data->'${k}')::text) "${k}"`).join(', ')} from diary${W};`,
    'begin;');
  chiavi.forEach(k => out.push(`update diary set data = jsonb_set(data, '{${k}}', ${q(data[k])})${W};`));
  out.push('commit;',
    `-- verifica: le dimensioni devono coincidere con quelle dello snapshot (${chiavi.map(k => k + '=' + JSON.stringify(data[k]).length).join(', ')})`,
    `select ${chiavi.map(k => `length((data->'${k}')::text) "${k}"`).join(', ')} from diary${W};`);
}
console.log(out.join('\n'));
console.error(`\nSQL su stdout. Riga: ${USER}. Snapshot: ${base} (${Object.keys(data).length} chiavi, ${Math.round(JSON.stringify(data).length / 1024)} KB).`);
