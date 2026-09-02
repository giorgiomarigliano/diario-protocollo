#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// Test di regressione — Diario Protocollo
// (D2, Fase D, 27/07/2026 — R1+R2, 13/08/2026)
//
// Esegue le funzioni VERE estratte da index.html (non copie riscritte a
// mano, che rischierebbero di disallinearsi silenziosamente dal codice
// reale). Estrae il testo sorgente delle singole funzioni tramite un
// conteggio delle parentesi graffe, poi lo valuta in un contesto isolato
// (vm module) con solo le costanti/stub minimi necessari — senza eseguire
// l'intero script (che ha effetti collaterali: fetch di rete, accesso al
// DOM reale, ecc. — inadatti a un ambiente di test headless).
//
// Uso: node tests/regression.test.js
// Uscita: 0 se tutti i test passano, 1 altrimenti (adatto a CI/script).
//
// Copre i bug scoperti e corretti tra il 22/07 e il 13/08/2026:
//   1. Split settimanale (getWorkout / getWorkout2)
//   2. Buco Test Protocollo in getSessionsAll (18-19/7 esclusi dal conteggio)
//   3. Mappatura sentinel lift — presenza/etichette (SENTINEL_GROUPS)
//   4. resolveDay() coerente con getWorkout/getWorkout2 (D1)
//   5. Presenza del fix "ricostruzione dopo Sync" (dashBuilt/_proto2Built)
//   6. MOTRA_SENTINEL_MAP — esclusioni equipaggiamento (R3, 13/08/2026:
//      incbench/lat/rdl/legpress matchavano varianti sbagliate)
//   7. getWorkout2 durante BKK (bkk_riposo, 07/08/2026)
//   8. getWorkoutVolume2 — fallback su motra_log (09-10/08/2026)
//   9. Formattazione date foto — fotoFormatDate/Short (07/08/2026)
//
// R1 (13/08/2026): il blocco 2 era rotto dal 28/07 (migrazione di
// getSessionsAll a resolveDay() in D4) — il test non era mai stato
// aggiornato per iniettare resolveDay nel contesto isolato, quindi girava
// solo il blocco 1 e tutto da qui in poi non veniva eseguito. Corretto.
// R2 (13/08/2026): aggiunti i blocchi 6-9 sopra, a copertura del codice
// scritto dopo la Fase D che oggi non aveva alcun test automatico.
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX_PATH = path.join(__dirname, '..', 'index.html');
const source = fs.readFileSync(INDEX_PATH, 'utf-8');

let passed = 0, failed = 0;
function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ✅ ${label}`); }
  else {
    failed++;
    console.log(`  ❌ ${label}`);
    console.log(`     atteso:  ${JSON.stringify(expected)}`);
    console.log(`     ottenuto: ${JSON.stringify(actual)}`);
  }
}
function assertTrue(cond, label) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}`); }
}

// ── Estrae il testo sorgente di una funzione top-level per nome,
// contando le parentesi graffe fino alla chiusura corrispondente ──
function extractFunction(src, name) {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`Funzione non trovata nel sorgente: ${name}`);
  let i = src.indexOf('{', start);
  let depth = 0, end = i;
  for (; end < src.length; end++) {
    if (src[end] === '{') depth++;
    else if (src[end] === '}') { depth--; if (depth === 0) { end++; break; } }
  }
  return src.slice(start, end);
}

// ── Estrae il testo sorgente di una costante object/array top-level ──
function extractConst(src, name) {
  const marker = `const ${name} = `;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`Costante non trovata nel sorgente: ${name}`);
  const openChar = src[start + marker.length];
  const closeChar = openChar === '{' ? '}' : ']';
  let i = start + marker.length;
  let depth = 0, end = i;
  for (; end < src.length; end++) {
    if (src[end] === openChar) depth++;
    else if (src[end] === closeChar) { depth--; if (depth === 0) { end++; break; } }
  }
  // 'var' invece di 'const': in vm.runInContext solo i binding 'var' (e le
  // function declaration) diventano proprieta' leggibili dell'oggetto
  // contesto: un 'const' resterebbe una binding lessicale invisibile da fuori.
  return 'var ' + src.slice(start + 'const '.length, end);
}

console.log('═══ 1. Split settimanale (getWorkout / getWorkout2) ═══');
{
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(`
    const START = new Date('2026-06-08');
    const START2 = new Date('2026-07-20');
    function isBkkDate(d) { return false; }
    function isBKK(i) { return i>=60&&i<=74; }
    let _lastData2 = {};
    ${extractConst(source, 'SPLIT')}
    ${extractFunction(source, 'getWorkout')}
    ${extractFunction(source, 'getWorkout2')}
  `, ctx);

  assertEqual(ctx.getWorkout(0).type, 'Riposo', 'day_0 (8/6, lunedì) = Riposo');
  assertEqual(ctx.getWorkout(4).type, 'Legs', 'day_4 (12/6, venerdì) = Legs');
  assertEqual(ctx.getWorkout(39).type, 'Legs', 'day_39 (17/7, venerdì, ultimo warm-up) = Legs');
  assertEqual(ctx.getWorkout2(0).type, 'Riposo', 'p2_day_0 (20/7, lunedì) = Riposo');
  assertEqual(ctx.getWorkout2(4).type, 'Legs', 'p2_day_4 (24/7, venerdì) = Legs');
  assertEqual(ctx.getWorkout2(5).type, 'Upper Sab', 'p2_day_5 (25/7, sabato) = Upper Sab');
  assertEqual(ctx.getWorkout2(6).type, 'Upper Dom', 'p2_day_6 (26/7, domenica) = Upper Dom');
  assertEqual(ctx.getWorkout2(-2).type, 'Upper Sab', 'dayIdx -2 (18/7 via indici negativi) = Upper Sab');
  assertEqual(ctx.getWorkout2(-1).type, 'Upper Dom', 'dayIdx -1 (19/7 via indici negativi) = Upper Dom');
}

console.log('\n═══ 2. Buco Test Protocollo in getSessionsAll ═══');
{
  const ctx = { console, document: { querySelector: () => null } };
  vm.createContext(ctx);
  vm.runInContext(`
    const START = new Date('2026-06-08');
    const START2 = new Date('2026-07-20');
    const TEST_PROTO_START = new Date('2026-07-18');
    const TEST_PROTO_DAYS = 2;
    const TOTAL_DAYS = 112;
    const TOTAL_DAYS2 = 500;
    function isBkkDate(d) { return false; }
    function isBKK(i) { return i>=60&&i<=74; }
    let _lastData = {
      day_39: { wo_volume: '19900' }
    };
    let _lastData2 = {
      test_proto_0: { wo_volume: '10500' },
      test_proto_1: { wo_volume: '14900' },
      p2_day_0: { wo_volume: '' },
    };
    ${extractConst(source, 'SPLIT')}
    ${extractFunction(source, 'getWorkout')}
    ${extractFunction(source, 'getWorkout2')}
    ${extractFunction(source, 'resolveDay')}
    ${extractFunction(source, 'getWorkoutVolume2')}
    ${extractFunction(source, 'getSessionsAll')}
  `, ctx);

  // Forza 'oggi' al 20/7 cosi' la finestra di 10gg copre sicuramente 18-19/7.
  // Il vm non condivide il Date globale di Node: la sovrascrittura avviene
  // dentro la IIFE stessa, scoped al contesto del vm.
  const sessions = vm.runInContext(`
    (function(){
      const _origDate = Date;
      Date = class extends _origDate {
        constructor(...args) {
          if (args.length === 0) return new _origDate('2026-07-20T12:00:00');
          return new _origDate(...args);
        }
      };
      const result = getSessionsAll(10);
      Date = _origDate;
      return result;
    })()
  `, ctx);

  const testProtoSessions = sessions.filter(s => s.date.toISOString().slice(0,10) === '2026-07-18' || s.date.toISOString().slice(0,10) === '2026-07-19');
  assertTrue(testProtoSessions.length === 2, 'getSessionsAll include i 2gg di Test Protocollo (18-19/7) nella finestra');
  assertTrue(testProtoSessions.every(s => s.volume !== null), 'entrambi i giorni Test Protocollo hanno un volume valorizzato (non null)');
}

console.log('\n═══ 3. Mappatura sentinel lift ═══');
{
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(extractConst(source, 'SENTINEL_GROUPS'), ctx);
  const groups = ctx.SENTINEL_GROUPS;

  // Verifica puntuale sui campi che hanno causato i bug del 27/07/2026
  const shoulder = groups.shoulder || groups.shoulders;
  assertTrue(!!shoulder, 'gruppo spalle presente in SENTINEL_GROUPS');
  if (shoulder) {
    const dbpressIdx = shoulder.ids.indexOf('dbpress');
    assertTrue(dbpressIdx !== -1, "campo 'dbpress' presente nel gruppo spalle");
    if (dbpressIdx !== -1) {
      assertTrue(shoulder.labels[dbpressIdx].toLowerCase().includes('db press'),
        "'dbpress' è etichettato come 'DB Press' (Dumbbell Shoulder Press), non Front Raise");
    }
  }
  const chest = groups.chest;
  assertTrue(!!chest, 'gruppo petto presente in SENTINEL_GROUPS');
  if (chest) {
    const incbenchIdx = chest.ids.indexOf('incbench');
    if (incbenchIdx !== -1) {
      assertTrue(chest.labels[incbenchIdx].toLowerCase().includes('incline'),
        "'incbench' è etichettato come Incline (non Decline)");
    }
  }
}

console.log('\n═══ 4. resolveDay() coerente con getWorkout/getWorkout2 (D1) ═══');
{
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(`
    const START = new Date('2026-06-08');
    const TOTAL_DAYS = 112;
    const START2 = new Date('2026-07-20');
    const TOTAL_DAYS2 = 500;
    const TEST_PROTO_START = new Date('2026-07-18');
    const TEST_PROTO_DAYS = 2;
    function isBkkDate(d) { return false; }
    function isBKK(i) { return i>=60&&i<=74; }
    let _lastData2 = {};
    ${extractConst(source, 'SPLIT')}
    ${extractFunction(source, 'getWorkout')}
    ${extractFunction(source, 'getWorkout2')}
    ${extractFunction(source, 'resolveDay')}
  `, ctx);

  assertEqual(ctx.resolveDay('2026-07-18').id, 'test_proto_0', "resolveDay('18/7') = test_proto_0");
  assertEqual(ctx.resolveDay('2026-07-18').workout.type, 'Upper Sab', "resolveDay('18/7').workout = Upper Sab");
  assertEqual(ctx.resolveDay('2026-07-20').id, 'p2_day_0', "resolveDay('20/7') = p2_day_0");
  assertEqual(ctx.resolveDay('2026-06-08').id, 'day_0', "resolveDay('8/6') = day_0");
}

console.log('\n═══ 5. Fix "ricostruzione dopo Sync" presente nel sorgente ═══');
{
  assertTrue(
    source.includes('_proto2Built = false; c2.innerHTML') || source.includes("_proto2Built = false;"),
    "loadFromCloud() resetta _proto2Built (ricostruisce il tab Protocollo v2 dopo Sync)"
  );
  assertTrue(
    source.includes('dashBuilt = false; dash.innerHTML'),
    "refreshDashChartsIfBuilt() resetta dashBuilt (ricostruisce la Dashboard dopo Sync)"
  );
}

// ═══════════════════════════════════════════════════════════════
// R2 (13/08/2026): copertura per il codice scritto dopo la Fase D
// (22/07-27/07), rimasto scoperto — BKK, Foto (data/ora/luogo, workout
// volume fallback), matching sentinel Motra. Aggiunta insieme a R1 (fix
// del blocco 2 sopra) nella stessa sessione di manutenzione.
// ═══════════════════════════════════════════════════════════════

console.log('\n═══ 6. MOTRA_SENTINEL_MAP — esclusioni equipaggiamento (R3, 13/08/2026) ═══');
{
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(`${extractConst(source, 'MOTRA_SENTINEL_MAP')}`, ctx);
  const map = ctx.MOTRA_SENTINEL_MAP;

  function matches(sentinelId, exerciseName) {
    const cfg = map[sentinelId];
    const n = exerciseName.toLowerCase();
    const hasKw = cfg.kw.some(kw => n.includes(kw.toLowerCase()));
    const hasEx = cfg.ex.some(ex => n.includes(ex.toLowerCase()));
    return hasKw && !hasEx;
  }

  // Bug scoperto l'11/08/2026 lavorando su un log Motra reale: 'incline
  // bench press' da solo matchava anche la variante Dumbbell.
  assertTrue(matches('incbench', 'Machine Incline Bench Press'), "incbench matcha Machine Incline Bench Press");
  assertTrue(!matches('incbench', 'Dumbbell Incline Bench Press'), "incbench NON matcha Dumbbell Incline Bench Press");
  assertTrue(!matches('incbench', 'Smith Machine Incline Bench Press'), "incbench NON matcha Smith Machine Incline Bench Press");

  // Bug scoperto il 13/08/2026 nel controllo sistematico su tutto lo storico:
  // 'lat pull down wide' da solo matchava anche le varianti Cable.
  assertTrue(matches('lat', 'Machine Lat Pull Down Wide-Grip'), "lat matcha Machine Lat Pull Down Wide-Grip");
  assertTrue(!matches('lat', 'Cable Lat Pull Down Wide-Grip'), "lat NON matcha Cable Lat Pull Down Wide-Grip");
  assertTrue(!matches('lat', 'Cable Lat Pull Down Wide Hammer'), "lat NON matcha Cable Lat Pull Down Wide Hammer");

  // 'romanian deadlift'/'rdl' da soli matchavano anche Dumbbell e Smith Machine.
  assertTrue(matches('rdl', 'Barbell Romanian Deadlift'), "rdl matcha Barbell Romanian Deadlift");
  assertTrue(!matches('rdl', 'Dumbbell Romanian Deadlift'), "rdl NON matcha Dumbbell Romanian Deadlift");
  assertTrue(!matches('rdl', 'Smith Machine Romanian Deadlift'), "rdl NON matcha Smith Machine Romanian Deadlift");

  // Commento diceva esplicitamente "NON moving chair" ma l'esclusione non
  // era mai stata implementata nel codice.
  assertTrue(matches('legpress', 'Machine Leg Press'), "legpress matcha Machine Leg Press");
  assertTrue(!matches('legpress', 'Machine Leg Press (Moving Chair)'), "legpress NON matcha Moving Chair (commento lo escludeva già)");

  // pecfly e hammercurl: multi-match VOLUTO, non toccati dal fix — verifica
  // che restino così (se un giorno qualcuno li stringesse per errore
  // pensando fossero bug, questo test si romperebbe e farebbe da promemoria).
  assertTrue(matches('pecfly', 'Cable Fly Mid') && matches('pecfly', 'Machine Fly (Pec Dec)'),
    "pecfly matcha sia Cable che Machine (voluto, non un bug)");
}

console.log('\n═══ 7. getWorkout2 durante BKK (07/08/2026) ═══');
{
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(`
    const START2 = new Date('2026-07-20');
    function isBkkDate(d) {
      const s = new Date('2026-08-07'); s.setHours(0,0,0,0);
      const e = new Date('2026-08-21'); e.setHours(0,0,0,0);
      const dd = new Date(d); dd.setHours(0,0,0,0);
      return dd >= s && dd <= e;
    }
    let _lastData2 = {
      p2_day_19: { bkk_riposo: '1' },
      p2_day_20: {},
    };
    ${extractFunction(source, 'getWorkout2')}
  `, ctx);

  // p2_day_18 = 7 ago (dentro BKK), nessun override -> default allenamento
  assertEqual(ctx.getWorkout2(18).type, 'Allenamento BKK', "p2_day_18 (7 ago, BKK, nessun override) = Allenamento BKK");
  // p2_day_19 = 8 ago, bkk_riposo='1' -> Riposo
  assertEqual(ctx.getWorkout2(19).type, 'Riposo', "p2_day_19 (8 ago, bkk_riposo=1) = Riposo");
  // p2_day_20 = 9 ago, record vuoto (non '1') -> default allenamento
  assertEqual(ctx.getWorkout2(20).type, 'Allenamento BKK', "p2_day_20 (9 ago, bkk_riposo assente) = Allenamento BKK");
  // p2_day_4 = 24 luglio, fuori dalla finestra BKK -> split normale
  assertEqual(ctx.getWorkout2(4).type, 'Legs', "p2_day_4 (24 lug, fuori BKK) = split normale (Legs)");
}

console.log('\n═══ 8. getWorkoutVolume2 — fallback su motra_log (09-10/08/2026) ═══');
{
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(extractFunction(source, 'getWorkoutVolume2'), ctx);

  assertEqual(ctx.getWorkoutVolume2(null), null, "record assente -> null");
  assertEqual(ctx.getWorkoutVolume2({}), null, "record vuoto -> null");
  assertEqual(ctx.getWorkoutVolume2({ wo_volume: '11300' }), 11300, "wo_volume diretto valorizzato -> usa quello");
  assertEqual(
    ctx.getWorkoutVolume2({ motra_log: JSON.stringify({ volume: '6,5K kg' }) }),
    6500,
    "wo_volume assente, fallback su motra_log.volume ('6,5K kg' -> 6500)"
  );
  assertEqual(
    ctx.getWorkoutVolume2({ wo_volume: '', motra_log: JSON.stringify({ volume: '2K kg' }) }),
    2000,
    "wo_volume vuoto (stringa), fallback su motra_log -> 2000"
  );
  assertEqual(
    ctx.getWorkoutVolume2({ motra_log: 'non è json valido' }),
    null,
    "motra_log corrotto (non parsabile) -> null, nessun crash"
  );
}

console.log('\n═══ 9. Formattazione date foto — fotoFormatDate/Short (07/08/2026) ═══');
{
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(`
    ${extractConst(source, 'FOTO_MESI')}
    ${extractConst(source, 'FOTO_MESI_ABBR')}
    ${extractFunction(source, 'fotoFormatDate')}
    ${extractFunction(source, 'fotoFormatDateShort')}
  `, ctx);

  assertEqual(ctx.fotoFormatDate('2026-08-07'), '7 agosto 2026', "fotoFormatDate('2026-08-07') = '7 agosto 2026'");
  assertEqual(ctx.fotoFormatDate('2026-01-18'), '18 gennaio 2026', "fotoFormatDate('2026-01-18') = '18 gennaio 2026'");
  assertEqual(ctx.fotoFormatDateShort('2026-08-07'), '7 ago', "fotoFormatDateShort('2026-08-07') = '7 ago'");
  assertEqual(ctx.fotoFormatDateShort('2026-12-25'), '25 dic', "fotoFormatDateShort('2026-12-25') = '25 dic'");
}

console.log(`\n═══════════════════════════════════`);
console.log(`Risultato: ${passed} passati, ${failed} falliti`);
process.exit(failed > 0 ? 1 : 0);
