#!/usr/bin/env node
/* Controllo della catena di backup (repo privato diario-protocollo-backups).
   Verifica che gli snapshot siano completi e leggibili, che nessuna chiave sia sparita e che nessuna si sia ridotta
   di colpo: sono i guasti che rendono inutile un backup e che non si vedono finche' non serve ripristinarlo.

     node tools/db/backup_check.js [cartella-del-repo-backup] [--giorni N] [--verboso]

   Esce con 1 se trova un problema. Non scrive nulla: legge solo i file del repo di backup.  */
const fs = require('fs'), path = require('path');
const ROOT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', '..', '..', 'diario-protocollo-backups');
const GIORNI = (() => { const i = process.argv.indexOf('--giorni'); return i > 0 ? parseInt(process.argv[i + 1], 10) : 7; })();
const VERBOSO = process.argv.includes('--verboso');
const SNAP = fs.existsSync(path.join(ROOT, 'snapshots')) ? path.join(ROOT, 'snapshots') : ROOT;

/* chiavi che devono esserci in ogni snapshot: se una sparisce, il backup e' monco */
const ATTESE = {
  proto_v2: ['food_lib', 'proto_pausa', 'consumabili_stock', 'peptide_reconstitution'],
  diario_v1: ['history_sessions', 'history_sentinels', 'photo_log', 'stock_v2_vials', 'lab_wk8', 'lab_final', 'dexa_t1', 'dexa_t2', 'muscle_volume_summary'],
};
const GIORNI_PREFISSO = { proto_v2: 'p2_day_', diario_v1: 'day_' };
const CALO = 0.2;   // una chiave che perde oltre il 20% rispetto al giorno prima e' sospetta

const problemi = [], note = [];
function leggi(f) {
  let j;
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { problemi.push(`${path.basename(f)}: non leggibile (${e.message})`); return null; }
  const rows = Array.isArray(j) ? j : [j];
  const d = rows[0] && rows[0].data;
  if (!d || typeof d !== 'object' || !Object.keys(d).length) { problemi.push(`${path.basename(f)}: snapshot vuoto o senza campo data`); return null; }
  return d;
}
function tipo(f) { return path.basename(f).startsWith('proto_v2') ? 'proto_v2' : 'diario_v1'; }

/* ultimo snapshot di ciascun tipo per ciascun giorno, negli ultimi GIORNI giorni presenti */
const giorni = fs.readdirSync(SNAP).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
if (!giorni.length) { console.error('nessuno snapshot in ' + SNAP); process.exit(1); }
const finestra = giorni.slice(-GIORNI);
const serie = { proto_v2: [], diario_v1: [] };
for (const g of finestra) {
  for (const t of ['proto_v2', 'diario_v1']) {
    const f = fs.readdirSync(path.join(SNAP, g)).filter(x => x.startsWith(t) && x.endsWith('.json')).sort().pop();
    if (!f) { problemi.push(`${g}: manca lo snapshot ${t}`); continue; }
    const d = leggi(path.join(SNAP, g, f));
    if (!d) continue;
    const dim = {}; Object.keys(d).forEach(k => { dim[k] = JSON.stringify(d[k]).length; });
    serie[t].push({ giorno: g, file: f, dati: d, dim, tot: Object.values(dim).reduce((a, b) => a + b, 0) });
  }
}

for (const t of ['proto_v2', 'diario_v1']) {
  const s = serie[t]; if (!s.length) { problemi.push(`${t}: nessuno snapshot leggibile nella finestra`); continue; }
  const ultimo = s[s.length - 1];
  // 1. chiavi attese
  ATTESE[t].forEach(k => { if (ultimo.dati[k] === undefined) problemi.push(`${t} ${ultimo.giorno}: manca la chiave ${k}`); });
  // 2. giorni consecutivi, senza buchi
  const pre = GIORNI_PREFISSO[t];
  const idx = Object.keys(ultimo.dati).filter(k => k.startsWith(pre)).map(k => +k.slice(pre.length)).filter(n => !isNaN(n)).sort((a, b) => a - b);
  if (idx.length) {
    /* i giorni futuri sono legittimamente sparsi (dosi gia' dichiarate saltate, riposi di Bangkok): la continuita' si pretende solo fino a oggi */
    const oggiIdx = Math.floor((Date.parse(ultimo.giorno + 'T12:00:00Z') - Date.parse('2026-07-20T12:00:00Z')) / 86400000);
    const limite = t === 'proto_v2' ? Math.min(idx[idx.length - 1], oggiIdx) : idx[idx.length - 1];
    const futuri = idx.filter(n => n > limite);
    if (futuri.length) note.push(`${t}: ${futuri.length} giorni futuri gia' impostati (${futuri.map(n => pre + n).join(', ')})`);
    const mancanti = [];
    for (let i = idx[0]; i < limite; i++) if (!idx.includes(i)) mancanti.push(i);
    if (mancanti.length) problemi.push(`${t} ${ultimo.giorno}: giorni mancanti nella sequenza ${pre}: ${mancanti.slice(0, 12).join(', ')}${mancanti.length > 12 ? '…' : ''}`);
    note.push(`${t}: giorni ${pre}${idx[0]}…${pre}${limite} senza buchi (${idx.length} chiavi in tutto)`);
  }
  // 3. confronto con i giorni precedenti: chiavi sparite o rimpicciolite
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1], b = s[i];
    Object.keys(a.dim).forEach(k => {
      if (b.dim[k] === undefined) problemi.push(`${t}: la chiave ${k} c'era il ${a.giorno} e non c'e' piu' il ${b.giorno}`);
      else if (a.dim[k] > 200 && b.dim[k] < a.dim[k] * (1 - CALO)) problemi.push(`${t}: la chiave ${k} e' passata da ${a.dim[k]} a ${b.dim[k]} byte tra il ${a.giorno} e il ${b.giorno} (-${Math.round(100 - 100 * b.dim[k] / a.dim[k])}%)`);
    });
    if (b.tot < a.tot * (1 - CALO)) problemi.push(`${t}: lo snapshot e' passato da ${Math.round(a.tot / 1024)} a ${Math.round(b.tot / 1024)} KB tra il ${a.giorno} e il ${b.giorno}`);
  }
  note.push(`${t}: ultimo ${ultimo.file} · ${Object.keys(ultimo.dati).length} chiavi · ${Math.round(ultimo.tot / 1024)} KB`);
  if (VERBOSO) Object.entries(ultimo.dim).sort((x, y) => y[1] - x[1]).slice(0, 6).forEach(([k, v]) => note.push(`    ${k}: ${Math.round(v / 1024)} KB`));
}

/* 4. freschezza: l'ultimo snapshot deve essere di oggi o di ieri */
const ultimoGiorno = finestra[finestra.length - 1];
const ore = (Date.now() - Date.parse(ultimoGiorno + 'T23:59:59Z')) / 3600000;
if (ore > 24) problemi.push(`l'ultimo snapshot e' del ${ultimoGiorno}: piu' vecchio di un giorno`);

note.forEach(n => console.log('  ' + n));
if (problemi.length) { console.log('\nPROBLEMI (' + problemi.length + '):'); problemi.forEach(p => console.log(' - ' + p)); process.exit(1); }
console.log('\nBACKUP OK · ' + finestra.length + ' giorni controllati (' + finestra[0] + ' → ' + ultimoGiorno + ')');
