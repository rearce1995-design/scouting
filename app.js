import { PRESETS, A, PHYS, M, C, withDiscipline, disciplineCat } from './presets.js';
import { countryToFifaCode, flagCdnUrl, normalizeCountryName } from './flags.js';
import { renderModeTabs, renderCompareView } from './compare.js';
import { renderProfileView } from './profile.js';
import { renderShortlistView } from './shortlist.js';

/* =========================================================================
   RUEDA DE PERCENTILES — constructor de gráficos tipo "percentile wheel"
   Optimizado: worker para parseo, detección de columnas en una pasada,
   buildMetricLayout O(n), debounce, fix ordinal y mejoras de render.
   ========================================================================= */

const PALETTE = ['#5B85D6','#4C9A6E','#C79A52','#BC5049','#8A72C2','#3F9AA8','#B96E8C','#7C9C4A'];
const BUCKET = { elite:'#5B85D6', above:'#4C9A6E', avg:'#C79A52', below:'#BC5049' };

/* País a mostrar: prioriza la columna de nacionalidad detectada en el
   Excel (Birth country / Passport country); si no hay o no matchea a un
   país conocido, cae al campo manual "Bandera/país" del paso 4. */
/* Devuelve la lista de países candidatos para un jugador, sin duplicados:
   primero el país de nacimiento (si hay), después cada país que aparezca
   en "Passport country" (que puede traer varios separados por coma, caso
   típico de doble nacionalidad). Se usa tanto para resolver qué bandera
   mostrar como para armar el selector manual cuando hay más de un
   candidato — así el usuario elige cuál representa en vez de que la app
   adivine mal (ver casos Lookman vs. Stuani). */
function getNationalityCandidates(row){
  row = row !== undefined ? row : state.selectedRow;
  if(!row) return [];
  const birth = state.birthCol ? String(row[state.birthCol] || '').trim() : '';
  const passportRaw = state.passportCol ? String(row[state.passportCol] || '').trim() : '';
  const passportList = passportRaw.split(',').map(s => s.trim()).filter(Boolean);
  const seen = new Set();
  const out = [];
  for(const c of [birth, ...passportList]){
    if(!c) continue;
    const key = normalizeCountryName(c);
    if(seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/* País a mostrar: si el usuario ya eligió manualmente entre varios
   candidatos (ver getNationalityCandidates), se respeta esa elección.
   Si no, se usa el país de nacimiento por default (es el caso correcto
   la mayoría de las veces); si no hay país de nacimiento, se cae al
   primer país listado en el pasaporte. Último recurso: el campo manual
   "Bandera/país" del paso 4. */
function resolveCountryName(row){
  const isSingleMode = row === undefined;
  row = isSingleMode ? state.selectedRow : row;
  if(row){
    if(isSingleMode && state.meta.selectedNationality) return state.meta.selectedNationality;
    const candidates = getNationalityCandidates(row);
    if(candidates.length) return candidates[0];
  }
  return isSingleMode ? String(state.meta.flag || '').trim() : '';
}

const state = {
  headers: [],
  rows: [],
  numericCols: [],
  playerCol: null,
  teamCol: null,
  posCol: null,
  minutesCol: null,
  footCol: null,
  ageCol: null,
  nationCol: null,
  passportCol: null,
  birthCol: null,
  filters: [],
  categories: [],
  selectedRow: null,
  meta: {
    displayName: '', groupLabel: 'vs. jugadores del grupo', competition: '',
    club: '', season: '', flag: '', centerLabel: '', bio1: '', bio2: '', age: '',
    selectedNationality: ''
  },
  presetUI: { position: '', role: '', includePhysical: false },
  activeRanking: null, // { catName, label, col, invert }
  viewMode: 'single', // 'single' | 'compare' | 'profile' | 'shortlist'
  compare: { rowA: null, rowB: null },
  profile: { weights: {}, lastCategorySignature: null }, // weights[catName] = 0-100, suman <=100 entre todas
  profileExpanded: null,    // fila del jugador con el desglose abierto en el ranking de perfil
  profileFilters: { priority:'', age:'', minutes:'', club:'', foot:'', nationality:'', shortlisted:'' },
  profileColumns: { age:true, minutes:true, club:true, foot:false, nationality:false, shortlisted:true },
};

const SHORTLIST_STORAGE_KEY = 'ruedaPercentiles_shortlist_v1';

let catSeq = 0, metSeq = 0;
const uid = (p) => p + '_' + (Date.now().toString(36)) + Math.random().toString(36).slice(2,7);

/* ---------------------------- Utilities ---------------------- */

function debounce(fn, wait = 120){
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ---------------------------- Parsing de archivos ---------------------- */

// Usa Web Worker (xlsx-worker.js). Si no se puede, hace fallback al parse en hilo principal.
// NOTA: no transferimos el ArrayBuffer (evita que se "detache" y no esté disponible en el main en caso de fallback).
function parseWorkbookFile(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.onload = async (e) => {
      const arrayBuffer = e.target.result;
      // Prefer worker si disponible
      if(window.Worker){
        try{
          const worker = new Worker('xlsx-worker.js');
          worker.onerror = (ev) => {
            worker.terminate();
            // fallback al hilo principal
            try{
              const json = parseWorkbookArrayBuffer(arrayBuffer);
              resolve(json);
            }catch(err){
              reject(err);
            }
          };
          worker.onmessage = (ev) => {
            worker.terminate();
            if(ev.data && ev.data.error) reject(new Error(ev.data.error));
            else resolve(ev.data.json || []);
          };
          // PostMessage sin transfer para mayor compatibilidad/robustez
          worker.postMessage(arrayBuffer);
        }catch(err){
          // si crear el worker falla, fallback
          try{
            const json = parseWorkbookArrayBuffer(arrayBuffer);
            resolve(json);
          }catch(err2){ reject(err2); }
        }
      } else {
        // fallback: parseo en hilo principal
        try{
          const json = parseWorkbookArrayBuffer(arrayBuffer);
          resolve(json);
        }catch(err){ reject(err); }
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function parseWorkbookArrayBuffer(arrayBuffer){
  // Usa la librería XLSX cargada desde index.html (cdn)
  const data = new Uint8Array(arrayBuffer);
  const wb = XLSX.read(data, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if(!json.length) throw new Error('La hoja está vacía');
  return json;
}

async function ingestRows(json){
  state.headers = Object.keys(json[0] || {});
  state.rows = json;

  // DETECCIÓN NUMÉRICA EN UNA PASADA: reduce parseos repetidos
  const counts = {};
  for(const h of state.headers) counts[h] = { nonEmpty:0, numeric:0 };

  for(const r of state.rows){
    for(const h of state.headers){
      const v = r[h];
      if(v === '' || v === null || v === undefined) continue;
      counts[h].nonEmpty++;
      const isNum = (typeof v === 'number') || (!isNaN(parseFloat(v)) && isFinite(v));
      if(isNum) counts[h].numeric++;
    }
  }
  state.numericCols = state.headers.filter(h => counts[h].nonEmpty > 0 && (counts[h].numeric / counts[h].nonEmpty) >= 0.7);

  // heurísticas de auto-detección
  // Se respeta el orden de preferencia de `candidates` (por ejemplo,
  // "Team within selected timeframe" antes que "Team"). Antes se recorrían
  // las columnas primero, de modo que una coincidencia temprana anulaba la
  // prioridad declarada de los candidatos.
  const findCol = (candidates) => {
    for(const candidate of candidates){
      const hit = state.headers.find(h => h.toLowerCase().trim() === candidate);
      if(hit) return hit;
    }
    for(const candidate of candidates){
      const hit = state.headers.find(h => h.toLowerCase().includes(candidate));
      if(hit) return hit;
    }
    return undefined;
  };
  state.playerCol = findCol(['player','jugador','name','nombre']) || state.playerCol;
  // En exportaciones Wyscout el campo "Team" puede quedar vacío para
  // jugadores de reserva, mientras que "Team within selected timeframe"
  // conserva el club observado. Priorizamos ese campo cuando está presente.
  state.teamCol = findCol(['team within selected timeframe', 'team','equipo','club']) || state.teamCol;
  state.posCol = findCol(['position','posición','posicion','pos']) || state.posCol;
  state.minutesCol = findCol(['minutes played','minutos','minutes','mins']) || state.minutesCol;
  state.footCol = findCol(['foot', 'preferred foot', 'pie', 'pierna hábil', 'pierna habil']) || state.footCol;
  state.ageCol = findCol(['age','edad']) || state.ageCol;
  state.birthCol = findCol(['birth country', 'país de nacimiento']) || state.birthCol;
  state.passportCol = findCol(['passport country', 'nationality', 'nacionalidad']) || state.passportCol;
  state.nationCol = state.birthCol || state.passportCol; // alias legado, ya no se usa para resolver bandera
}

function numVal(row, col){
  const v = row[col];
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) ? n : null;
}

/* ---------------------------- Grupo de comparación ---------------------- */

const OPS = {
  '=': (a,b)=> String(a).toLowerCase().trim() === String(b).toLowerCase().trim(),
  '!=': (a,b)=> String(a).toLowerCase().trim() !== String(b).toLowerCase().trim(),
  'contiene': (a,b)=> String(a).toLowerCase().includes(String(b).toLowerCase()),
  '>': (a,b)=> parseFloat(a) > parseFloat(b),
  '>=': (a,b)=> parseFloat(a) >= parseFloat(b),
  '<': (a,b)=> parseFloat(a) < parseFloat(b),
  '<=': (a,b)=> parseFloat(a) <= parseFloat(b),
};

function groupRows(){
  return state.rows.filter(r => state.filters.every(f => {
    if(!f.col) return true;
    const fn = OPS[f.op] || OPS['='];
    try{ return fn(r[f.col], f.val); }catch(e){ return true; }
  }));
}

function comparisonContextLabel(){
  const count = groupRows().length;
  const parts = [`${count} jugadores`];
  const positionFilter = state.filters.find(f => f.col && (f.col === state.posCol || /position|posici[oó]n|\bpos\b/i.test(f.col)) && f.val);
  if(positionFilter) parts.push(String(positionFilter.val));
  const competition = [state.meta.competition, state.meta.season].filter(Boolean).join(' ');
  if(competition) parts.push(competition);
  state.filters.filter(f => f.col && f.val && f !== positionFilter).forEach(f => {
    const short = f.col === state.minutesCol ? 'min' : f.col === state.ageCol ? 'edad' : f.col;
    parts.push(`${short} ${f.op || '='} ${f.val}`);
  });
  return parts.join(' · ');
}

function shortlistKey(row){
  if(!row) return '';
  return [state.playerCol ? row[state.playerCol] : '', state.teamCol ? row[state.teamCol] : '', state.ageCol ? row[state.ageCol] : '']
    .map(v => String(v ?? '').trim().toLowerCase()).join('|');
}
function loadShortlist(){
  try{
    const value = JSON.parse(localStorage.getItem(SHORTLIST_STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  }catch(e){ return []; }
}
function saveShortlist(items){
  try{ localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(items)); return true; }
  catch(e){ alert('No se pudo guardar el seguimiento en este navegador.'); return false; }
}
function isShortlisted(row){ return loadShortlist().some(item => item.key === shortlistKey(row)); }
function getShortlistItem(row){ return loadShortlist().find(item => item.key === shortlistKey(row)) || null; }
function upsertShortlist(row, snapshot={}){
  const key = shortlistKey(row);
  if(!key) return null;
  const items = loadShortlist();
  const idx = items.findIndex(item => item.key === key);
  const existing = idx >= 0 ? items[idx] : {};
  const next = {
    ...existing, ...snapshot, key,
    name: state.playerCol ? String(row[state.playerCol] ?? '') : 'Jugador',
    team: state.teamCol ? String(row[state.teamCol] ?? '') : '',
    age: state.ageCol ? numVal(row, state.ageCol) : null,
    minutes: state.minutesCol ? numVal(row, state.minutesCol) : null,
    foot: state.footCol ? String(row[state.footCol] ?? '') : '',
    nationality: resolveCountryName(row),
    addedAt: existing.addedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: snapshot.status || existing.status || 'Pendiente', note: snapshot.note ?? existing.note ?? '', evaluator: snapshot.evaluator ?? existing.evaluator ?? '',
    conclusion: snapshot.conclusion ?? existing.conclusion ?? '',
    evaluationDate: snapshot.evaluationDate ?? existing.evaluationDate ?? '',
    videoChecks: snapshot.videoChecks ?? existing.videoChecks ?? {},
  };
  if(idx >= 0) items[idx] = next; else items.unshift(next);
  saveShortlist(items);
  return next;
}
function updateShortlistItem(key, changes){
  const items = loadShortlist();
  const idx = items.findIndex(item => item.key === key);
  if(idx < 0) return null;
  items[idx] = { ...items[idx], ...changes, updatedAt:new Date().toISOString() };
  saveShortlist(items);
  return items[idx];
}
function removeShortlistItem(key){ saveShortlist(loadShortlist().filter(item => item.key !== key)); }

function selectPlayerForWheel(row){
  state.selectedRow = row;
  state.meta.selectedNationality = '';
  state.meta.displayName = state.playerCol ? String(row[state.playerCol] || '') : '';
  if(state.teamCol) state.meta.club = String(row[state.teamCol] || '');
  state.meta.age = state.ageCol ? String(row[state.ageCol] ?? '').trim() : '';
  state.viewMode = 'single';
  state.activeRanking = null;
  refreshAll();
}

/* ---------------------------- Percentiles ------------------------------- */

// ordinal corregido y robusto
function ordinal(n){
  if(typeof n !== 'number' || !isFinite(n)) return String(n);
  const v = n % 100;
  if (v >= 11 && v <= 13) return n + 'th';
  switch (n % 10) {
    case 1: return n + 'st';
    case 2: return n + 'nd';
    case 3: return n + 'rd';
    default: return n + 'th';
  }
}

/* Posición exacta del jugador dentro del grupo para una métrica (mismo
   criterio de orden que la lista del panel de ranking) — se usa tanto para
   el tooltip de la rueda como para el resumen del panel, así los números
   nunca se desincronizan entre uno y otro. */
function findGroupRank(group, playerRow, col, invert){
  if(!playerRow) return null;
  const items = group
    .map(r => ({ ref:r, val: numVal(r, col) }))
    .filter(x => x.val !== null)
    .sort((a,b) => invert ? a.val - b.val : b.val - a.val);
  const idx = items.findIndex(x => x.ref === playerRow);
  if(idx < 0) return null;
  return { rank: idx + 1, total: items.length };
}

function computePercentile(group, col, playerValue, invert){
  const vals = group.map(r => numVal(r, col)).filter(v => v !== null);
  const n = vals.length;
  if(n === 0 || playerValue === null) return { pct: null, n: 0 };
  let less = 0, equal = 0;
  for(const v of vals){
    if(v < playerValue) less++;
    else if(v === playerValue) equal++;
  }
  let raw = ((less + 0.5*equal) / n) * 100;
  if(invert) raw = 100 - raw;
  return { pct: Math.round(raw), n };
}

function bucketColor(pct){
  if(pct === null) return '#3A4256';
  if(pct >= 90) return BUCKET.elite;
  if(pct >= 65) return BUCKET.above;
  if(pct >= 34) return BUCKET.avg;
  return BUCKET.below;
}

function fmtVal(v){
  if(v === null || v === undefined) return '—';
  const n = typeof v === 'number' ? v : parseFloat(v);
  if(!isFinite(n)) return String(v);
  return (Math.round(n*100)/100).toString();
}

function formatPlayerTitle(){
  const name = String(state.meta.displayName || '').trim();
  const age = String(state.meta.age || '').trim();
  if(!name) return '—';
  return `${name.toUpperCase()}${age ? ` (${age})` : ''}`;
}

/* Igual que formatPlayerTitle() pero para un jugador cualquiera del modo
   Comparación — lee directo de las columnas de la fila en vez de los
   campos editables del paso 4 (esos son solo para el jugador único del
   modo individual). */
function titleForRow(row){
  if(!row || !state.playerCol) return '—';
  const name = String(row[state.playerCol] || '').trim();
  const age = state.ageCol ? String(row[state.ageCol] ?? '').trim() : '';
  if(!name) return '—';
  return `${name.toUpperCase()}${age ? ` (${age})` : ''}`;
}

/* ========================================================================
   UI — construcción del sidebar (4 pasos) y del panel principal
   ======================================================================== */

function el(tag, attrs={}, children=[]){
  const e = document.createElement(tag);
  for(const k in attrs){
    if(attrs[k] === undefined || attrs[k] === null) continue;
    if(k === 'html') e.innerHTML = attrs[k];
    else if(k === 'text') e.textContent = attrs[k];
    else if(k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
    else if(k === 'disabled'){ if(attrs[k]) e.setAttribute('disabled','disabled'); }
    else if(k === 'selected'){ e.selected = !!attrs[k]; }
    else e.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children)?children:[children]).forEach(c => { if(c) e.appendChild(c); });
  return e;
}
function opt(value, label, selected){
  const o = document.createElement('option');
  o.value = value; o.textContent = label;
  if(selected) o.selected = true;
  return o;
}

function renderSidebar(){
  const sb = document.getElementById('sidebar');
  // usar fragment para render más eficiente
  const frag = document.createDocumentFragment();
  frag.appendChild(
    el('div', {class:'brand'}, [
      el('div', {class:'mark'}),
      el('div', {}, [
        el('h1', {text:'Rueda de Percentiles'}),
        el('span', {text:'Constructor de gráficos scouting'})
      ])
    ])
  );
  frag.appendChild(buildStep1());
  frag.appendChild(buildStep2());
  frag.appendChild(buildStep3());
  frag.appendChild(buildStep4());
  sb.innerHTML = '';
  sb.appendChild(frag);
}

function stepShell(n, title, bodyChildren, opts={}){
  const body = el('div', {class:'step-body'}, bodyChildren);
  const card = el('div', {class:'step' + (opts.collapsed ? ' collapsed':'')});
  const badge = opts.badge || null;
  const head = el('div', {class:'step-head', onclick: () => {
    card.classList.toggle('collapsed');
  }}, [
    el('div', {class:'num', text:String(n)}),
    el('div', {class:'title', text:title}),
    badge,
    el('div', {class:'chev', html:'&#9662;'})
  ]);
  card.appendChild(head);
  card.appendChild(body);
  return card;
}

/* ---- Paso 1: cargar datos + mapear columnas ---- */
function buildStep1(){
  const dz = el('div', {class:'dropzone'});
  dz.innerHTML = state.rows.length
    ? `<strong>${state.rows.length} jugadores</strong> · ${state.headers.length} columnas cargadas<br><span style="text-decoration:underline;cursor:pointer;">cargar otro archivo</span>`
    : 'Arrastrá tu Excel/CSV de Wyscout acá<br>o <strong style="color:var(--gold);cursor:pointer;">elegí un archivo</strong>';

  const fileInput = el('input', {type:'file', accept:'.xlsx,.xls,.csv', style:'display:none;'});
  fileInput.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if(f) await handleFile(f);
  });

  dz.addEventListener('click', () => fileInput.click());
  ['dragover','dragenter'].forEach(evt => dz.addEventListener(evt, (e)=>{e.preventDefault(); dz.classList.add('drag');}));
  ['dragleave','drop'].forEach(evt => dz.addEventListener(evt, (e)=>{e.preventDefault(); dz.classList.remove('drag');}));
  dz.addEventListener('drop', async (e) => {
    const f = e.dataTransfer.files[0];
    if(f) await handleFile(f);
  });

  const children = [dz, fileInput];

  if(state.rows.length){
    const mapRow = (label, key) => {
      const sel = el('select', {onchange: (e)=>{ state[key] = e.target.value || null; refreshAll(); }});
      sel.appendChild(opt('', '— ninguna —'));
      state.headers.forEach(h => sel.appendChild(opt(h, h, state[key]===h)));
      return el('div', {}, [el('label', {class:'field-label', text:label}), sel]);
    };
    const playerSel = el('select', {onchange:(e)=>{state.playerCol=e.target.value||null; refreshAll();}});
    playerSel.appendChild(opt('', '— ninguna —'));
    state.headers.forEach(h => playerSel.appendChild(opt(h,h,state.playerCol===h)));

    children.push(
      el('div', {style:'margin-top:14px;'}, [
        el('label', {class:'field-label', text:'Columna de jugador (obligatoria)'}),
        playerSel
      ]),
      el('div', {class:'row3', style:'margin-top:8px;'}, [
        mapRow('Equipo', 'teamCol'),
        mapRow('Posición', 'posCol'),
        mapRow('Minutos', 'minutesCol'),
        mapRow('Pie', 'footCol'),
      ])
    );
  }

  return stepShell(1, 'Cargar datos', children);
}

async function handleFile(file){
  try{
    const json = await parseWorkbookFile(file);
    await ingestRows(json);
    state.filters = [];
    state.selectedRow = null;
    state.activeRanking = null;
    refreshAll();
  }catch(err){
    alert('No se pudo leer el archivo: ' + err.message);
  }
}

/* ---- Paso 2: grupo de comparación ---- */
function buildStep2(){
  const disabled = !state.rows.length;
  const children = [];
  const count = state.rows.length ? groupRows().length : 0;

  children.push(el('div', {style:'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;'}, [
    el('span', {class:'helptext', text:'El percentil de cada métrica se calcula contra este grupo.'}),
    el('span', {class:'pill-count', text: state.rows.length ? `${count} jugadores` : '—'})
  ]));

  state.filters.forEach((f, i) => {
    const colSel = el('select', {onchange:(e)=>{f.col=e.target.value; refreshAll();}});
    colSel.appendChild(opt('', 'columna...'));
    state.headers.forEach(h => colSel.appendChild(opt(h,h,f.col===h)));
    const opSel = el('select', {onchange:(e)=>{f.op=e.target.value; refreshAll();}});
    Object.keys(OPS).forEach(o => opSel.appendChild(opt(o,o,f.op===o)));
    const valInput = el('input', {type:'text', placeholder:'valor', oninput:debounce((e)=>{f.val=e.target.value; refreshCount();}, 120)});
    valInput.value = f.val || '';
    const del = el('button', {class:'btn-icon', html:'&times;', onclick:()=>{ state.filters.splice(i,1); refreshAll(); }});
    children.push(el('div', {class:'rule'}, [colSel, opSel, valInput, del]));
  });

  children.push(el('button', {class:'btn-ghost', text:'+ Agregar filtro', disabled, onclick:()=>{
    state.filters.push({col:'', op:'=', val:''});
    refreshAll();
  }}));

  children.push(el('div', {class:'helptext', text:'Sin filtros, el grupo es toda la tabla cargada. Ej: Posición contiene "CB", Minutos >= 500.'}));

  return stepShell(2, 'Grupo de comparación', children);
}

function refreshCount(){
  const badge = document.querySelector('#sidebar .pill-count');
  if(badge) badge.textContent = state.rows.length ? `${groupRows().length} jugadores` : '—';
}

/* ---- Paso 3: categorías y métricas (el corazón de la herramienta) ---- */

function findColumnByAliases(aliases){
  const cols = state.numericCols.map(h => ({ h, l: h.toLowerCase() }));
  for(const alias of aliases){
    const a = alias.toLowerCase();
    const hit = cols.find(x => x.l === a);
    if(hit) return hit.h;
  }
  for(const alias of aliases){
    const a = alias.toLowerCase();
    const hit = cols.find(x => x.l.includes(a));
    if(hit) return hit.h;
  }
  return null;
}

function applyPreset(preset, includePhysical){
  if(state.categories.length){
    const ok = confirm('Esto reemplaza las categorías y métricas actuales por el preset. ¿Continuar?');
    if(!ok) return;
  }
  state.activeRanking = null;
  if(preset.custom){
    state.categories = preset.categories.map((catDef, idx) => ({
      id: uid('c'), name: catDef.name, color: PALETTE[idx % PALETTE.length], colorIdx: idx % PALETTE.length, metrics: []
    }));
    renderSidebar();
    renderMain();
    return;
  }
  const newCats = [];
  let missing = 0;
  preset.categories.forEach((catDef, idx) => {
    if(catDef.physical && !includePhysical) return;
    const metrics = [];
    catDef.metrics.forEach(mdef => {
      const col = findColumnByAliases(mdef.aliases);
      if(col) metrics.push({ id: uid('m'), col, label: mdef.label, invert: !!mdef.invert, wide: !!mdef.wide, labelTouched: true });
      else missing++;
    });
    if(metrics.length) newCats.push({ id: uid('c'), name: catDef.name, color: PALETTE[idx % PALETTE.length], colorIdx: idx % PALETTE.length, baseWeight:catDef.baseWeight, metrics });
  });
  if(!newCats.length){
    alert('Ninguna columna de tu tabla coincide con los nombres típicos de este preset. Probá armar las métricas manualmente en el paso 3.');
    return;
  }
  state.categories = newCats;
  state.profile.lastCategorySignature = null;
  renderSidebar();
  renderMain();
  if(missing){
    setTimeout(() => alert(`Preset aplicado. ${missing} métrica(s) del preset no se encontraron en tu tabla y quedaron afuera — podés agregarlas a mano si tu columna tiene otro nombre.`), 50);
  }
}

/* ---- ventana modal para elegir métricas (checklist clickeable) ---- */
/* Clasificador de columnas para las pestañas del selector de métricas
   (paso 3). No depende de un catálogo fijo — funciona por palabras clave
   sobre el nombre de columna tal cual viene en el Excel del usuario, así
   que agrupa igual de bien un export estándar de Wyscout que uno con
   columnas reordenadas o renombradas parcialmente. Reglas en orden de
   prioridad: la primera que matchea gana (por eso "offensive duels" va
   antes que el genérico "duels", etc.). */
const METRIC_CATEGORY_RULES = [
  { cat:'Portero', kws:['conceded goal','shots against','clean sheet','save rate','xg against','prevented goal','back passes received','exit','goalkeeper','gk '] },
  { cat:'Balón parado', kws:['free kick','corner','penalties taken','penalty conversion'] },
  { cat:'Físico', kws:['distance','speed','acceleration','deceleration','meter/min','sprint','hsr','high intensity',' hi '] },
  { cat:'Pases clave', kws:['xa','shot assist','second assist','third assist','smart pass','key pass','final third','penalty area','through pass','deep completion','deep completed'] },
  { cat:'Pases', kws:['pass','cross','progressive pass'] },
  { cat:'Defensivo', kws:['defensive','aerial duel','sliding tackle','block','intercept','fouls per','yellow card','red card'] },
  { cat:'Ataque', kws:['goal','xg','shot','dribble','offensive duel','touches in box','progressive run','assist','fouls suffered','attacking'] },
];
function classifyMetricColumn(colName){
  const c = String(colName || '').toLowerCase();
  for(const rule of METRIC_CATEGORY_RULES){
    if(rule.kws.some(k => c.includes(k))) return rule.cat;
  }
  return 'General';
}
/* Orden fijo de pestañas (solo se muestran las que tengan al menos una
   columna presente en la tabla cargada). */
const METRIC_CATEGORY_ORDER = ['Defensivo', 'Ataque', 'Pases', 'Pases clave', 'Portero', 'Balón parado', 'Físico', 'General'];

function openMetricModal(cat){
  const existing = document.getElementById('metric-modal-backdrop');
  if(existing) existing.remove();

  const selected = new Set(cat.metrics.filter(m => m.col).map(m => m.col));

  const backdrop = el('div', {id:'metric-modal-backdrop', class:'modal-backdrop'});
  const panel = el('div', {class:'modal-panel'});

  const closeModal = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if(e.target === backdrop) closeModal(); });

  const counter = el('span', {class:'helptext', text: `${selected.size} seleccionadas`});

  const header = el('div', {class:'modal-header'}, [
    el('div', {}, [
      el('h3', {text: `Elegir métricas — ${cat.name}`}),
      el('div', {class:'helptext', text:'Tocá una tarjeta para agregarla o quitarla del gráfico.'})
    ]),
    el('button', {class:'btn-icon', html:'&times;', onclick: closeModal})
  ]);

  const search = el('input', {type:'text', placeholder:'Buscar estadística (ej: pases, duelos, goles...)', class:'modal-search'});

  // pestañas de categoría — solo las que tengan al menos una columna presente
  const colsByCat = new Map();
  state.numericCols.forEach(h => {
    const c = classifyMetricColumn(h);
    if(!colsByCat.has(c)) colsByCat.set(c, []);
    colsByCat.get(c).push(h);
  });
  const availableCats = METRIC_CATEGORY_ORDER.filter(c => colsByCat.has(c));
  let activeCat = 'Todas';
  const tabsRow = el('div', {style:'display:flex;gap:6px;flex-wrap:wrap;margin:12px 20px 0;'});
  const grid = el('div', {class:'modal-grid'});

  function renderTabs(){
    tabsRow.innerHTML = '';
    const tabBtn = (key, label, count) => {
      const isActive = activeCat === key;
      const btn = el('button', {
        type:'button', class:'btn-sm',
        text: count !== undefined ? `${label} (${count})` : label,
        style:`border-radius:16px;padding:5px 12px;font-size:11px;font-weight:700;cursor:pointer;
               background:${isActive ? 'var(--gold-soft)' : 'transparent'};
               border:1px solid ${isActive ? 'var(--gold)' : 'var(--border)'};
               color:${isActive ? 'var(--gold)' : 'var(--ink-dim)'};`,
        onclick: () => { activeCat = key; renderTabs(); renderGrid(search.value); }
      });
      return btn;
    };
    tabsRow.appendChild(tabBtn('Todas', 'Todas', state.numericCols.length));
    availableCats.forEach(c => tabsRow.appendChild(tabBtn(c, c, colsByCat.get(c).length)));
  }
  renderTabs();

  function renderGrid(filter){
    grid.innerHTML = '';
    const f = (filter||'').toLowerCase();
    const base = activeCat === 'Todas' ? state.numericCols : (colsByCat.get(activeCat) || []);
    const cols = base.filter(h => h.toLowerCase().includes(f));
    if(!cols.length){ grid.appendChild(el('div', {class:'dd-empty', text:'Sin resultados para esa búsqueda.'})); return; }
    cols.forEach(h => {
      const card = el('div', {class:'modal-item' + (selected.has(h) ? ' sel' : '')}, [
        el('div', {class:'modal-item-check'}),
        el('span', {text:h}),
      ]);
      card.addEventListener('click', () => {
        if(selected.has(h)) selected.delete(h); else selected.add(h);
        card.classList.toggle('sel');
        counter.textContent = `${selected.size} seleccionadas`;
      });
      grid.appendChild(card);
    });
  }
  renderGrid('');
  search.addEventListener('input', debounce((e) => renderGrid(e.target.value), 100));

  const footer = el('div', {class:'modal-footer'}, [
    counter,
    el('div', {style:'display:flex;gap:8px;'}, [
      el('button', {class:'btn', text:'Cancelar', onclick: closeModal}),
      el('button', {class:'btn btn-gold', text:'Aplicar selección', onclick: () => {
        const kept = cat.metrics.filter(m => selected.has(m.col));
        const keptCols = new Set(kept.map(m => m.col));
        selected.forEach(h => { if(!keptCols.has(h)) kept.push({ id: uid('m'), col:h, label:h, invert:false, wide:false }); });
        cat.metrics = kept;
        closeModal();
        renderSidebar();
      }}),
    ])
  ]);

  panel.appendChild(header);
  panel.appendChild(tabsRow);
  panel.appendChild(search);
  panel.appendChild(grid);
  panel.appendChild(footer);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  setTimeout(() => search.focus(), 0);
}

function buildStep3(){
  const disabled = !state.rows.length;
  const children = [];

  if(!state.numericCols.length && state.rows.length){
    children.push(el('div', {class:'helptext', text:'No se detectaron columnas numéricas en la tabla.'}));
  }

  if(state.rows.length){
    const positions = [...new Set(PRESETS.map(p => p.position))];
    if(!state.presetUI.position) state.presetUI.position = '';

    const posSel = el('select', {onchange:(e)=>{
      state.presetUI.position = e.target.value;
      state.presetUI.role = '';
      renderSidebar();
    }});
    posSel.appendChild(opt('', 'posición...'));
    positions.forEach(p => posSel.appendChild(opt(p, p, state.presetUI.position === p)));

    const rolesForPos = PRESETS.filter(p => p.position === state.presetUI.position);
    const roleSel = el('select', {disabled: !state.presetUI.position, onchange:(e)=>{
      state.presetUI.role = e.target.value;
    }});
    roleSel.appendChild(opt('', state.presetUI.position ? 'rol...' : '— elegí posición primero —'));
    rolesForPos.forEach(p => roleSel.appendChild(opt(p.role, p.role, state.presetUI.role === p.role)));

    const hasPhysicalCats = rolesForPos.some(p => p.categories && p.categories.some(c => c.physical));
    const physCheckbox = el('input', {type:'checkbox', id:'phys-check', onchange:(e)=>{ state.presetUI.includePhysical = e.target.checked; }});
    physCheckbox.checked = state.presetUI.includePhysical;
    const physRow = el('label', {style:'display:flex;align-items:center;gap:7px;margin-top:9px;font-size:11px;color:var(--ink-dim);cursor:pointer;'}, [
      physCheckbox,
      el('span', {text:'Incluir métricas físicas / GPS (necesitan datos de tracking, no vienen en un export estándar de Wyscout)'})
    ]);

    const applyBtn = el('button', {class:'btn btn-sm', text:'Aplicar preset', style:'white-space:nowrap;', onclick:()=>{
      const preset = PRESETS.find(p => p.position === state.presetUI.position && p.role === state.presetUI.role);
      if(!preset){ alert('Elegí posición y rol primero.'); return; }
      applyPreset(preset, state.presetUI.includePhysical);
    }});

    children.push(
      el('div', {class:'preset-box'}, [
        el('label', {class:'field-label', text:'Preset de posición y rol (estilo scouting)'}),
        el('div', {class:'row2'}, [posSel, roleSel]),
        el('div', {style:'display:flex;gap:6px;margin-top:8px;'}, [applyBtn]),
        hasPhysicalCats ? physRow : null,
        el('div', {class:'helptext', text:'Autocompleta categorías y métricas típicas del rol, buscando columnas similares en tu tabla. Podés editarlas después.'})
      ])
    );
  }

  state.categories.forEach((cat, ci) => {
    const swatch = el('div', {class:'cat-swatch', style:`background:${cat.color};cursor:pointer;`,
      title:'Click para cambiar color',
      onclick: () => { cat.colorIdx = ((cat.colorIdx||0)+1) % PALETTE.length; cat.color = PALETTE[cat.colorIdx]; renderSidebar(); }
    });
    const nameInput = el('input', {type:'text', value:cat.name});
    nameInput.value = cat.name;
    nameInput.addEventListener('input', (e)=>{ cat.name = e.target.value; });

    const moveUp = el('button', {class:'btn-icon', html:'&uarr;', title:'Subir categoría', onclick:()=>{
      if(ci>0){ [state.categories[ci-1], state.categories[ci]] = [state.categories[ci], state.categories[ci-1]]; renderSidebar(); }
    }});
    const moveDown = el('button', {class:'btn-icon', html:'&darr;', title:'Bajar categoría', onclick:()=>{
      if(ci<state.categories.length-1){ [state.categories[ci+1], state.categories[ci]] = [state.categories[ci], state.categories[ci+1]]; renderSidebar(); }
    }});
    const del = el('button', {class:'btn-icon', html:'&times;', title:'Eliminar categoría', onclick:()=>{
      state.categories.splice(ci,1); renderSidebar();
    }});

    const catHead = el('div', {class:'cat-head'}, [swatch, nameInput, moveUp, moveDown, del]);

    const metricRows = cat.metrics.map((m, mi) => {
      const labelWrap = el('div', {class:'metric-label-wrap'});
      const labelInput = el('input', {type:'text', class:'metric-label-input'});
      labelInput.value = m.label || m.col;
      labelInput.addEventListener('input', (e)=>{ m.label = e.target.value; m.labelTouched = true; });
      labelWrap.appendChild(labelInput);
      if(m.col) labelWrap.appendChild(el('span', {class:'metric-src', text:m.col, title:'Columna de origen: ' + m.col}));

      const invertBtn = el('div', {class:'toggle' + (m.invert?' on':''), text:'menor=mejor', title:'Invertir: valores bajos son mejores (ej. faltas, tarjetas)', onclick:()=>{
        m.invert = !m.invert; invertBtn.classList.toggle('on');
      }});
      const wideBtn = el('div', {class:'toggle' + (m.wide?' on':''), text:'clave', title:'Métrica clave: ocupa un sector más ancho en la rueda', onclick:()=>{
        m.wide = !m.wide; wideBtn.classList.toggle('on');
      }});
      const delM = el('button', {class:'btn-icon', html:'&times;', onclick:()=>{
        cat.metrics.splice(mi,1); renderSidebar();
      }});
      return el('div', {class:'metric-row'}, [labelWrap, invertBtn, wideBtn, delM]);
    });

    const addMetric = el('button', {class:'btn-ghost', text:'+ Elegir métricas', disabled, onclick:()=>{
      openMetricModal(cat);
    }});

    const catBody = el('div', {class:'cat-body'}, [...metricRows, addMetric]);
    children.push(el('div', {class:'cat-card'}, [catHead, catBody]));
  });

  children.push(el('button', {class:'btn-ghost', text:'+ Categoría', disabled, onclick:()=>{
    const idx = state.categories.length % PALETTE.length;
    state.categories.push({id:uid('c'), name:'Nueva categoría', color:PALETTE[idx], colorIdx:idx, metrics:[]});
    renderSidebar();
  }}));

  children.push(el('div', {class:'helptext', text:'Cada categoría es un grupo angular de la rueda (ej: Defensivo, Creación). "menor=mejor" invierte el percentil para métricas como faltas o tarjetas. "clave" ensancha el sector.'}));

  return stepShell(3, 'Categorías y métricas', children);
}

/* ---- Nombre de jugador: parseo "Apellido, Inicial." y orden para el listado ---- */
function parsePlayerName(full){
  const parts = String(full||'').trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return { apellido:'', inicial:'' };
  const apellido = parts[parts.length-1];
  const inicial = parts[0].charAt(0).toUpperCase();
  return { apellido, inicial };
}
function playerLabel(row){
  const { apellido, inicial } = parsePlayerName(row[state.playerCol]);
  const club = state.teamCol ? String(row[state.teamCol]||'').trim() : '';
  return `${apellido}, ${inicial}.${club ? ' - ' + club : ''}`;
}
function sortedRowsForPicker(){
  return state.rows.slice().sort((a,b) => {
    const A = parsePlayerName(a[state.playerCol]), B = parsePlayerName(b[state.playerCol]);
    const apCmp = A.apellido.localeCompare(B.apellido, 'es', {sensitivity:'base'});
    if(apCmp !== 0) return apCmp;
    const inCmp = A.inicial.localeCompare(B.inicial, 'es', {sensitivity:'base'});
    if(inCmp !== 0) return inCmp;
    const clubA = state.teamCol ? String(a[state.teamCol]||'') : '';
    const clubB = state.teamCol ? String(b[state.teamCol]||'') : '';
    return clubA.localeCompare(clubB, 'es', {sensitivity:'base'});
  });
}

/* ---- Paso 4: jugador + textos del gráfico ---- */
function buildStep4(){
  const disabled = !state.rows.length || !state.playerCol;
  const children = [];

  if(state.rows.length && state.playerCol){
    const sorted = sortedRowsForPicker();
    const playerSel = el('select', {onchange:(e)=>{
      const idx = e.target.value === '' ? -1 : parseInt(e.target.value,10);
      state.selectedRow = idx >= 0 ? sorted[idx] : null;
      state.meta.selectedNationality = ''; // el jugador cambió: no arrastramos la elección del anterior
      if(state.selectedRow){
        state.meta.displayName = String(state.selectedRow[state.playerCol] || '');
        if(state.teamCol) state.meta.club = String(state.selectedRow[state.teamCol] || state.meta.club);
        state.meta.age = state.ageCol ? String(state.selectedRow[state.ageCol] ?? '').trim() : '';
      }
      // Actualiza el encabezado de la rueda en pantalla junto con los datos
      // del jugador, incluida la edad tomada desde la columna AGE.
      refreshAll();
    }});
    playerSel.appendChild(opt('', 'elegí un jugador...'));
    sorted.forEach((r, i) => {
      playerSel.appendChild(opt(i, playerLabel(r), state.selectedRow === r));
    });
    children.push(el('div', {}, [
      el('label', {class:'field-label', text:'Jugador'}),
      playerSel,
      el('div', {class:'helptext', text:'Ordenados por Apellido, Inicial. - Club'})
    ]));

    // Si el jugador tiene más de un país candidato (nace en uno, pasaporte
    // de otro/s), no adivinamos: mostramos las banderas y elegís vos cuál
    // representa. Ej: Stuani nace en Uruguay con pasaporte uruguayo+italiano
    // -> hay que poder elegir Uruguay explícitamente en vez de que la app
    // tire una moneda.
    const candidates = getNationalityCandidates();
    if(candidates.length > 1){
      const activePick = state.meta.selectedNationality || candidates[0];
      const chips = el('div', {style:'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;'});
      candidates.forEach(country => {
        const isActive = normalizeCountryName(country) === normalizeCountryName(activePick);
        const fifa = countryToFifaCode(country);
        const chip = el('button', {
          type:'button',
          style:`display:flex;align-items:center;gap:6px;padding:5px 9px;border-radius:7px;font-size:11.5px;cursor:pointer;
                 background:${isActive ? 'var(--gold-soft)' : '#0D1220'};
                 border:1px solid ${isActive ? 'var(--gold)' : 'var(--border)'};
                 color:${isActive ? 'var(--gold)' : 'var(--ink-dim)'};font-weight:${isActive ? '700' : '500'};`,
          onclick: () => { state.meta.selectedNationality = country; refreshAll(); }
        }, [
          fifa ? el('img', {src: flagCdnUrl(fifa), alt:'', style:'height:14px;width:auto;border-radius:2px;flex-shrink:0;',
              onerror:(e)=>{ e.target.style.display='none'; }}) : null,
          el('span', {text: country}),
        ]);
        chips.appendChild(chip);
      });
      children.push(el('div', {style:'margin-top:8px;'}, [
        el('label', {class:'field-label', text:'Selección que representa'}),
        chips,
        el('div', {class:'helptext', text:'Tiene más de una nacionalidad cargada — elegí cuál mostrar.'})
      ]));
    }
  } else {
    children.push(el('div', {class:'helptext', text:'Cargá datos y mapeá la columna de jugador primero.'}));
  }

  const textField = (label, key, placeholder) => {
    const inp = el('input', {type:'text', placeholder: placeholder||''});
    inp.value = state.meta[key] || '';
    inp.addEventListener('input', (e)=>{ state.meta[key] = e.target.value; });
    return el('div', {}, [el('label', {class:'field-label', text:label}), inp]);
  };

  children.push(
    textField('Nombre a mostrar', 'displayName'),
    el('div', {class:'row2'}, [
      textField('Etiqueta del grupo', 'groupLabel', 'vs. Defensas'),
      textField('Bandera/país', 'flag', '🇦🇷 o Argentina'),
    ]),
    el('div', {class:'row3'}, [
      textField('Competición', 'competition', 'Liga Profesional'),
      textField('Club', 'club'),
      textField('Temporada', 'season', '2026'),
    ]),
  );

  const genBtn = el('button', {class:'btn-gold', text:'Generar gráfico', style:'width:100%;margin-top:14px;padding:11px;font-size:13px;border-radius:8px;', disabled: (!state.rows.length || !state.playerCol || !state.categories.some(c=>c.metrics.some(m=>m.col))), onclick: generateWheel});
  children.push(genBtn);

  return stepShell(4, 'Jugador y datos', children, {collapsed:false});
}

/* ========================================================================
   Geometría de la rueda (SVG)
   ======================================================================== */

const CX = 350, CY = 350;
const R_HOLE = 68;       // radio del círculo central (más chico ahora que quedó vacío: le da más protagonismo a los sectores)
const R_MAX = 262;       // radio máximo que puede alcanzar un sector (100%)
const R_RING_IN = 272;   // anillo fino de categoría (inicio)
const R_RING_OUT = 282;  // anillo fino de categoría (fin)
const R_BADGE = 302;     // radio del badge de percentil
const R_VALUE = 320;     // radio del valor crudo
const R_LABEL = 344;     // radio del texto de la métrica
const R_CATLABEL = 378;  // nombre de categoría — banda propia, la más externa de todas
const GAP_METRIC = 1.6;  // grados entre métricas de una misma categoría
const GAP_CAT = 6;       // grados entre categorías

function deg2rad(d){ return (d * Math.PI) / 180; }
function polar(r, angleDeg){
  const rad = deg2rad(angleDeg);
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}
function normAngle(a){ let x = a % 360; if(x<0) x+=360; return x; }

function sectorPath(r1, r2, a1, a2){
  const p1 = polar(r1, a1), p2 = polar(r2, a1), p3 = polar(r2, a2), p4 = polar(r1, a2);
  const large = Math.abs(a2 - a1) > 180 ? 1 : 0;
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} `
       + `A ${r2.toFixed(2)} ${r2.toFixed(2)} 0 ${large} 1 ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} `
       + `L ${p4.x.toFixed(2)} ${p4.y.toFixed(2)} `
       + `A ${r1.toFixed(2)} ${r1.toFixed(2)} 0 ${large} 0 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`;
}

function arcPathDir(r, aFrom, aTo, sweepFlag){
  const p1 = polar(r, aFrom), p2 = polar(r, aTo);
  const large = Math.abs(aTo - aFrom) > 180 ? 1 : 0;
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} ${sweepFlag} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
}

function escapeXmlText(s){
  if(s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Posiciona el tooltip de la rueda pegado al cursor, pero sin salirse del
// contenedor (evita que se corte contra el borde de la tarjeta).
function positionTooltip(tooltipEl, evt){
  const container = tooltipEl.parentElement;
  if(!container) return;
  const rect = container.getBoundingClientRect();
  const OFFSET = 14;
  let x = evt.clientX - rect.left + OFFSET;
  let y = evt.clientY - rect.top + OFFSET;
  const ttW = tooltipEl.offsetWidth || 170;
  const ttH = tooltipEl.offsetHeight || 90;
  if(x + ttW > rect.width) x = evt.clientX - rect.left - ttW - OFFSET;
  if(y + ttH > rect.height) y = evt.clientY - rect.top - ttH - OFFSET;
  tooltipEl.style.left = Math.max(4, x) + 'px';
  tooltipEl.style.top = Math.max(4, y) + 'px';
}

/* Trae una bandera como data URI en base64 (mismo patrón ya probado en
   exportPNG): evita el SecurityError de canvas.toBlob() por CORS al
   rasterizar, porque no queda ningún pedido de red pendiente en ese
   momento. Se exporta para que compare.js la reuse en el PDF en vez de
   duplicar esta lógica. */
export async function fetchFlagDataUri(fifaCode){
  if(!fifaCode) return null;
  try{
    const resp = await fetch(flagCdnUrl(fifaCode));
    const blob = await resp.blob();
    const dataUri = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise((res) => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => res(null);
      img.src = dataUri;
    });
    return { dataUri, aspect: (dims && dims.h) ? dims.w / dims.h : 4/3 };
  }catch(e){ return null; } // sin conexión / bandera no encontrada
}

/* Rasteriza un string SVG a PNG (data URL) vía canvas @2x, mismo patrón
   probado en exportPNG. Se exporta para que compare.js arme las imágenes
   de cada rueda para el PDF sin reimplementar esto. */
export function svgStringToPngDataUrl(svgString, w, h, bg){
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      if(bg){ ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function svgEl(tag, attrs={}){
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for(const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function radialText(radius, angleDeg, text, opts={}){
  const a = normAngle(angleDeg);
  const p = polar(radius, a);
  let rot = a + 90;
  let anchor = 'middle';
  const rotN = normAngle(rot);
  if(rotN > 90 && rotN < 270){ rot += 180; }
  const attrs = {
    x: p.x.toFixed(2), y: p.y.toFixed(2),
    'text-anchor': anchor,
    'dominant-baseline': 'middle',
    transform: `rotate(${rot.toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)})`,
    fill: opts.fill || '#8B93A7',
    'font-size': opts.size || 11,
    'font-family': opts.mono ? "'JetBrains Mono', monospace" : "'Inter', sans-serif",
    'font-weight': opts.weight || 500,
    'letter-spacing': opts.spacing || '0'
  };
  if(opts.cssClass) attrs.class = opts.cssClass;
  if(opts.maxWidth) attrs['data-maxw'] = opts.maxWidth.toFixed(2);
  const t = svgEl('text', attrs);
  t.textContent = text;
  return t;
}

// Ajusta etiquetas que exceden ancho disponible (se ejecuta después de insertarse el SVG en DOM)
function fitLabelsToArcs(svg){
  svg.querySelectorAll('[data-maxw]').forEach(t => {
    const maxW = parseFloat(t.getAttribute('data-maxw'));
    if(!maxW || maxW <= 4) return;
    let actual;
    try{ actual = t.getComputedTextLength(); }catch(e){ return; }
    if(actual > maxW){
      t.setAttribute('textLength', maxW.toFixed(2));
      t.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    }
  });
}

// BUILD METRIC LAYOUT optimizado O(n)
function buildMetricLayout(){
  const flat = [];
  const catsWithMetrics = state.categories.filter(c => c.metrics.some(m=>m.col));
  if(catsWithMetrics.length === 0) return { flat: [], catSpans: [] };

  const weightOf = (m) => m.wide ? 1.45 : 1;
  let totalWeight = 0;
  let internalGaps = 0;
  catsWithMetrics.forEach(c => {
    const metrics = c.metrics.filter(m => m.col);
    internalGaps += Math.max(0, metrics.length - 1);
    metrics.forEach(m => totalWeight += weightOf(m));
  });

  const totalGapDeg = catsWithMetrics.length * GAP_CAT + internalGaps * GAP_METRIC;
  const remaining = Math.max(360 - totalGapDeg, 10);
  const perWeight = remaining / totalWeight;

  let angle = -90; // empieza arriba
  const catSpans = [];

  catsWithMetrics.forEach(cat => {
    const metrics = cat.metrics.filter(m => m.col);
    if(!metrics.length) return;
    const catStart = angle;
    metrics.forEach((m, i) => {
      const span = weightOf(m) * perWeight;
      const a1 = angle;
      const a2 = angle + span;
      flat.push({ cat, m, angles: { a1, a2 } });
      angle = a2 + (i < metrics.length -1 ? GAP_METRIC : 0);
    });
    const catEnd = angle;
    catSpans.push({ cat, a1: catStart, a2: catEnd });
    angle = catEnd + GAP_CAT;
  });

  return { flat, catSpans };
}

function generateWheel(){
  if(!state.selectedRow){ alert('Elegí un jugador primero.'); return; }
  const hasMetrics = state.categories.some(c => c.metrics.some(m=>m.col));
  if(!hasMetrics){ alert('Agregá al menos una métrica en el paso 3.'); return; }
  renderMain();
}

function curvedArcText(svg, radius, angle, text, opts={}){
  const originalChars = [...String(text || '')];
  if(!originalChars.length) return;
  // Debe usar EXACTAMENTE la misma condición que radialText() para decidir
  // si cada glifo se rota 180°. Antes este umbral estaba desfasado 90°
  // respecto al de radialText (comparaba el ángulo crudo contra 90/270 en
  // vez de angle+90), lo que hacía que el orden de letras se invirtiera en
  // cuadrantes donde la rotación del glifo NO se invertía (y viceversa),
  // produciendo texto "espejado" tipo "ARUTREBOC" o "sleud laireA".
  const rotCheck = normAngle(angle + 90);
  const lowerHalf = rotCheck > 90 && rotCheck < 270;
  // En la mitad inferior el arco cambia de dirección: invertir las letras
  // evita que palabras como "Salida de balón" aparezcan espejadas.
  const chars = lowerHalf ? originalChars.reverse() : originalChars;
  const maxSpan = Math.max(5, opts.maxSpan || 42);
  const naturalSpan = Math.max(opts.minSpan || 0, chars.length * (opts.degPerChar || 1.5));
  const span = Math.min(maxSpan, naturalSpan);
  const start = angle - span / 2;
  chars.forEach((char, charIndex) => {
    const charAngle = chars.length === 1 ? angle : start + (span * charIndex / (chars.length - 1));
    svg.appendChild(radialText(radius, charAngle, char, {
      fill:opts.fill, size:opts.size, weight:opts.weight, mono:opts.mono, spacing:'0'
    }));
  });
}

function curvedCategoryLabel(svg, defs, cat, a1, a2, idx){
  curvedArcText(svg, R_CATLABEL, (a1+a2)/2, cat.name.toUpperCase(), {
    fill:cat.color, size:10.5, weight:700,
    maxSpan:Math.abs(a2-a1)*0.72, degPerChar:1.45, minSpan:10
  });
}

function renderWheelSVG(tooltipEl, playerRow, interactive){
  interactive = interactive === undefined ? true : interactive;
  const group = groupRows();
  const player = playerRow !== undefined ? playerRow : state.selectedRow;
  const { flat, catSpans } = buildMetricLayout();

  const svg = svgEl('svg', { viewBox: '-45 -45 790 790', width: '100%', height: '100%' });
  const defs = svgEl('defs', {});
  svg.appendChild(defs);

  // fondo sutil de anillos guía
  [R_HOLE+30, R_HOLE+70, R_HOLE+110, R_HOLE+150, R_MAX].forEach(r => {
    svg.appendChild(svgEl('circle', { cx:CX, cy:CY, r, fill:'none', stroke:'#1B2233', 'stroke-width':1, 'stroke-dasharray':'2,4' }));
  });

  // sectores de métricas
  flat.forEach(({cat, m, angles}) => {
    if(!angles) return;
    const val = numVal(player, m.col);
    const { pct } = computePercentile(group, m.col, val, m.invert);
    const rankInfo = findGroupRank(group, player, m.col, m.invert);
    const color = bucketColor(pct);
    const outerR = pct === null ? R_HOLE : R_HOLE + (pct/100) * (R_MAX - R_HOLE);

    const wedgeGroup = svgEl('g', { class:'metric-wedge', style: interactive ? '' : 'cursor:default;' });
    if(interactive) wedgeGroup.addEventListener('click', () => openRankingPanel(cat, m));

    if(tooltipEl){
      const label = m.label || m.col;
      const showTooltip = (evt) => {
        tooltipEl.innerHTML = `
          <div class="wtt-title">${escapeXmlText(label)}</div>
          <div class="wtt-row"><span>Valor</span><b>${escapeXmlText(fmtVal(val))}</b></div>
          <div class="wtt-row"><span>Percentil</span><b style="color:${color}">${pct===null?'—':pct}</b></div>
          <div class="wtt-row"><span>Ranking</span><b>${rankInfo ? `#${rankInfo.rank} / ${rankInfo.total}` : '—'}</b></div>
          <div class="wtt-cat">${escapeXmlText(cat.name)}</div>
        `;
        positionTooltip(tooltipEl, evt);
        tooltipEl.classList.add('show');
      };
      wedgeGroup.addEventListener('mouseenter', showTooltip);
      wedgeGroup.addEventListener('mousemove', (evt) => positionTooltip(tooltipEl, evt));
      wedgeGroup.addEventListener('mouseleave', () => tooltipEl.classList.remove('show'));
    }

    wedgeGroup.appendChild(svgEl('path', { class:'wedge-track', d: sectorPath(R_HOLE, R_MAX, angles.a1, angles.a2), fill:'#151C2C' }));
    wedgeGroup.appendChild(svgEl('path', { class:'wedge-fill', d: sectorPath(R_HOLE, outerR, angles.a1, angles.a2), fill:color, opacity:0.88 }));

    const mid = (angles.a1 + angles.a2) / 2;
    const spanRad = (angles.a2 - angles.a1) * Math.PI / 180;
    const badgeMaxW = R_BADGE * spanRad * 0.92;
    const valueMaxW = R_VALUE * spanRad * 0.92;
    const labelMaxW = R_LABEL * spanRad * 0.88;

    const wedgeSpan = Math.abs(angles.a2 - angles.a1);
    curvedArcText(wedgeGroup, R_BADGE, mid, pct===null ? '—' : ordinal(pct), {
      fill:color, size:12.5, weight:700, mono:true, maxSpan:wedgeSpan*0.78, degPerChar:1.6
    });
    curvedArcText(wedgeGroup, R_VALUE, mid, fmtVal(val), {
      fill:'#9AA3B5', size:9.5, mono:true, maxSpan:wedgeSpan*0.78, degPerChar:1.35
    });
    const label = m.label || m.col;
    curvedArcText(wedgeGroup, R_LABEL, mid, label, {
      fill:'#AEB6C8', size:10, weight:600, maxSpan:wedgeSpan*0.84, degPerChar:1.35
    });
    svg.appendChild(wedgeGroup);
  });

  // anillo fino de categoría + etiqueta curvada
  catSpans.forEach(({cat, a1, a2}, idx) => {
    svg.appendChild(svgEl('path', { d: sectorPath(R_RING_IN, R_RING_OUT, a1+0.6, a2-0.6), fill: cat.color }));
    curvedCategoryLabel(svg, defs, cat, a1, a2, idx);
  });

  // círculo central — deliberadamente vacío (solo borde), igual en web y
  // en el PNG exportado.
  svg.appendChild(svgEl('circle', { cx:CX, cy:CY, r:R_HOLE, fill:'#121826', stroke:'#C9A353', 'stroke-width':2 }));
  svg.appendChild(svgEl('circle', { cx:CX, cy:CY, r:R_HOLE-8, fill:'none', stroke:'#2A3448', 'stroke-width':1 }));

  return svg;
}

/* ========================================================================
   Panel principal: header, wheel, footer, export
   ======================================================================== */

function legendItem(color, label){
  return el('div', {style:'display:flex;align-items:center;gap:6px;'}, [
    el('div', {style:`width:10px;height:10px;border-radius:3px;background:${color};flex-shrink:0;`}),
    el('span', {text:label, style:'font-size:10.5px;color:var(--ink-faint);'})
  ]);
}

function renderMain(){
  const main = document.getElementById('main');
  const _scrollTop = main.scrollTop; // se restaura al final para que abrir/cerrar un informe no te tire arriba de la página
  // fragment rendering
  const frag = document.createDocumentFragment();

  if(!state.rows.length){
    const empty = el('div', {id:'empty-state'}, []);
    empty.innerHTML = '<b>Empezá por el paso 1</b><br>Cargá una tabla exportada de Wyscout (.xlsx o .csv) para empezar a armar tu gráfico.';
    frag.appendChild(empty);
    main.innerHTML = '';
    main.appendChild(frag);
    main.scrollTop = _scrollTop;
    return;
  }

  const hasMetrics = state.categories.some(c=>c.metrics.some(m=>m.col));

  // La pestaña de seguimiento también es útil aunque el archivo actual no
  // tenga métricas configuradas todavía, así que las pestañas aparecen con
  // cualquier tabla cargada.
  if(state.rows.length){
    frag.appendChild(renderModeTabs());
  }

  if(state.viewMode === 'compare' && hasMetrics){
    frag.appendChild(renderCompareView());
    main.innerHTML = '';
    main.appendChild(frag);
    main.scrollTop = _scrollTop;
    try{
      fitLabelsToArcs(document.getElementById('wheel-svg-a'));
      fitLabelsToArcs(document.getElementById('wheel-svg-b'));
    }catch(e){}
    return;
  }

  if(state.viewMode === 'profile' && hasMetrics){
    frag.appendChild(renderProfileView());
    main.innerHTML = '';
    main.appendChild(frag);
    main.scrollTop = _scrollTop;
    return;
  }

  if(state.viewMode === 'shortlist'){
    frag.appendChild(renderShortlistView());
    main.innerHTML = '';
    main.appendChild(frag);
    main.scrollTop = _scrollTop;
    return;
  }

  if(!state.selectedRow || !hasMetrics){
    const empty = el('div', {id:'empty-state'}, []);
    empty.innerHTML = '<b>Casi listo</b><br>Elegí un jugador (paso 4) y al menos una métrica (paso 3), después tocá <b>Generar gráfico</b>.';
    frag.appendChild(empty);
    main.innerHTML = '';
    main.appendChild(frag);
    main.scrollTop = _scrollTop;
    return;
  }

  const card = el('div', {id:'wheel-wrap'});

  // header — misma estructura que el PNG exportado: nombre + bandera arriba,
  // club · posición (rol) debajo, y la competencia/temporada como tercera
  // línea secundaria más chica.
  const headerRow = el('div', {style:'display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:2px 4px 12px;'});
  const club = state.meta.club || '';
  const pos = state.presetUI.position || '';
  const role = state.presetUI.role || '';
  const clubRoleLine = [club, (pos && role ? `${pos} (${role})` : (pos || role))].filter(Boolean).join(' · ');
  const compSeason = [state.meta.competition || '', state.meta.season || ''].filter(Boolean).join(' ');
  const groupSuffix = (state.meta.groupLabel || '').trim();
  const percentileLine = ['Percentiles' + (groupSuffix ? ` ${groupSuffix}` : ''), compSeason].filter(Boolean).join(' | ');
  const titleBlock = el('div', {style:'min-width:0;'}, [
    el('h2', {text: formatPlayerTitle(), style:'margin:0;font-family:var(--font-display);font-size:24px;font-weight:700;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--gold);'}),
    clubRoleLine ? el('div', {text: clubRoleLine, style:'color:var(--ink);font-size:14.5px;margin-top:6px;font-weight:700;letter-spacing:.1px;'}) : null,
    percentileLine ? el('div', {text: percentileLine, style:'color:var(--ink-faint);font-size:11px;margin-top:3px;font-weight:500;'}) : null,
  ]);
  const countryName = resolveCountryName();
  const fifaCode = countryToFifaCode(countryName);
  const flagBlock = fifaCode
    ? el('img', { src: flagCdnUrl(fifaCode), alt: countryName, title: countryName, loading:'eager', referrerpolicy:'no-referrer',
        style:'height:30px;width:auto;border-radius:4px;box-shadow:0 0 0 1px rgba(255,255,255,.1);flex-shrink:0;margin-top:3px;',
        onerror:(e)=>{ e.target.replaceWith(el('div', {text: countryName || '', style:'font-size:12px;color:var(--ink-faint);'})); } })
    : (countryName ? el('div', {text: countryName, style:'font-size:12px;color:var(--ink-faint);margin-top:4px;flex-shrink:0;'}) : el('div', {}));
  headerRow.appendChild(titleBlock);
  headerRow.appendChild(flagBlock);
  card.appendChild(headerRow);
  const shortlistAction = el('div', {class:'no-print', style:'display:flex;justify-content:flex-end;margin:-4px 4px 8px;'}, [
    el('button', {class:'btn btn-sm', text: isShortlisted(state.selectedRow) ? '✓ Siguiendo · Quitar' : '☆ Añadir a seguimiento', title:isShortlisted(state.selectedRow) ? 'Quitar de seguimiento' : 'Añadir a seguimiento', onclick:()=>{
      const existing = getShortlistItem(state.selectedRow);
      if(existing) removeShortlistItem(existing.key);
      else upsertShortlist(state.selectedRow, { profile: [state.presetUI.position, state.presetUI.role].filter(Boolean).join(' · ') });
      renderMain();
    }}),
  ]);
  card.appendChild(shortlistAction);
  card.appendChild(el('div', {style:'height:1px;background:linear-gradient(90deg, var(--gold), transparent);margin:0 4px 10px;'}));


  // svg — sin contenido en el círculo central (igual que el PNG), tamaño
  // reducido para que toda la tarjeta entre en una pantalla sin scroll.
  const svgWrap = el('div', {style:'width:100%;aspect-ratio:1/1;max-width:720px;margin:0 auto;position:relative;'});
  const tooltipEl = el('div', {id:'wheel-tooltip'});
  const svg = renderWheelSVG(tooltipEl);
  svg.setAttribute('id','wheel-svg');
  svgWrap.appendChild(svg);
  svgWrap.appendChild(tooltipEl);
  card.appendChild(svgWrap);

  // footer — mismas dos líneas a la izquierda y leyenda en grilla 2x2 a la
  // derecha que en el PNG, sin textos de interacción ("tocá...") para que
  // web y export se vean idénticos.
  const footer = el('div', {style:'padding:10px 4px 2px;border-top:1px solid var(--border);margin-top:4px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;'});
  const footerLeft = el('div', {}, [
    el('div', {text: `Generado ${new Date().toLocaleDateString('es-AR')}`, style:'color:var(--ink-dim);font-size:11px;font-weight:600;'}),
    el('div', {text: 'Sector más ancho = métrica principal del perfil · tocá cualquier métrica para ver el ranking completo', style:'color:var(--ink-faint);font-size:10px;margin-top:4px;'}),
  ]);
  const legend = el('div', {style:'display:grid;grid-template-columns:repeat(2, auto);gap:5px 16px;'}, [
    legendItem(BUCKET.elite, 'Elite · top 10%'),
    legendItem(BUCKET.above, 'Por encima del promedio · 65-89'),
    legendItem(BUCKET.avg, 'Promedio · 34-64'),
    legendItem(BUCKET.below, 'Por debajo del promedio · bottom 33%'),
  ]);
  footer.appendChild(footerLeft);
  footer.appendChild(legend);
  card.appendChild(footer);

  const resultRow = el('div', {id:'result-row'}, [card]);
  if(state.activeRanking) resultRow.appendChild(renderRankingPanel());

  frag.appendChild(resultRow);
  main.innerHTML = '';
  main.appendChild(frag);
  main.scrollTop = _scrollTop;

  // fit labels now the SVG is in DOM (puede ser algo costoso, pero necesario)
  try{ fitLabelsToArcs(document.getElementById('wheel-svg')); }catch(e){}
  // export bar
  const bar = el('div', {id:'export-bar'}, [
    el('button', {class:'btn', text:'Guardar configuración', onclick:exportConfig}),
    el('button', {class:'btn', text:'Cargar configuración', onclick:()=>document.getElementById('cfg-input').click()}),
    el('button', {class:'btn btn-gold', text:'Descargar PNG', onclick:()=>exportPNG()}),
  ]);
  const cfgInput = el('input', {type:'file', accept:'.json', id:'cfg-input', style:'display:none;', onchange:(e)=>{
    const f = e.target.files[0]; if(f) importConfig(f);
  }});
  main.appendChild(bar);
  main.appendChild(cfgInput);
}

/* ---- Ranking: click en una métrica de la rueda muestra dónde queda el jugador en el grupo ---- */

function openRankingPanel(cat, m){
  state.activeRanking = { catName: cat.name, label: m.label || m.col, col: m.col, invert: !!m.invert };
  renderMain();
}

function computeRanking(){
  const info = state.activeRanking;
  if(!info) return { rows: [], info, myPct: null, myVal: null, myRank: null };
  const group = groupRows();
  const rows = group
    .map(r => ({ ref:r, name: state.playerCol ? String(r[state.playerCol] ?? '') : '?', team: state.teamCol ? String(r[state.teamCol] ?? '') : '', val: numVal(r, info.col) }))
    .filter(r => r.val !== null)
    .sort((a,b) => info.invert ? a.val - b.val : b.val - a.val);
  const myVal = state.selectedRow ? numVal(state.selectedRow, info.col) : null;
  const { pct: myPct } = computePercentile(group, info.col, myVal, info.invert);
  const myRank = findGroupRank(group, state.selectedRow, info.col, info.invert);
  return { rows, info, myPct, myVal, myRank };
}

/* Agrupa los valores del grupo en bins para el histograma de "Distribución",
   y calcula media/mediana para dar contexto sin sobrecargar la vista.
   Cantidad de bins escalada según el tamaño del grupo (entre 5 y 12). */
function computeDistribution(rows){
  const vals = rows.map(r => r.val).filter(v => v !== null && isFinite(v));
  if(vals.length < 2) return null;
  const min = Math.min(...vals), max = Math.max(...vals);
  const mean = vals.reduce((a,b) => a+b, 0) / vals.length;
  const sortedVals = vals.slice().sort((a,b) => a-b);
  const mid = Math.floor(sortedVals.length / 2);
  const median = sortedVals.length % 2 ? sortedVals[mid] : (sortedVals[mid-1] + sortedVals[mid]) / 2;
  if(min === max) return { bins: null, min, max, mean, median };
  const binCount = Math.min(12, Math.max(5, Math.round(Math.sqrt(vals.length))));
  const binSize = (max - min) / binCount;
  const bins = Array.from({length: binCount}, (_, i) => ({ from: min + i*binSize, to: min + (i+1)*binSize, count: 0 }));
  vals.forEach(v => {
    let idx = Math.floor((v - min) / binSize);
    if(idx >= binCount) idx = binCount - 1;
    if(idx < 0) idx = 0;
    bins[idx].count++;
  });
  return { bins, min, max, mean, median };
}

function renderRankingPanel(){
  const { rows, info, myPct, myVal, myRank } = computeRanking();
  const panel = el('div', {id:'ranking-panel'});
  panel.appendChild(el('div', {class:'rank-head'}, [
    el('div', {}, [
      el('h3', {text: info.label}),
    ]),
    el('button', {class:'btn-icon', html:'&times;', onclick:()=>{ state.activeRanking = null; renderMain(); }})
  ]));
  panel.appendChild(el('div', {class:'rank-sub', text: `${info.catName} · ranking dentro del grupo (${rows.length} jugadores)${info.invert ? ' · menor es mejor' : ''}`}));

  // Resumen grande: percentil + valor absoluto + posición en el grupo,
  // todo junto y de un vistazo, sin tener que bajar a buscarlo en la lista.
  if(myPct !== null){
    const color = bucketColor(myPct);
    const summary = el('div', {class:'fade-in', style:'padding:10px 4px 14px;border-bottom:1px solid var(--border);margin-bottom:10px;'}, [
      el('div', {style:'display:flex;align-items:baseline;gap:6px;'}, [
        el('span', {text: ordinal(myPct), style:`font-family:var(--font-display);font-size:40px;font-weight:700;line-height:1;color:${color};`}),
        el('span', {text:'percentile', style:'color:var(--ink-faint);font-size:12px;font-weight:600;margin-left:2px;'}),
      ]),
      el('div', {style:'display:flex;flex-direction:column;gap:3px;margin-top:8px;font-size:12px;'}, [
        el('div', {style:'display:flex;justify-content:space-between;max-width:220px;'}, [
          el('span', {text:'Valor', style:'color:var(--ink-faint);'}),
          el('span', {text: fmtVal(myVal), style:'color:var(--ink);font-family:var(--font-mono);font-weight:700;'}),
        ]),
        el('div', {style:'display:flex;justify-content:space-between;max-width:220px;'}, [
          el('span', {text:'Ranking', style:'color:var(--ink-faint);'}),
          el('span', {text: myRank ? `#${myRank.rank} de ${myRank.total}` : '—', style:'color:var(--ink);font-family:var(--font-mono);font-weight:700;'}),
        ]),
      ]),
    ]);
    panel.appendChild(summary);
  }

  // Toggle Ranking (lista) / Distribución (histograma) — la lista sirve
  // para ver nombres puntuales, el histograma para entender rápido si el
  // valor del jugador es un outlier o está pegado al promedio del grupo.
  state.rankingView = state.rankingView || 'list';
  const tabBtn = (key, label) => el('button', {
    type:'button', text: label,
    style:`flex:1;padding:6px 8px;font-size:11.5px;font-weight:700;border-radius:6px;cursor:pointer;
           transition:background .2s ease, border-color .2s ease, color .2s ease;
           background:${state.rankingView===key ? 'var(--gold-soft)' : 'transparent'};
           border:1px solid ${state.rankingView===key ? 'var(--gold)' : 'var(--border)'};
           color:${state.rankingView===key ? 'var(--gold)' : 'var(--ink-dim)'};`,
    onclick: () => { state.rankingView = key; renderMain(); }
  });
  panel.appendChild(el('div', {style:'display:flex;gap:6px;margin-bottom:10px;'}, [
    tabBtn('list', 'Ranking'),
    tabBtn('dist', 'Distribución'),
  ]));

  if(state.rankingView === 'dist'){
    panel.appendChild(el('div', {class:'fade-in'}, [renderDistributionView(rows, myVal)]));
  } else {
    const list = el('div', {class:'rank-list fade-in'});
    const playerRowRef = state.selectedRow;
    rows.forEach((r, i) => {
      const isMe = r.ref === playerRowRef;
      const row = el('div', {class:'rank-row' + (isMe ? ' me' : '')}, [
        el('span', {class:'rk-num', text: '#' + (i+1)}),
        el('span', {class:'rk-name', text: r.team ? `${r.name} — ${r.team}` : r.name}),
        el('span', {class:'rk-val', text: fmtVal(r.val)}),
      ]);
      list.appendChild(row);
    });
    panel.appendChild(list);

    // Centra la fila del jugador DENTRO de la lista interna nada más —
    // seteando scrollTop directo en vez de scrollIntoView(), que hacía
    // scroll de contenedores ancestros (¡hasta la página entera!) cuando
    // el jugador estaba abajo del todo. Se hace siempre que se muestra la
    // lista, sin animación, así nunca se "salta" la ventana.
    setTimeout(() => {
      const meRow = list.querySelector('.rank-row.me');
      if(meRow){
        list.scrollTop = meRow.offsetTop - (list.clientHeight / 2) + (meRow.clientHeight / 2);
      }
    }, 0);
  }

  return panel;
}

/* Histograma: cuántos jugadores del grupo caen en cada rango de valores,
   con la barra del jugador resaltada en dorado, más una línea vertical
   exacta (no solo la barra completa) marcando su valor puntual, y media
   /mediana del grupo debajo para dar contexto sin sobrecargar la vista. */
function renderDistributionView(rows, myVal){
  const dist = computeDistribution(rows);
  if(!dist || !dist.bins){
    return el('div', {class:'helptext', text:'No hay suficiente variación de datos para mostrar una distribución.'});
  }
  const { bins, min, max, mean, median } = dist;
  const maxCount = Math.max(...bins.map(b => b.count), 1);
  const wrap = el('div', {style:'display:flex;flex-direction:column;gap:10px;'});

  // wrapper relativo para poder superponer la línea+etiqueta de "Tu valor"
  const chartWrap = el('div', {style:'position:relative;padding-top:22px;'});
  const chart = el('div', {style:'display:flex;align-items:flex-end;gap:3px;height:150px;padding:0 2px;'});
  bins.forEach(b => {
    const isMyBin = myVal !== null && myVal >= b.from && (myVal < b.to || (b === bins[bins.length-1] && myVal <= b.to));
    const h = Math.max(3, Math.round((b.count / maxCount) * 130));
    const bar = el('div', {
      title: `${fmtVal(b.from)} – ${fmtVal(b.to)}: ${b.count} jugador${b.count===1?'':'es'}`,
      style:`flex:1;height:${h}px;border-radius:3px 3px 0 0;transition:height .25s ease;
             background:${isMyBin ? 'var(--gold)' : 'var(--blue)'};
             opacity:${isMyBin ? '1' : '.55'};`
    });
    chart.appendChild(bar);
  });
  chartWrap.appendChild(chart);

  // marcador exacto del valor del jugador dentro del rango, con etiqueta arriba
  if(myVal !== null && max > min){
    const posPct = Math.min(100, Math.max(0, ((myVal - min) / (max - min)) * 100));
    chartWrap.appendChild(el('div', {style:`position:absolute;left:${posPct}%;top:22px;bottom:0;width:2px;
      background:var(--gold);opacity:.9;pointer-events:none;transform:translateX(-1px);`}));
    chartWrap.appendChild(el('div', {style:`position:absolute;left:${posPct}%;top:0;transform:translateX(-50%);
      font-size:10px;font-weight:700;color:var(--gold);white-space:nowrap;pointer-events:none;`}, [
      el('span', {text:'Tu valor'}),
    ]));
  }
  wrap.appendChild(chartWrap);

  wrap.appendChild(el('div', {style:'display:flex;justify-content:space-between;font-size:10.5px;color:var(--ink-faint);font-family:var(--font-mono);'}, [
    el('span', {text: fmtVal(min)}),
    el('span', {text: fmtVal(max)}),
  ]));

  // media/mediana: línea discreta, poco protagonismo, solo contexto
  wrap.appendChild(el('div', {style:'display:flex;gap:16px;font-size:10.5px;color:var(--ink-faint);padding-top:2px;border-top:1px solid var(--border);margin-top:2px;'}, [
    el('span', {}, [el('span', {text:'Media: '}), el('span', {text: fmtVal(mean), style:'color:var(--ink-dim);font-family:var(--font-mono);'})]),
    el('span', {}, [el('span', {text:'Mediana: '}), el('span', {text: fmtVal(median), style:'color:var(--ink-dim);font-family:var(--font-mono);'})]),
  ]));

  return wrap;
}

/* ---- Export PNG con identidad "informe editorial" (Wyscout/Hudl/Opta) ---- */
async function exportPNG(){
  const svg = document.getElementById('wheel-svg');
  if(!svg){ alert('Nada para exportar'); return; }

  try{ if(document.fonts && document.fonts.ready) await document.fonts.ready; }catch(e){}

  const serializer = new XMLSerializer();
  const svgClone = svg.cloneNode(true);
  const wheelOuter = serializer.serializeToString(svgClone);

  const titleText = formatPlayerTitle();
  const club = state.meta.club || '';
  const pos = state.presetUI.position || '';
  const role = state.presetUI.role || '';
  const clubRoleLine = [club, (pos && role ? `${pos} (${role})` : (pos || role))].filter(Boolean).join(' · ');
  const compSeason = [state.meta.competition || '', state.meta.season || ''].filter(Boolean).join(' ');
  const groupSuffix = (state.meta.groupLabel || '').trim();
  const percentileLine = ['Percentiles' + (groupSuffix ? ` ${groupSuffix}` : ''), compSeason].filter(Boolean).join(' | ');
  const genDate = `Generado ${new Date().toLocaleDateString('es-AR')}`;

  // Bandera: la traemos como data URI en base64 ANTES de armar el SVG.
  // Si la embebiéramos como <image href="https://flagcdn.com/..."> el
  // navegador la pide en el momento de rasterizar para canvas.toBlob(),
  // y como es un recurso cross-origin eso "tinta" el canvas y explota el
  // export con SecurityError. Con la imagen ya en base64 no hace falta
  // ningún pedido de red adicional al rasterizar, así que no hay problema.
  const countryName = resolveCountryName();
  const fifaCode = countryToFifaCode(countryName);
  let flagDataUri = null, flagAspect = 4 / 3;
  if(fifaCode){
    try{
      const resp = await fetch(flagCdnUrl(fifaCode));
      const blob = await resp.blob();
      flagDataUri = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });
      const dims = await new Promise((res) => {
        const img = new Image();
        img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => res(null);
        img.src = flagDataUri;
      });
      if(dims && dims.h) flagAspect = dims.w / dims.h;
    }catch(e){ flagDataUri = null; } // sin conexión / bandera no encontrada: seguimos sin ella
  }

  function escapeXml(s){
    if(!s) return '';
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }
  // Mide texto real con canvas 2D (usa el mismo font-family/weight que se
  // va a dibujar) para poder achicar automáticamente lo que no entre, en
  // vez de recortarlo o dejar que se superponga a la bandera.
  const measureCtx = document.createElement('canvas').getContext('2d');
  function textWidth(text, font){
    measureCtx.font = font;
    return measureCtx.measureText(text || '').width;
  }
  function fitFontSize(text, maxWidth, family, weight, basePx, minPx){
    let size = basePx;
    while(size > minPx && textWidth(text, `${weight} ${size}px ${family}`) > maxWidth) size -= 0.5;
    return size;
  }

  // Conserva todo el viewBox de la rueda (790x790 con -45 de margen interno),
  // el gráfico radial en sí no se toca: solo el layout alrededor.
  const W = 790;
  const WHEEL_H = 790;
  const MARGIN = 50;
  const HEADER_H = 108;
  const FOOTER_H = 78;
  const H = HEADER_H + WHEEL_H + FOOTER_H;

  const wheelGroup = wheelOuter.replace(/^<svg[^>]*>/i, `<g transform="translate(45, ${HEADER_H + 45})">`).replace(/<\/svg>$/i, '</g>');

  /* ---- Encabezado compacto: nombre (izq) + bandera (der) arriba;
     club/rol debajo; competición/temporada en una tercera línea más chica
     y en color secundario. Todo responsive vía medición real de texto. ---- */
  const flagH = 28, flagW = flagDataUri ? flagH * flagAspect : 0;
  const flagGap = flagDataUri ? 14 : 0;
  const nameMaxW = W - MARGIN * 2 - flagW - flagGap;
  const nameFamily = "'Space Grotesk', sans-serif";
  const nameSize = titleText ? fitFontSize(titleText, nameMaxW, nameFamily, 700, 26, 16) : 26;

  const clubMaxW = W - MARGIN * 2;
  const clubFamily = "'Inter', sans-serif";
  const clubSize = clubRoleLine ? fitFontSize(clubRoleLine, clubMaxW, clubFamily, 700, 16, 11) : 16;
  const compSize = percentileLine ? fitFontSize(percentileLine, clubMaxW, clubFamily, 500, 12, 9.5) : 12;

  let headerMarkup = '';
  if(titleText){
    headerMarkup += `<text x="${MARGIN}" y="34" text-anchor="start" font-family="${nameFamily}" font-weight="700" font-size="${nameSize}" fill="#C9A353">${escapeXml(titleText)}</text>`;
  }
  if(flagDataUri){
    const flagY = 34 - flagH * 0.78;
    headerMarkup += `<image href="${flagDataUri}" x="${W - MARGIN - flagW}" y="${flagY}" width="${flagW}" height="${flagH}" preserveAspectRatio="xMidYMid slice" rx="3"/>`;
  }
  if(clubRoleLine){
    headerMarkup += `<text x="${MARGIN}" y="59" text-anchor="start" font-family="${clubFamily}" font-weight="700" font-size="${clubSize}" fill="#D7DCE6">${escapeXml(clubRoleLine)}</text>`;
  }
  if(percentileLine){
    headerMarkup += `<text x="${MARGIN}" y="79" text-anchor="start" font-family="${clubFamily}" font-weight="500" font-size="${compSize}" fill="#6B7280">${escapeXml(percentileLine)}</text>`;
  }
  headerMarkup += `<path d="M ${MARGIN} 94 H ${W - MARGIN}" stroke="#C9A353" stroke-opacity="0.55" stroke-width="1"/>`;

  /* ---- Pie de página: igual que en la web — Generado + nota a la
     izquierda, leyenda de colores en una fila a la derecha. Sin ningún
     texto de interacción ("tocá...", "click en...") porque el PNG se ve
     fuera de la app. ---- */
  const footerY0 = HEADER_H + WHEEL_H;
  let footerMarkup = `
    <text x="${MARGIN}" y="${footerY0 + 27}" text-anchor="start" fill="#8B8F9C" font-family="Inter, sans-serif" font-weight="600" font-size="12">${escapeXml(genDate)}</text>
    <text x="${MARGIN}" y="${footerY0 + 47}" text-anchor="start" fill="#565B68" font-family="Inter, sans-serif" font-weight="400" font-size="11">Sector más ancho = métrica principal del perfil</text>
  `;
  const legendItems = [
    { color: BUCKET.elite, label:'Elite · top 10%' },
    { color: BUCKET.above, label:'Por encima del promedio · 65-89' },
    { color: BUCKET.avg, label:'Promedio · 34-64' },
    { color: BUCKET.below, label:'Por debajo del promedio · bottom 33%' },
  ];
  const legendFont = "600 10.5px 'Inter', sans-serif";
  const swatch = 8, swatchGap = 6, itemGap = 22;
  // Fila única no entra (el texto más largo hace que el bloque supere los
  // ~690px disponibles y pise el texto de la izquierda), así que va en
  // grilla 2x2 — más compacta y más legible, como en un informe real.
  const legendRows = [[legendItems[0], legendItems[1]], [legendItems[2], legendItems[3]]];
  const rowWidths = legendRows.map(row =>
    row.reduce((sum, it) => sum + swatch + swatchGap + textWidth(it.label, legendFont), 0) + itemGap * (row.length - 1)
  );
  const legendBlockW = Math.max(...rowWidths);
  const legendStartX = (W - MARGIN) - legendBlockW;
  const legendRowYs = [footerY0 + 30, footerY0 + 48];
  legendRows.forEach((row, ri) => {
    let x = legendStartX;
    const y = legendRowYs[ri];
    row.forEach(it => {
      footerMarkup += `<rect x="${x}" y="${y - swatch + 2}" width="${swatch}" height="${swatch}" rx="2" fill="${it.color}"/>`;
      footerMarkup += `<text x="${x + swatch + swatchGap}" y="${y + 3}" text-anchor="start" font-family="Inter, sans-serif" font-weight="600" font-size="10.5" fill="#9AA3B5">${escapeXml(it.label)}</text>`;
      x += swatch + swatchGap + textWidth(it.label, legendFont) + itemGap;
    });
  });

  const wrapper = `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <rect x="0" y="0" width="${W}" height="${H}" fill="#0A0E17"/>
      ${headerMarkup}

      ${wheelGroup}

      ${footerMarkup}
    </svg>
  `;

  const svgBlob = new Blob([wrapper], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0A0E17';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, W, H);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(state.meta.displayName||'rueda').replace(/\s+/g,'_')}_percentiles.png`;
      a.click();
    });
  };
  img.onerror = () => alert('No se pudo exportar el PNG. Probá con "Guardar configuración" y generá el gráfico de nuevo.');
  img.src = url;
}
/* ---- Guardar / cargar configuración (categorías, métricas, filtros, meta) ---- */
function exportConfig(){
  const cfg = {
    playerCol: state.playerCol, teamCol: state.teamCol, posCol: state.posCol, minutesCol: state.minutesCol, ageCol: state.ageCol, footCol: state.footCol,
    filters: state.filters, categories: state.categories, meta: state.meta, presetUI:state.presetUI, profile:state.profile
  };
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'config_rueda.json';
  a.click();
}
function importConfig(file){
  const reader = new FileReader();
  reader.onload = (e) => {
    try{
      const cfg = JSON.parse(e.target.result);
      // validación mínima
      if(cfg && typeof cfg === 'object'){
        Object.assign(state, {
          playerCol: cfg.playerCol, teamCol: cfg.teamCol, posCol: cfg.posCol, minutesCol: cfg.minutesCol, ageCol: cfg.ageCol || state.ageCol, footCol:cfg.footCol || state.footCol,
          filters: cfg.filters || [], categories: cfg.categories || [], meta: cfg.meta || state.meta,
          presetUI: cfg.presetUI || state.presetUI, profile: cfg.profile || state.profile
        });
        refreshAll();
        alert('Configuración cargada. Elegí el jugador y generá el gráfico.');
        return;
      }
      throw new Error('Formato inválido');
    }catch(err){ alert('El archivo de configuración no es válido.'); }
  };
  reader.readAsText(file);
}

/* ---- boot ---- */
function refreshAll(){
  renderSidebar();
  refreshCount();
  renderMain();
}

document.addEventListener('DOMContentLoaded', refreshAll);

// Se exporta para que compare.js (pestaña de comparación) pueda reusar
// estas piezas en vez de reimplementarlas.
export {
  state, el, opt, sortedRowsForPicker, playerLabel, titleForRow, resolveCountryName,
  groupRows, comparisonContextLabel, numVal, computePercentile, fmtVal, renderWheelSVG, renderMain, ordinal, bucketColor,
  applyPreset, shortlistKey, loadShortlist, isShortlisted, getShortlistItem, upsertShortlist, updateShortlistItem, removeShortlistItem,
  selectPlayerForWheel,
};
