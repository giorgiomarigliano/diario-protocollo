#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// Test dell'import Motra — Diario Protocollo (17/11/2026)
//
// Esegue le funzioni VERE estratte da v2.html (unica implementazione: il
// percorso SQL di Claude legge le stesse funzioni da li'), valutate in un
// contesto isolato come fa tests/regression.test.js.
//
// Il log di prova e' INVENTATO: il repo e' pubblico, qui non entrano sedute
// vere. Serve solo a fissare le regole, che sono quelle della KB sezione 12:
//   1. wo_volume = il totale dichiarato da Motra, mai una somma calcolata;
//   2. riepilogo muscoli = somma grezza kg x ripetizioni, tutte le serie,
//      mai raddoppiata, volume pieno a ciascun tag di un tag combinato;
//   3. i raddoppi (manubri, cavi a doppio stack, Single-Arm) vivono solo nel
//      controllo di coerenza, tolleranza +-60 kg;
//   4. la mappa delle sentinelle non si allarga per agganciare una variante.
//
// Uso: node tests/motra.test.js
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'v2.html'), 'utf-8');
let passed = 0, failed = 0;
function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  OK  ${label}`); }
  else { failed++; console.log(`  KO  ${label}\n      atteso:   ${JSON.stringify(expected)}\n      ottenuto: ${JSON.stringify(actual)}`); }
}
function ok(cond, label) { if (cond) { passed++; console.log(`  OK  ${label}`); } else { failed++; console.log(`  KO  ${label}`); } }

function block(s, start, open, close) {
  let depth = 0, end = start;
  for (; end < s.length; end++) {
    if (s[end] === open) depth++;
    else if (s[end] === close) { depth--; if (depth === 0) { end++; break; } }
  }
  return s.slice(start, end);
}
function fn(name) {
  const i = src.indexOf(`function ${name}(`);
  if (i === -1) throw new Error('funzione non trovata in v2.html: ' + name);
  return block(src, i, '{', '}');
}
function cst(name) {
  const m = `const ${name} = `;
  const i = src.indexOf(m);
  if (i === -1) throw new Error('costante non trovata in v2.html: ' + name);
  const openChar = src[i + m.length], closeChar = openChar === '{' ? '}' : ']';
  return src.slice(i, i + m.length) + block(src, i + m.length, openChar, closeChar) + ';';
}

const ctx = {
  console, LANG: 'it',
  isoLocal: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
};
vm.createContext(ctx);
[cst('MOTRA_SENTINEL_MAP'), cst('MOTRA_MESI'), cst('MOTRA_DOPPI'),
 fn('mtT'), fn('parseMotraText'), fn('motraParseDate'), fn('motraVolume'), fn('motraDurata'), fn('motraKcal'),
 fn('motraSentinels'), fn('motraVolEx'), fn('motraRaddoppia'), fn('motraCoerenza'), fn('motraMuscleMap'), fn('motraPlan'),
].forEach((code) => vm.runInContext(code, ctx));

/* Log inventato. Numeri scelti perche' i conti si facciano a mente:
   Machine Leg Press   3x10x100 = 3.000 (macchina, non si raddoppia)
   Dumbbell Curl       3x10x20  = 600, nel controllo vale 1.200 (manubri x2)
   Cable Fly High      2x10x25  = 500, nel controllo vale 1.000 (doppio stack)
   Rope Pushdown       2x10x30  = 600, resta 600 (stack singolo)
   totale grezzo 5.200 (3.500+600+500+600) · totale del controllo 6.300 */
const LOG = [
  'Il mio allenamento:',
  'Seduta di prova',
  '3 mar 2026, 18:30',
  'Durata: 1h 5m',
  'Volume: 5,8K kg',   // volume dichiarato apposta sbagliato: deve far scattare il controllo
  'Calorie: 300 cal',
  'Esercizi:',
  'Machine Leg Press',
  'Riscaldamento: 10 ripetizioni x 50 kg',
  '1: 10 ripetizioni x 100 kg',
  '2: 10 ripetizioni x 100 kg',
  '3: 10 ripetizioni x 100 kg',
  'Dumbbell Curl',
  '1: 10 ripetizioni x 20 kg',
  '2: 10 ripetizioni x 20 kg',
  '3: 10 ripetizioni x 20 kg',
  'Cable Fly High',
  '1: 10 ripetizioni x 25 kg',
  '2: 10 ripetizioni x 25 kg',
  'Rope Pushdown',
  '1: 10 ripetizioni x 30 kg',
  '2: 10 ripetizioni x 30 kg',
  'Tracciato con Motra.',
].join('\n');

console.log('\n1) lettura del testo');
const d = ctx.parseMotraText(LOG);
eq(d.title, 'Seduta di prova', 'titolo');
eq(d.date, '3 mar 2026, 18:30', 'riga data');
eq([d.durata, d.volume, d.calorie], ['1h 5m', '5,8K kg', '300 cal'], 'durata, volume, calorie');
eq(d.exercises.length, 4, '4 esercizi');
eq(d.exercises[0].sets[0], { label: 'W', reps: 10, kg: 50 }, 'il riscaldamento ha label W');
eq(d.exercises[0].sets[1].label, '1', 'le serie di lavoro tengono il numero');

console.log('\n2) conversioni');
eq(ctx.motraParseDate(d.date), { iso: '2026-03-03', time: '18:30' }, 'data e ora');
eq(ctx.motraParseDate('15 nov 2026, 9:39'), { iso: '2026-11-15', time: '09:39' }, 'mese abbreviato italiano');
eq(ctx.motraParseDate('5 Aug 2026'), { iso: '2026-08-05', time: null }, 'mese inglese, senza ora');
eq(ctx.motraParseDate('ieri mattina'), null, 'data non riconoscibile: null, non una data inventata');
eq([ctx.motraVolume('5,8K kg'), ctx.motraVolume('14,5K kg'), ctx.motraVolume('850 kg')], [5800, 14500, 850], 'volume dalla stringa');
eq([ctx.motraDurata('1h 5m'), ctx.motraDurata('45m'), ctx.motraDurata('2h')], [65, 45, 120], 'durata in minuti');
eq(ctx.motraKcal('300 cal'), 300, 'calorie');

console.log('\n3) volume: somma grezza e controllo di coerenza');
eq(d.exercises.map(ctx.motraVolEx), [3500, 600, 500, 600], 'somma grezza per esercizio (riscaldamento incluso)');
eq(d.exercises.map((e) => ctx.motraRaddoppia(e.name)), [false, true, true, false], 'raddoppiano solo manubri e cavo a doppio stack');
ok(ctx.motraRaddoppia('Cable Single-Arm Front Raise'), 'Single-Arm raddoppia');
ok(!ctx.motraRaddoppia('Cable Bar Curl'), 'sbarra su stack singolo non raddoppia');
ok(!ctx.motraRaddoppia('Straight Arm Pull Down'), '"Arm" nel nome non basta a raddoppiare');
const c = ctx.motraCoerenza(d);
eq([c.dichiarato, c.somma, c.scarto, c.ok], [5800, 6300, 500, false], 'controllo fuori tolleranza se i conti non tornano');
eq(ctx.motraCoerenza(Object.assign({}, d, { volume: '6,3K kg' })).ok, true, 'controllo a posto col totale giusto');
const quasi = ctx.motraCoerenza(Object.assign({}, d, { volume: '6360 kg' }));
eq([quasi.scarto, quasi.ok], [-60, true], 'tolleranza: 60 kg di scarto passa');
eq(ctx.motraCoerenza(Object.assign({}, d, { volume: '6361 kg' })).ok, false, 'tolleranza: 61 kg no');

console.log('\n4) sentinelle');
const s = ctx.motraSentinels(d);
eq(Object.keys(s).sort(), ['cablefly', 'dbcurl', 'legpress', 'tridown'], 'quattro sentinelle riconosciute');
eq(s.legpress, { kg: '100', reps: '10', sets: '3', esercizi: ['Machine Leg Press'] }, 'miglior serie, riscaldamento escluso dal conteggio');
const variante = ctx.parseMotraText(LOG.replace('Dumbbell Curl', 'Machine Hammer-Grip Preacher Curl'));
ok(!ctx.motraSentinels(variante).hammercurl && !ctx.motraSentinels(variante).dbcurl, 'una variante che non corrisponde resta senza sentinella');
const pari = ctx.parseMotraText(LOG.replace('2: 10 ripetizioni x 20 kg', '2: 12 ripetizioni x 20 kg'));
eq(ctx.motraSentinels(pari).dbcurl.reps, '12', 'a parita\' di carico vince la serie con piu\' ripetizioni');
const tolleranza = ctx.parseMotraText(LOG.replace('3: 10 ripetizioni x 100 kg', '3: 14 ripetizioni x 98 kg'));
eq(tolleranza.exercises[0].sets.length, 4, 'serie lette');
eq(ctx.motraSentinels(tolleranza).legpress.kg, '98', 'entro il 97% del massimo conta il numero di ripetizioni');

console.log('\n5) piano di scrittura');
const v1 = {
  history_sessions: [{ date: '2026-02-01', exercises: [
    { name: 'Machine Leg Press', muscle: 'quads, glutes' },
    { name: 'Dumbbell Curl', muscle: 'biceps' },
    { name: 'Rope Pushdown', muscle: 'triceps' },
  ] }],
  history_sentinels: {},
};
const p = ctx.motraPlan(LOG, '2026-03-03', v1);
eq(p.campi.wo_volume, '5800', 'wo_volume = il totale dichiarato da Motra, non la somma calcolata');
eq([p.campi.wo_durata, p.campi.wo_kcal], ['65', '300'], 'durata e calorie sul giorno');
eq(JSON.parse(p.campi.motra_log).exercises.length, 4, 'motra_log salvato come stringa JSON');
eq(p.incrementi, { quads: 3500, glutes: 3500, biceps: 600, triceps: 600 }, 'tag combinato: volume pieno a ciascun muscolo, mai raddoppiato');
eq(p.senzaTag, ['Cable Fly High'], 'esercizio mai visto: nessun tag inventato');
eq(p.seduta.exercises[2].muscle, '', 'in archivio il tag resta vuoto, non indovinato');
eq(p.seduta.time, '18:30', 'ora della seduta dalla riga data');
eq(p.seduta.exercises[0].sets[0], { kg: 50, reps: 10, label: 'W' }, 'riscaldamento marcato W anche in archivio');
eq(p.seduta.exercises[0].sets[1], { kg: 100, reps: 10 }, 'le serie di lavoro in archivio non hanno label');
ok(p.sentFlat.sl_legpress_kg === '100' && p.sentFlat.sl_legpress_sets === '3', 'campi sentinella del giorno');
ok(p.avvisi.some((a) => a.includes('Cable Fly High') || a.includes('tag muscolo')), 'avvisa degli esercizi senza tag');
ok(!p.bloccato, 'niente blocchi su un giorno libero');
const dup = ctx.motraPlan(LOG, '2026-02-01', v1);
ok(!!dup.bloccato, 'se in archivio c\'e\' gia\' una seduta per quel giorno, l\'import si ferma');
eq(ctx.motraPlan('due righe a caso', '2026-03-03', v1).err !== undefined, true, 'testo non valido: errore, nessun piano');

console.log('\n' + '-'.repeat(50));
console.log(`Risultato: ${passed} passati, ${failed} falliti`);
process.exit(failed ? 1 : 0);
