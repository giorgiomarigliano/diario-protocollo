/* Ricostruisce il testo del log Motra dal motra_log salvato (15/11) e verifica
   che parseMotraText(testo) torni allo stesso JSON: prova di andata e ritorno. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const SNAP = '/home/claude/diario-protocollo-backups/snapshots/2026-11-17';
const load = p => { const r = JSON.parse(fs.readFileSync(p, 'utf8')); return (Array.isArray(r) ? r[0] : r).data; };
const v2 = load(path.join(SNAP, fs.readdirSync(SNAP).find(n => n.startsWith('proto_v2'))));
const log = JSON.parse(v2.p2_day_118.motra_log);

function testo(l) {
  const out = ['Il mio allenamento:', l.title, l.date, 'Durata: ' + l.durata, 'Volume: ' + l.volume, 'Calorie: ' + l.calorie, 'Esercizi:'];
  l.exercises.forEach(ex => {
    out.push(ex.name);
    ex.sets.forEach(s => out.push((s.label === 'W' ? 'Riscaldamento' : s.label) + ': ' + s.reps + ' ripetizioni x ' + String(s.kg).replace('.', ',') + ' kg'));
  });
  out.push('Tracciato con Motra.');
  return out.join('\n');
}

/* le funzioni si prendono da v2.html, l'unica implementazione */
const html = fs.readFileSync('/home/claude/diario-protocollo/v2.html', 'utf8');
function blocco(s, start, open, close) { let d = 0, e = start; for (; e < s.length; e++) { if (s[e] === open) d++; else if (s[e] === close) { d--; if (!d) { e++; break; } } } return s.slice(start, e); }
const fn = n => blocco(html, html.indexOf('function ' + n + '('), '{', '}');
const cst = n => { const m = 'const ' + n + ' = ', i = html.indexOf(m), o = html[i + m.length]; return html.slice(i, i + m.length) + blocco(html, i + m.length, o, o === '{' ? '}' : ']') + ';'; };
const ctx = { LANG: 'it', console, isoLocal: d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') };
vm.createContext(ctx);
[cst('MOTRA_SENTINEL_MAP'), cst('MOTRA_MESI'), cst('MOTRA_DOPPI'), fn('parseMotraText'), fn('motraParseDate'), fn('motraVolume'),
 fn('motraDurata'), fn('motraKcal'), fn('motraSentinels'), fn('motraVolEx'), fn('motraRaddoppia'), fn('motraCoerenza')]
  .forEach(c => vm.runInContext(c, ctx));

const t = testo(log);
fs.writeFileSync('/tmp/claude-0/motra_15nov.txt', t);
const p = ctx.parseMotraText(t);
const same = JSON.stringify(p) === JSON.stringify(log);
console.log('andata e ritorno identici:', same);
if (!same) {
  console.log('atteso :', JSON.stringify(log).slice(0, 400));
  console.log('ottenut:', JSON.stringify(p).slice(0, 400));
}
console.log('data:', JSON.stringify(ctx.motraParseDate(p.date)));
console.log('volume:', ctx.motraVolume(p.volume), 'durata:', ctx.motraDurata(p.durata), 'kcal:', ctx.motraKcal(p.calorie));
console.log('coerenza:', JSON.stringify(ctx.motraCoerenza(p)));
console.log('sentinelle:', JSON.stringify(ctx.motraSentinels(p)));
