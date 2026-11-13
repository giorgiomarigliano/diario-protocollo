#!/usr/bin/env node
/* Inserisce un nuovo pannello esami nello storico clinico.
   Dal 13/11/2026 lo storico sta nei DATI (chiave `clin_data` della riga archivio su Supabase), non piu' in v2.html:
   questo script non modifica piu' il codice, ma STAMPA l'SQL da incollare nel SQL Editor di Supabase (lo esegue Giorgio).
   Uso:
     node tools/clin_add.js template > pannello.json     # modulo da compilare (31 esami prescritti 05/11/2026)
     node tools/clin_add.js add pannello.json > add.sql  # anteprima a schermo (stderr) + SQL da eseguire (stdout)
   Lo stato attuale si legge da una copia locale dei dati (mai in git): per default
   tools/audit/.snap/giorgio_protocollo_2026.json (si crea con `python3 tools/audit/audit.py --backup-dir ../diario-protocollo-backups`),
   oppure si indica con CLIN_DATA_FILE=<file.json>. L'SQL e' additivo e ha i controlli per non applicarsi due volte.
   Regole: valori null = esame non ancora ricevuto (saltato, segnalato). 'ok' e' calcolato dal range di riferimento;
   per esami qualitativi indicare "ok" a mano. Nessun valore viene stimato. */
const fs = require('fs'), path = require('path');
const USER = 'giorgio_protocollo_2026';   // riga archivio (CFG.ARCHIVE_ID in v2.html)
const DATA_FILE = process.env.CLIN_DATA_FILE || path.join(__dirname, 'audit', '.snap', USER + '.json');
function loadData() {
  if (!fs.existsSync(DATA_FILE)) throw new Error('copia locale dei dati non trovata: ' + DATA_FILE +
    '\n  creala con: python3 tools/audit/audit.py --backup-dir ../diario-protocollo-backups   (oppure CLIN_DATA_FILE=<file.json>)');
  let j = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (Array.isArray(j)) j = j[0];
  const d = (j && j.data && j.data.clin_data) || (j && j.clin_data) || j;
  if (!d || !d.series || !Array.isArray(d.instr) || !Array.isArray(d.panels)) throw new Error('clin_data non valido in ' + DATA_FILE);
  return d;
}
const D = loadData();
const log = (...a) => console.error(...a);   // il resoconto va su stderr: su stdout resta solo l'SQL
const q = o => "'" + JSON.stringify(o).replace(/'/g, "''") + "'::jsonb";
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

/* SQL additivo: aggiunge il pannello, le righe strumentali e i punti alle serie, riordina per data le serie toccate.
   Ogni istruzione ha un controllo che la rende innocua se eseguita due volte (stesso panel id = nessuna modifica). */
function sql(panel, instr, addPts, newSer) {
  const W = " where user_id = '" + USER + "'";
  const noPanel = " and not exists (select 1 from jsonb_array_elements(data->'clin_data'->'panels') e where e->>'id' = '" + panel.id + "')";
  const out = ['-- pannello ' + panel.id + ' (' + panel.iso + ') — generato da tools/clin_add.js, da eseguire nel SQL Editor',
    '-- controllo prima di eseguire:',
    "select jsonb_array_length(data->'clin_data'->'panels') panels, jsonb_array_length(data->'clin_data'->'instr') instr from diary" + W + ';',
    'begin;'];
  Object.keys(newSer).forEach(k => out.push("update diary set data = jsonb_set(data, '{clin_data,series," + k + "}', " + q(newSer[k]) + ")" + W + " and not (data->'clin_data'->'series' ? '" + k + "');"));
  Object.keys(addPts).forEach(k => {
    out.push("update diary set data = jsonb_set(data, '{clin_data,series," + k + ",points}', coalesce(data->'clin_data'->'series'->'" + k + "'->'points', '[]'::jsonb) || " + q(addPts[k]) + ")" +
      W + " and (data->'clin_data'->'series') ? '" + k + "'" + " and not exists (select 1 from jsonb_array_elements(data->'clin_data'->'series'->'" + k + "'->'points') e where e->>'panel' = '" + panel.id + "');");
    out.push("update diary set data = jsonb_set(data, '{clin_data,series," + k + ",points}', coalesce((select jsonb_agg(e order by e->>'iso') from jsonb_array_elements(data->'clin_data'->'series'->'" + k + "'->'points') e), '[]'::jsonb))" + W + " and jsonb_typeof(data->'clin_data'->'series'->'" + k + "'->'points') = 'array';");
  });
  if (instr.length) out.push("update diary set data = jsonb_set(data, '{clin_data,instr}', coalesce(data->'clin_data'->'instr', '[]'::jsonb) || " + q(instr) + ")" + W + noPanel + ';');
  out.push("update diary set data = jsonb_set(data, '{clin_data,panels}', coalesce(data->'clin_data'->'panels', '[]'::jsonb) || " + q([panel]) + ")" + W + noPanel + ';');
  out.push('commit;', '-- verifica dopo l\'esecuzione (atteso: +1 pannello, +' + instr.length + ' righe strumentali):',
    "select jsonb_array_length(data->'clin_data'->'panels') panels, jsonb_array_length(data->'clin_data'->'instr') instr," +
    " (select count(*) from jsonb_object_keys(data->'clin_data'->'series')) serie from diary" + W + ';');
  return out.join('\n');
}

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
  const addPts = {}, newSer = {}, newInstr = [];
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
        else { D.series[it.key] = { key: it.key, label: ns.label, better: ns.better, points: [], unit: ns.unit, ref: it.ref || '' }; newSer[it.key] = D.series[it.key]; nSer++; }
      }
      const s = D.series[it.key];
      if (s) {
        const um = !!(it.unit && s.unit && it.unit !== s.unit); if (um) warn.push(it.name + ': unita ' + it.unit + ' diversa da serie ' + s.unit + ' (unitMismatch)');
        const pt = { iso: P.iso, date: itDate(P.iso), src: P.label, v, cens, unit: it.unit || s.unit, ref: it.ref || '', ok, note: it.note || '', unitMismatch: um, panel: P.id };
        if (s.points.some(x => x.panel === P.id)) throw new Error('serie ' + it.key + ': punto del pannello ' + P.id + ' gia presente');
        s.points.push(pt); s.points.sort((a, b) => a.iso < b.iso ? -1 : 1);
        (addPts[it.key] = addPts[it.key] || []).push(pt); continue;
      }
    }
    const row = { panel: P.id, date: panel.date, iso: P.iso, label: P.label, cat: it.cat || 'Chimica clinica', name: it.name,
      val: isNum ? ((cens || '') + v + (it.unit ? ' ' + it.unit : '')) : String(it.v), ref: it.ref || '—', ok, note: it.note || '' };
    D.instr.push(row); newInstr.push(row); nIns++;
  }
  D.panels.push(panel);
  log('pannello', P.id, '| punti serie:', spec.items.filter(i => i.v != null && i.v !== '').length - nIns, '| righe strumentali:', nIns, '| nuove serie:', nSer);
  if (skipped.length) log('SALTATI (v null):', skipped.length, '->', skipped.join('; '));
  if (flags.length) log('FUORI RANGE:', flags.join(' | '));
  if (warn.length) log('AVVISI:\n - ' + warn.join('\n - '));
  console.log(sql(panel, newInstr, addPts, newSer));
  log('\nSQL scritto su stdout: rileggilo, eseguilo nel SQL Editor e poi ricarica l\'app.');
} else if (cmd === 'promote') {
  console.error('comando non piu' + String.fromCharCode(39) + 'disponibile: era una tantum (gia applicata il 5/11/2026) e modificava CLIN_DATA nel codice, che dal 13/11/2026 non esiste piu.');
  process.exit(1);
} else { console.error('comandi: template | add <file.json>   (stampa l\'SQL su stdout)'); process.exit(1); }
