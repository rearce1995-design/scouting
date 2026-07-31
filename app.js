import { PRESETS, A, PHYS, M, C, withDiscipline, disciplineCat } from './presets.js';

/* =========================================================================
   RUEDA DE PERCENTILES — constructor de gráficos tipo "percentile wheel"
   Optimizado: worker para parseo, detección de columnas en una pasada,
   buildMetricLayout O(n), debounce, fix ordinal y mejoras de render.
   ========================================================================= */

const PALETTE = ['#5B85D6','#4C9A6E','#C79A52','#BC5049','#8A72C2','#3F9AA8','#B96E8C','#7C9C4A'];
const BUCKET = { elite:'#5B85D6', above:'#4C9A6E', avg:'#C79A52', below:'#BC5049' };

/* Mapeo país (nombre, como suele venir en el export de Wyscout, en inglés,
   más variantes en español por si el usuario editó la columna a mano) -> ISO 3166-1 alpha-2.
   Se usa para armar la URL de la bandera en flagcdn.com, un CDN público y
   gratuito, así no hace falta subir ni mantener ninguna imagen. */
const COUNTRY_ISO2 = {
  argentina:'ar', bolivia:'bo', brazil:'br', brasil:'br', chile:'cl', colombia:'co',
  ecuador:'ec', paraguay:'py', peru:'pe', 'perú':'pe', uruguay:'uy', venezuela:'ve',
  mexico:'mx', 'méxico':'mx', usa:'us', 'united states':'us', 'estados unidos':'us',
  canada:'ca', 'canadá':'ca', 'costa rica':'cr', panama:'pa', 'panamá':'pa',
  honduras:'hn', guatemala:'gt', 'el salvador':'sv', nicaragua:'ni', cuba:'cu',
  'dominican republic':'do', 'república dominicana':'do', jamaica:'jm', haiti:'ht', 'haití':'ht',
  spain:'es', 'españa':'es', portugal:'pt', france:'fr', francia:'fr',
  germany:'de', alemania:'de', italy:'it', italia:'it', england:'gb-eng',
  scotland:'gb-sct', wales:'gb-wls', 'northern ireland':'gb-nir',
  'united kingdom':'gb', ireland:'ie', 'republic of ireland':'ie', netherlands:'nl',
  holanda:'nl', belgium:'be', 'bélgica':'be', switzerland:'ch', suiza:'ch',
  austria:'at', denmark:'dk', dinamarca:'dk', sweden:'se', suecia:'se',
  norway:'no', noruega:'no', finland:'fi', finlandia:'fi', iceland:'is', islandia:'is',
  poland:'pl', polonia:'pl', 'czech republic':'cz', czechia:'cz', 'república checa':'cz',
  slovakia:'sk', eslovaquia:'sk', hungary:'hu', hungría:'hu', romania:'ro', rumania:'ro',
  bulgaria:'bg', greece:'gr', grecia:'gr', turkey:'tr', 'turquía':'tr',
  ukraine:'ua', ucrania:'ua', russia:'ru', rusia:'ru', belarus:'by', bielorrusia:'by',
  croatia:'hr', croacia:'hr', serbia:'rs', slovenia:'si', eslovenia:'si',
  'bosnia and herzegovina':'ba', 'bosnia y herzegovina':'ba', montenegro:'me',
  'north macedonia':'mk', 'macedonia del norte':'mk', albania:'al', kosovo:'xk',
  moldova:'md', moldavia:'md', lithuania:'lt', lituania:'lt', latvia:'lv', letonia:'lv',
  estonia:'ee', georgia:'ge', armenia:'am', azerbaijan:'az', azerbaiyán:'az',
  cyprus:'cy', chipre:'cy', malta:'mt', luxembourg:'lu', luxemburgo:'lu',
  japan:'jp', 'japón':'jp', 'south korea':'kr', 'korea republic':'kr', 'corea del sur':'kr',
  china:'cn', 'china pr':'cn', australia:'au', 'new zealand':'nz', 'nueva zelanda':'nz',
  india:'in', 'saudi arabia':'sa', 'arabia saudita':'sa', qatar:'qa', uae:'ae',
  'united arab emirates':'ae', iran:'ir', irán:'ir', iraq:'iq', irak:'iq',
  israel:'il', jordan:'jo', jordania:'jo', lebanon:'lb', líbano:'lb',
  syria:'sy', siria:'sy', kuwait:'kw', bahrain:'bh', baréin:'bh', oman:'om', omán:'om',
  thailand:'th', tailandia:'th', vietnam:'vn', indonesia:'id', malaysia:'my', malasia:'my',
  philippines:'ph', filipinas:'ph', 'hong kong':'hk', taiwan:'tw', 'taiwán':'tw',
  uzbekistan:'uz', kazakhstan:'kz', kazajistán:'kz',
  nigeria:'ng', ghana:'gh', 'ivory coast':'ci', "côte d'ivoire":'ci', 'costa de marfil':'ci',
  senegal:'sn', 'senegal':'sn', mali:'ml', malí:'ml', 'burkina faso':'bf',
  cameroon:'cm', 'camerún':'cm', 'dr congo':'cd', congo:'cg', 'congo dr':'cd',
  'south africa':'za', 'sudáfrica':'za', egypt:'eg', egipto:'eg', morocco:'ma', marruecos:'ma',
  algeria:'dz', argelia:'dz', tunisia:'tn', 'túnez':'tn', libya:'ly', libia:'ly',
  kenya:'ke', kenia:'ke', ethiopia:'et', etiopía:'et', tanzania:'tz', uganda:'ug',
  zambia:'zm', zimbabwe:'zw', angola:'ao', mozambique:'mz', guinea:'gn',
  'guinea-bissau':'gw', gambia:'gm', benin:'bj', togo:'tg', niger:'ne', 'níger':'ne',
  chad:'td', 'chad':'td', sudan:'sd', sudán:'sd', gabon:'ga', 'gabón':'ga',
  namibia:'na', botswana:'bw', 'cabo verde':'cv', 'cape verde':'cv',
  'equatorial guinea':'gq', 'guinea ecuatorial':'gq', 'sierra leone':'sl', 'sierra leona':'sl',
  liberia:'lr', rwanda:'rw', ruanda:'rw', burundi:'bi', comoros:'km', comoras:'km',
  madagascar:'mg', mauritania:'mr', mauritius:'mu', mauricio:'mu',
};
function normalizeCountryName(raw){
  return String(raw || '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // saca acentos para matchear
}
function countryToISO2(raw){
  const n = normalizeCountryName(raw);
  if(!n) return null;
  if(COUNTRY_ISO2[n]) return COUNTRY_ISO2[n];
  // fallback: probamos también contra las claves sin acentos (por si el
  // export trae la versión con tilde y el diccionario la versión sin ella)
  for(const key in COUNTRY_ISO2){
    if(normalizeCountryName(key) === n) return COUNTRY_ISO2[key];
  }
  return null;
}
function flagCdnUrl(iso2, widthPx){
  return `https://flagcdn.com/w${widthPx}/${iso2}.png`;
}
/* País a mostrar: prioriza la columna de nacionalidad detectada en el
   Excel (Birth country / Passport country); si no hay o no matchea a un
   país conocido, cae al campo manual "Bandera/país" del paso 4. */
function resolveCountryName(){
  if(state.selectedRow && state.nationCol){
    const v = String(state.selectedRow[state.nationCol] || '').trim();
    if(v) return v;
  }
  return String(state.meta.flag || '').trim();
}

const state = {
  headers: [],
  rows: [],
  numericCols: [],
  playerCol: null,
  teamCol: null,
  posCol: null,
  minutesCol: null,
  ageCol: null,
  nationCol: null,
  filters: [],
  categories: [],
  selectedRow: null,
  meta: {
    displayName: '', groupLabel: 'vs. jugadores del grupo', competition: '',
    club: '', season: '', flag: '', centerLabel: '', bio1: '', bio2: '', age: ''
  },
  presetUI: { position: '', role: '', includePhysical: false },
  activeRanking: null // { catName, label, col, invert }
};

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
  const findCol = (candidates) => state.headers.find(h => candidates.some(c => h.toLowerCase().trim() === c)) ||
                                   state.headers.find(h => candidates.some(c => h.toLowerCase().includes(c)));
  state.playerCol = findCol(['player','jugador','name','nombre']) || state.playerCol;
  state.teamCol = findCol(['team','equipo','club']) || state.teamCol;
  state.posCol = findCol(['position','posición','posicion','pos']) || state.posCol;
  state.minutesCol = findCol(['minutes played','minutos','minutes','mins']) || state.minutesCol;
  state.ageCol = findCol(['age','edad']) || state.ageCol;
  state.nationCol = findCol(['birth country', 'nationality', 'nacionalidad', 'país de nacimiento', 'passport country']) || state.nationCol;
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
    if(metrics.length) newCats.push({ id: uid('c'), name: catDef.name, color: PALETTE[idx % PALETTE.length], colorIdx: idx % PALETTE.length, metrics });
  });
  if(!newCats.length){
    alert('Ninguna columna de tu tabla coincide con los nombres típicos de este preset. Probá armar las métricas manualmente en el paso 3.');
    return;
  }
  state.categories = newCats;
  renderSidebar();
  renderMain();
  if(missing){
    setTimeout(() => alert(`Preset aplicado. ${missing} métrica(s) del preset no se encontraron en tu tabla y quedaron afuera — podés agregarlas a mano si tu columna tiene otro nombre.`), 50);
  }
}

/* ---- ventana modal para elegir métricas (checklist clickeable) ---- */
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
  const grid = el('div', {class:'modal-grid'});

  function renderGrid(filter){
    grid.innerHTML = '';
    const f = (filter||'').toLowerCase();
    const cols = state.numericCols.filter(h => h.toLowerCase().includes(f));
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

function renderWheelSVG(){
  const group = groupRows();
  const player = state.selectedRow;
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
    const color = bucketColor(pct);
    const outerR = pct === null ? R_HOLE : R_HOLE + (pct/100) * (R_MAX - R_HOLE);

    const wedgeGroup = svgEl('g', { class:'metric-wedge' });
    wedgeGroup.addEventListener('click', () => openRankingPanel(cat, m));

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
  // fragment rendering
  const frag = document.createDocumentFragment();

  if(!state.rows.length){
    const empty = el('div', {id:'empty-state'}, []);
    empty.innerHTML = '<b>Empezá por el paso 1</b><br>Cargá una tabla exportada de Wyscout (.xlsx o .csv) para empezar a armar tu gráfico.';
    frag.appendChild(empty);
    main.innerHTML = '';
    main.appendChild(frag);
    return;
  }
  if(!state.selectedRow || !state.categories.some(c=>c.metrics.some(m=>m.col))){
    const empty = el('div', {id:'empty-state'}, []);
    empty.innerHTML = '<b>Casi listo</b><br>Elegí un jugador (paso 4) y al menos una métrica (paso 3), después tocá <b>Generar gráfico</b>.';
    frag.appendChild(empty);
    main.innerHTML = '';
    main.appendChild(frag);
    return;
  }

  const card = el('div', {id:'wheel-wrap'});

  // header — misma estructura que el PNG exportado: nombre + bandera arriba,
  // club · posición (rol) debajo, y la competencia/temporada como tercera
  // línea secundaria más chica.
  const headerRow = el('div', {style:'display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:2px 4px 10px;'});
  const club = state.meta.club || '';
  const pos = state.presetUI.position || '';
  const role = state.presetUI.role || '';
  const clubRoleLine = [club, (pos && role ? `${pos} (${role})` : (pos || role))].filter(Boolean).join(' · ');
  const compSeason = [state.meta.competition || '', state.meta.season || ''].filter(Boolean).join(' ');
  const groupSuffix = (state.meta.groupLabel || '').trim();
  const percentileLine = ['Percentiles' + (groupSuffix ? ` ${groupSuffix}` : ''), compSeason].filter(Boolean).join(' | ');
  const titleBlock = el('div', {style:'min-width:0;'}, [
    el('h2', {text: formatPlayerTitle(), style:'margin:0;font-family:var(--font-display);font-size:24px;font-weight:700;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--gold);'}),
    clubRoleLine ? el('div', {text: clubRoleLine, style:'color:var(--ink);font-size:13.5px;margin-top:5px;font-weight:600;'}) : null,
    percentileLine ? el('div', {text: percentileLine, style:'color:var(--ink-faint);font-size:11px;margin-top:2px;font-weight:500;'}) : null,
  ]);
  const countryName = resolveCountryName();
  const iso2 = countryToISO2(countryName);
  const flagBlock = iso2
    ? el('img', { src: flagCdnUrl(iso2, 48), alt: countryName, title: countryName, loading:'eager', referrerpolicy:'no-referrer',
        style:'height:24px;width:auto;border-radius:3px;box-shadow:0 0 0 1px rgba(255,255,255,.08);flex-shrink:0;margin-top:4px;',
        onerror:(e)=>{ e.target.replaceWith(el('div', {text: countryName || '', style:'font-size:12px;color:var(--ink-faint);'})); } })
    : (countryName ? el('div', {text: countryName, style:'font-size:12px;color:var(--ink-faint);margin-top:4px;flex-shrink:0;'}) : el('div', {}));
  headerRow.appendChild(titleBlock);
  headerRow.appendChild(flagBlock);
  card.appendChild(headerRow);
  card.appendChild(el('div', {style:'height:1px;background:linear-gradient(90deg, var(--gold), transparent);margin:0 4px 8px;'}));

  // svg — sin contenido en el círculo central (igual que el PNG), tamaño
  // reducido para que toda la tarjeta entre en una pantalla sin scroll.
  const svgWrap = el('div', {style:'width:100%;aspect-ratio:1/1;max-width:900px;margin:0 auto;'});
  const svg = renderWheelSVG();
  svg.setAttribute('id','wheel-svg');
  svgWrap.appendChild(svg);
  card.appendChild(svgWrap);

  // footer — mismas dos líneas a la izquierda y leyenda en grilla 2x2 a la
  // derecha que en el PNG, sin textos de interacción ("tocá...") para que
  // web y export se vean idénticos.
  const footer = el('div', {style:'padding:10px 4px 2px;border-top:1px solid var(--border);margin-top:4px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;'});
  const footerLeft = el('div', {}, [
    el('div', {text: `Generado ${new Date().toLocaleDateString('es-AR')}`, style:'color:var(--ink-dim);font-size:11px;font-weight:600;'}),
    el('div', {text: 'Sector más ancho = métrica principal del perfil', style:'color:var(--ink-faint);font-size:10px;margin-top:4px;'}),
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
  if(!info) return { rows: [], info };
  const group = groupRows();
  const rows = group
    .map(r => ({ ref:r, name: state.playerCol ? String(r[state.playerCol] ?? '') : '?', team: state.teamCol ? String(r[state.teamCol] ?? '') : '', val: numVal(r, info.col) }))
    .filter(r => r.val !== null)
    .sort((a,b) => info.invert ? a.val - b.val : b.val - a.val);
  return { rows, info };
}

function renderRankingPanel(){
  const { rows, info } = computeRanking();
  const panel = el('div', {id:'ranking-panel'});
  panel.appendChild(el('div', {class:'rank-head'}, [
    el('div', {}, [
      el('h3', {text: info.label}),
    ]),
    el('button', {class:'btn-icon', html:'&times;', onclick:()=>{ state.activeRanking = null; renderMain(); }})
  ]));
  panel.appendChild(el('div', {class:'rank-sub', text: `${info.catName} · ranking dentro del grupo (${rows.length} jugadores)${info.invert ? ' · menor es mejor' : ''}`}));

  const list = el('div', {class:'rank-list'});
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

  // hace scroll automático hasta la fila del jugador actual
  setTimeout(() => {
    const meRow = panel.querySelector('.rank-row.me');
    if(meRow) meRow.scrollIntoView({ block:'center' });
  }, 0);

  return panel;
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
  const iso2 = countryToISO2(countryName);
  let flagDataUri = null, flagAspect = 4 / 3;
  if(iso2){
    try{
      const resp = await fetch(flagCdnUrl(iso2, 80));
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
  const flagH = 24, flagW = flagDataUri ? flagH * flagAspect : 0;
  const flagGap = flagDataUri ? 14 : 0;
  const nameMaxW = W - MARGIN * 2 - flagW - flagGap;
  const nameFamily = "'Space Grotesk', sans-serif";
  const nameSize = titleText ? fitFontSize(titleText, nameMaxW, nameFamily, 700, 26, 16) : 26;

  const clubMaxW = W - MARGIN * 2;
  const clubFamily = "'Inter', sans-serif";
  const clubSize = clubRoleLine ? fitFontSize(clubRoleLine, clubMaxW, clubFamily, 600, 15, 11) : 15;
  const compSize = percentileLine ? fitFontSize(percentileLine, clubMaxW, clubFamily, 500, 12, 9.5) : 12;

  let headerMarkup = '';
  if(titleText){
    headerMarkup += `<text x="${MARGIN}" y="34" text-anchor="start" font-family="${nameFamily}" font-weight="700" font-size="${nameSize}" fill="#C9A353">${escapeXml(titleText)}</text>`;
  }
  if(flagDataUri){
    const flagY = 34 - flagH * 0.78;
    headerMarkup += `<image href="${flagDataUri}" x="${W - MARGIN - flagW}" y="${flagY}" width="${flagW}" height="${flagH}" preserveAspectRatio="xMidYMid slice" rx="2"/>`;
  }
  if(clubRoleLine){
    headerMarkup += `<text x="${MARGIN}" y="58" text-anchor="start" font-family="${clubFamily}" font-weight="600" font-size="${clubSize}" fill="#AEB6C8">${escapeXml(clubRoleLine)}</text>`;
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
    playerCol: state.playerCol, teamCol: state.teamCol, posCol: state.posCol, minutesCol: state.minutesCol, ageCol: state.ageCol,
    filters: state.filters, categories: state.categories, meta: state.meta
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
          playerCol: cfg.playerCol, teamCol: cfg.teamCol, posCol: cfg.posCol, minutesCol: cfg.minutesCol, ageCol: cfg.ageCol || state.ageCol,
          filters: cfg.filters || [], categories: cfg.categories || [], meta: cfg.meta || state.meta
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
