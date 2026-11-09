#!/usr/bin/env node
/* Inserisce un nuovo pannello esami in CLIN_DATA (v2.html).
   Uso:
     node tools/clin_add.js template > pannello.json     # modulo da compilare (31 esami prescritti 05/11/2026)
     node tools/clin_add.js add pannello.json [--dry]    # --dry = solo anteprima, non scrive
     node tools/clin_add.js promote [--dry]              # una tantum: omocisteina/PTH/magnesio/AST/ALT -> serie
   Regole: valori null = esame non ancora ricevuto (saltato, segnalato). 'ok' e' calcolato dal range di riferimento;
   per esami qualitativi indicare "ok" a mano. Nessun valore viene stimato. */
const fs = require('fs'), path = require('path');
const FILE = process.env.CLIN_FILE || path.join(__dirname, '..', 'v2.html');
const DRY = process.argv.includes('--dry');
const src = fs.readFileSync(FILE, 'utf8');
const lines = src.split('\n');
const li = lines.findIndex(l => l.startsWith('var CLIN_DATA = '));
if (li < 0) throw new Error('CLIN_DATA non trovato');
const D = JSON.parse(lines[li].match(/^var CLIN_DATA = (.*);\s*$/)[1]);
const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const itDate = iso => { const [y, m, d] = iso.split('-'); return (+d) + ' ' + MESI[+m - 1] + ' ' + y; };
const num = s => parseFloat(String(s).replace(',', '.'));
function parseRef(r) {
  const s = String(r || '').replace(/~/g, '').replace(',', '.');
  let m = s.match(/([\d.]+)\s*[–-]\s*([\d.]+)/); if (m) return { lo: +m[1], hi: +m[2] };
  m = s.match(/[<≤]\s*([\d.]+)/); if (m) return { lo: null, hi: +m[1] };
  m = s.match(/[>≥]\s*([\d.]+)/); if (m) return { lo: +m[1], hi: null };
  return null;
}
const okOf = (v, ref, cens) => { const r = parseRef(ref); if (!r) return null;
  if (r.lo != null && v < r.lo && cens !== '>') return false; if (r.hi != null && v > r.hi && cens !== '<') return false; return true; };

/* ---- 31 esami prescritti (Dr.ssa Longo, 05/11/2026) ---- */
const TEMPLATE_ITEMS = [
  ['omocisteina','Omocisteina','µmol/L','Infiammazione & metaboliti'], ['pth','Paratormone Intatto (PTH)','ng/L','Chimica Clinica'],
  ['tsh','TSH','µUI/mL','Ormoni'], ['psa','PSA','ng/mL','Prostata'], ['hba1c','Emoglobina glicata','mmol/mol','Metabolismo'],
  ['vitd','Vitamina D (25 OH)','ng/mL','Ferro & vitamine'], ['ferritina','Ferritina','ng/mL','Ferro & vitamine'], ['b12','Vitamina B12','pg/mL','Ferro & vitamine'],
  ['folato','Folati','ng/mL','Ferro & vitamine'], ['zinco','Zinco','µg/dL','Ferro & vitamine'], ['transf','Transferrina','mg/dL','Ferro & vitamine'],
  [null,'Elettroforesi proteica','','Elettroforesi'], [null,'ACR urine (albumina/creatinina)','mg/g','Funzionalità renale'],
  ['tibc','Capacità ferrolegante (TIBC)','µg/dL','Ferro & vitamine'],
  ['wbc','Leucociti','10^3/µL','Emocromo'], ['rbc','Eritrociti','10^6/µL','Emocromo'], ['hb','Emoglobina','g/dL','Emocromo'], ['hct','Ematocrito','%','Emocromo'],
  ['mcv','MCV','fL','Emocromo'], [null,'MCH','pg','Emocromo'], ['mchc','MCHC','g/dL','Emocromo'], [null,'RDW','%','Emocromo'], ['plt','Piastrine','10^3/µL','Emocromo'],
  [null,'Formula leucocitaria (neutrofili/linfociti/monociti/eosinofili/basofili)','','Emocromo'],
  ['clcr','Clearance creatinina','mL/min','Funzionalità renale'], [null,'Urine esame chimico-fisico e microscopico','','Esame urine'],
  ['hdl','Colesterolo HDL','mg/dL','Lipidi'], ['magnesio','Magnesio totale','mg/dL','Chimica Clinica'], ['potassio','Potassio','mmol/L','Chimica Clinica'],
  ['creat','Creatinina','mg/dL','Funzionalità renale'], ['ferro','Ferro','µg/dL','Ferro & vitamine'], ['ast','AST/GOT','U/L','Funzionalità epatica'],
  ['ggt','Gamma GT','U/L','Funzionalità epatica'], ['tg','Trigliceridi','mg/dL','Lipidi'], ['urea','Azotemia','mg/dL','Funzionalità renale'],
  ['gluc','Glicemia','mg/dL','Metabolismo'], ['calcio','Calcio totale','mg/dL','Chimica Clinica'], ['alt','ALT/GPT','U/L','Funzionalità epatica'],
  ['col_tot','Colesterolo totale','mg/dL','Lipidi'], ['ldl','Colesterolo LDL (calcolo)','mg/dL','Lipidi']
];
const NEWSER = { tibc: { label: 'TIBC', better: 'neutral', unit: 'µg/dL' } };

function writeBack() {
  const out = lines.slice(); out[li] = 'var CLIN_DATA = ' + JSON.stringify(D) + ';';
  let t = out.join('\n');
  return t;
}
function apply(t) { if (DRY) { console.log('[dry] nessuna scrittura'); return; } fs.writeFileSync(FILE, t); console.log('v2.html aggiornato'); }

const cmd = process.argv[2];
if (cmd === 'template') {
  const tpl = { panel: { id: 'p_nov2026_longo', iso: 'AAAA-MM-GG', label: 'Controllo post-integrazione · Dr.ssa Longo — laboratorio ?', note: 'Prelievo ore ? · digiuno ? · referto del ?' },
    items: TEMPLATE_ITEMS.map(([key, name, unit, cat]) => { const s = key && D.series[key]; return { key, name, cat, v: null, unit: s ? s.unit : unit, ref: '', ok: null, note: '' }; }) };
  console.log(JSON.stringify(tpl, null, 1));
} else if (cmd === 'add') {
  const spec = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const P = spec.panel; if (!/^\d{4}-\d{2}-\d{2}$/.test(P.iso)) throw new Error('panel.iso non valido');
  if (D.panels.some(p => p.id === P.id)) throw new Error('panel gia presente: ' + P.id);
  const panel = { id: P.id, date: itDate(P.iso), iso: P.iso, label: P.label, note: P.note || '' };
  let nSer = 0, nIns = 0; const skipped = [], warn = [], flags = [];
  for (const it of spec.items) {
    const hasV = it.v !== null && it.v !== undefined && it.v !== '';
    if (!hasV) { skipped.push(it.name || it.key); continue; }
    const isNum = typeof it.v === 'number' || /^[<>]?\s*-?\d+([.,]\d+)?$/.test(String(it.v).trim());
    let cens = null, v = it.v;
    if (isNum && typeof v === 'string') { const m = v.trim().match(/^([<>])?\s*(-?[\d.,]+)$/); cens = m[1] || null; v = num(m[2]); }
    let ok = it.ok;
    if (isNum && it.ref) { const c = okOf(v, it.ref, cens); if (c != null) { if (ok != null && ok !== c) warn.push(it.name + ': ok manuale diverso dal calcolo'); ok = c; } }
    if (ok == null) { warn.push(it.name + ': ok non determinabile (nessun range) -> true'); ok = true; }
    if (!ok) flags.push(it.name + ' ' + v + ' ' + (it.unit || '') + ' (rif. ' + it.ref + ')');
    if (it.key && isNum) {
      if (!D.series[it.key]) {
        const ns = NEWSER[it.key]; if (!ns) { warn.push(it.key + ': serie inesistente, esame messo come riga strumentale'); }
        else { D.series[it.key] = { key: it.key, label: ns.label, better: ns.better, points: [], unit: ns.unit, ref: it.ref || '' }; nSer++; }
      }
      const s = D.series[it.key];
      if (s) {
        const um = !!(it.unit && s.unit && it.unit !== s.unit); if (um) warn.push(it.name + ': unita ' + it.unit + ' diversa da serie ' + s.unit + ' (unitMismatch)');
        s.points.push({ iso: P.iso, date: itDate(P.iso), src: P.label, v, cens, unit: it.unit || s.unit, ref: it.ref || '', ok, note: it.note || '', unitMismatch: um, panel: P.id });
        s.points.sort((a, b) => a.iso < b.iso ? -1 : 1); continue;
      }
    }
    D.instr.push({ panel: P.id, date: panel.date, iso: P.iso, label: P.label, cat: it.cat || 'Chimica clinica', name: it.name,
      val: isNum ? ((cens || '') + v + (it.unit ? ' ' + it.unit : '')) : String(it.v), ref: it.ref || '—', ok, note: it.note || '' }); nIns++;
  }
  D.panels.push(panel);
  console.log('pannello', P.id, '| punti serie:', spec.items.filter(i => i.v != null && i.v !== '').length - nIns, '| righe strumentali:', nIns, '| nuove serie:', nSer);
  if (skipped.length) console.log('SALTATI (v null):', skipped.length, '->', skipped.join('; '));
  if (flags.length) console.log('FUORI RANGE:', flags.join(' | '));
  if (warn.length) console.log('AVVISI:\n - ' + warn.join('\n - '));
  apply(writeBack());
} else if (cmd === 'promote') {
  const defs = [
    { key: 'omocisteina', label: 'Omocisteina', better: 'down', unit: 'µmol/L', names: ['Omocisteina'] },
    { key: 'pth', label: 'PTH', better: 'neutral', unit: 'ng/L', names: ['Paratormone Intatto (PTH)'] },
    { key: 'magnesio', label: 'Magnesio', better: 'neutral', unit: 'mg/dL', names: ['Magnesio', 'Magnesio totale'] }
  ];
  const seen = new Set();
  for (const d of defs) {
    if (D.series[d.key]) continue;
    const pts = []; let ref = '';
    for (const r of D.instr.filter(r => d.names.includes(r.name))) {
      const k = r.iso + '|' + d.key; if (seen.has(k)) continue; seen.add(k);
      const m = String(r.val).match(/^([<>])?\s*(-?[\d.,]+)\s*(.*)$/); if (!m) continue;
      pts.push({ iso: r.iso, date: r.date, src: r.label, v: num(m[2]), cens: m[1] || null, unit: m[3] || d.unit, ref: r.ref, ok: r.ok, note: r.note || '', unitMismatch: false, panel: r.panel }); ref = r.ref;
    }
    pts.sort((a, b) => a.iso < b.iso ? -1 : 1);
    D.series[d.key] = { key: d.key, label: d.label, better: d.better, points: pts, unit: d.unit, ref };
    console.log('serie', d.key, pts.length, 'punti:', pts.map(p => p.iso + '=' + p.v).join(', '));
  }
  /* AST/ALT: le righe 2026 sono solo strumentali -> aggiungo i punti mancanti alle serie esistenti */
  for (const [key, nm] of [['ast', 'AST/GOT'], ['alt', 'ALT/GPT']]) {
    const s = D.series[key]; const have = new Set(s.points.map(p => p.iso));
    for (const r of D.instr.filter(r => r.name === nm && !have.has(r.iso))) {
      const m = String(r.val).match(/^([<>])?\s*(-?[\d.,]+)\s*(.*)$/); if (!m) continue;
      s.points.push({ iso: r.iso, date: r.date, src: r.label, v: num(m[2]), cens: m[1] || null, unit: m[3] || s.unit, ref: r.ref, ok: r.ok, note: r.note || '', unitMismatch: false, panel: r.panel }); have.add(r.iso);
    }
    s.points.sort((a, b) => a.iso < b.iso ? -1 : 1); console.log('serie', key, s.points.length, 'punti');
  }
  let t = writeBack();
  const rep = (a, b) => { if (!t.includes(a)) throw new Error('ancora non trovata: ' + a); t = t.replace(a, b); };
  rep("{ label: 'Rene', keys: ['creat', 'egfr', 'clcr', 'urea', 'urico', 'potassio', 'calcio'] }", "{ label: 'Rene', keys: ['creat', 'egfr', 'clcr', 'urea', 'urico', 'potassio', 'calcio', 'magnesio', 'pth'] }");
  rep("{ label: 'Fegato', keys: ['ast', 'alt', 'ggt'] }", "{ label: 'Fegato', keys: ['ast', 'alt', 'ggt', 'omocisteina'] }");
  rep("rene: ['creat', 'egfr', 'clcr', 'urea', 'urico', 'potassio', 'calcio', 'pth']", "rene: ['creat', 'egfr', 'clcr', 'urea', 'urico', 'potassio', 'calcio', 'magnesio', 'pth']");
  rep("fegato: ['ast', 'alt', 'ggt', 'gluc',", "fegato: ['ast', 'alt', 'ggt', 'omocisteina', 'gluc',");
  /* nome alternativo righe strumentali nascoste in 'Per apparato' quando esiste la serie */
  rep("var taken = {}; seriesRows.forEach(function (r) { taken[r.name.toLowerCase()] = 1; });",
      "var taken = {}; seriesRows.forEach(function (r) { taken[r.name.toLowerCase()] = 1; });\n      (CLIN_SERIES_ALIAS[key] || []).forEach(function (n) { taken[n.toLowerCase()] = 1; });");
  rep("var CLIN_TEXTCAT =", "var CLIN_SERIES_ALIAS = { rene: ['Magnesio totale', 'Paratormone Intatto (PTH)'], fegato: ['AST/GOT', 'ALT/GPT'] };\nvar CLIN_TEXTCAT =");
  apply(t);
} else { console.log('comandi: template | add <file.json> [--dry] | promote [--dry]'); process.exit(1); }
