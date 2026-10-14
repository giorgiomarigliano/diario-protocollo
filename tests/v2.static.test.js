#!/usr/bin/env node
// Controlli statici di v2.html (nessuna rete, nessun browser, nessun dato): un secondo,
// esito 0 = OK. Complementa tools/audit/audit.py (che copre il rendering) e
// tests/regression.test.js (che copre index.html / v1).
//   node tests/v2.static.test.js
// Richiede acorn: cd tools/audit && npm install   (si installa gia' con l'audit)
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
let acorn; try { acorn = require(path.join(root, 'tools/audit/node_modules/acorn')); } catch (e) { console.error('acorn mancante: cd tools/audit && npm install'); process.exit(2); }
const html = fs.readFileSync(path.join(root, 'v2.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };

// 1. sintassi di ogni blocco script
scripts.forEach((s, i) => { try { new vm.Script(s, { filename: 'script' + i }); } catch (e) { fails.push('sintassi script ' + i + ': ' + e.message); } });
ok(scripts.length >= 4, 'attesi almeno 4 blocchi script, trovati ' + scripts.length);

// 2. chiavi duplicate negli oggetti letterali (es. dizionari EN) + 3. date del ciclo fuori da CAL
const walk = (n, f) => { if (!n || typeof n.type !== 'string') return; f(n); for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(c => walk(c, f)); else if (v && typeof v.type === 'string') walk(v, f); } };
scripts.forEach((s, i) => {
  let ast; try { ast = acorn.parse(s, { ecmaVersion: 2022 }); } catch (e) { return; }
  walk(ast, n => {
    if (n.type !== 'ObjectExpression') return;
    const seen = new Set();
    n.properties.forEach(p => {
      if (p.type !== 'Property' || p.computed) return;
      const k = p.key.type === 'Identifier' ? p.key.name : String(p.key.value);
      if (seen.has(k)) fails.push('chiave duplicata "' + k + '" (script ' + i + ', riga ~' + (s.slice(0, p.start).split('\n').length) + ')');
      seen.add(k);
    });
  });
});

// 3. calendario del ciclo: una sola definizione (CAL); le date non devono ricomparire altrove
const calIdx = html.indexOf('const CAL = (function');
ok(calIdx > 0, 'CAL non trovato');
const calEnd = html.indexOf('})();', calIdx);
// (esclusi i dati clinici incorporati CLIN_DATA e i nomi file delle foto: contengono date di misura, non costanti)
const outside = (html.slice(0, calIdx) + html.slice(calEnd)).split('\n').filter(l => !/^var CLIN_DATA\s*=/.test(l)).join('\n');
['2026-07-20', '2026-07-13', '2026-09-12', '2026-11-07', '2026-11-08'].forEach(d => {
  if (new RegExp('[\'"]' + d + '[\'"]').test(outside)) fails.push('data del ciclo ' + d + ' ripetuta fuori da CAL');
});
try {
  const CAL = vm.runInNewContext(html.slice(calIdx + 'const CAL = '.length, calEnd + 4).replace(/\)\(\);$/, ')()'));
  ok(CAL.END === '2026-11-08' && CAL.DAYS === 112 && CAL.T2 === '2026-11-07', 'CAL incoerente: ' + JSON.stringify(CAL));
} catch (e) { fails.push('CAL non valutabile: ' + e.message); }

// 4. id statici duplicati nel markup (fuori dagli script)
const markup = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const ids = [...markup.matchAll(/\sid="([^"$`{}]+)"/g)].map(m => m[1]); const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
ok(!dup.length, 'id duplicati: ' + [...new Set(dup)].join(', '));

if (fails.length) { console.error('FALLITO\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('OK · ' + scripts.length + ' script, CAL coerente, 0 chiavi duplicate, 0 id duplicati');
