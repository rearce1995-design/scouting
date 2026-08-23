/* =========================================================================
   profile.js — pestaña "Perfil objetivo": el usuario pondera cuánto le
   importa cada categoría (Salida de balón, Progresión, Duelos defensivos,
   etc.) y la app rankea a TODOS los jugadores del grupo de comparación por
   % de adecuación a ese perfil, con el desglose de por qué.

   Cálculo deliberadamente simple y transparente (nada de ML ni scoring
   raro): para cada categoría, promedio de percentiles de sus métricas;
   el score final es el promedio ponderado de esos promedios, usando los
   pesos que el usuario asigna. Si a un jugador le falta el dato de una
   categoría entera, esa categoría se ignora para él y se renormalizan los
   pesos restantes — no lo penalizamos por un dato faltante, pero queda
   marcado como "sin datos" en el desglose para que no pase desapercibido.

   Aislado en su propio módulo por el mismo motivo que compare.js: que
   app.js no sea un archivo gigante que termine siendo difícil de tocar.
   ========================================================================= */

import {
  state, el, groupRows, numVal, computePercentile, fmtVal, playerLabel,
  renderMain, bucketColor, applyPreset, comparisonContextLabel, isShortlisted,
  getShortlistItem, upsertShortlist, updateShortlistItem, removeShortlistItem, selectPlayerForWheel,
} from './app.js';
import { PRESETS } from './presets.js';

/* ---- Escala de etiquetas del Fit (100% objetivo, deriva directo del
   score ya calculado — no hay nada nuevo que inventar acá). ---- */
function fitLabel(score){
  if(score >= 85) return { emoji:'🟢', text:'Ajuste excelente' };
  if(score >= 75) return { emoji:'🟢', text:'Buen ajuste' };
  if(score >= 65) return { emoji:'🟡', text:'Ajuste interesante' };
  if(score >= 50) return { emoji:'🟠', text:'Ajuste débil' };
  return { emoji:'🔴', text:'Bajo ajuste' };
}

/* ---- Calidad de datos: independiente del Fit. Mide la evidencia
   disponible; la muestra del jugador se calcula aparte con sus minutos.
   NO homogeneidad del perfil del jugador — un perfil especializado
   (ej. 95 en defensa, 90 en duelos, 88 en recuperación, 25 en
   construcción) no es un dato "poco confiable", es un perfil
   especializado, y puede ser exactamente lo que se busca. Por eso NO hay
   ningún factor de "consistencia entre categorías" acá — se sacó por
   completo. Los factores reales que sí se usan son cobertura de datos,
   tamaño del universo comparado y dato crítico faltante.
   "Contexto de comparación" (D) se calcula pero es solo informativo, no
   afecta la etiqueta alta/media/baja (ver nota más abajo). ---- */
function computeDataQuality(breakdown, groupSize, hasContextFilter){
  // A. cobertura: de todas las métricas elegidas, ¿cuántas tiene el jugador?
  const totalMetrics = breakdown.reduce((a, b) => a + b.nTotal, 0);
  const okMetrics = breakdown.reduce((a, b) => a + b.nOk, 0);
  const coveragePct = totalMetrics > 0 ? (okMetrics / totalMetrics) * 100 : 0;

  // B. dato crítico faltante: alguna categoría de peso alto (>=70) sin
  // ningún dato para este jugador — bandera roja fuerte.
  const missingCritical = breakdown.some(b => b.weight >= 70 && b.avgPct === null);

  // Reglas explícitas y categóricas — nada de score numérico ponderado
  // por dentro. NOTA: sacamos por completo el factor "consistencia entre
  // categorías" que tenía la versión anterior — penalizaba perfiles
  // especializados (ej. un central excelente en duelos pero limitado con
  // pelota), que en scouting suelen ser justamente los más interesantes,
  // no un problema de confiabilidad del dato.
  let key;
  if(missingCritical || coveragePct < 60){
    key = 'baja';
  }else if(coveragePct >= 85 && groupSize >= 30){
    key = 'alta';
  }else{
    key = 'media';
  }
  const labels = {
    alta: { emoji:'🟢', text:'Alta' },
    media:{ emoji:'🟡', text:'Media' },
    baja: { emoji:'🔴', text:'Baja' },
  };

  // "Calidad del contexto": si el grupo de comparación no tiene ningún
  // filtro aplicado (se está comparando contra TODA la tabla cargada, que
  // puede mezclar posiciones/competencias muy distintas), lo marcamos como
  // nota informativa — no lo usamos para bajar la etiqueta alta/media/baja
  // automáticamente porque comparar contra un grupo amplio a veces es una
  // decisión válida del scout, no necesariamente un problema.
  return {
    label: { key, ...labels[key] },
    coveragePct: Math.round(coveragePct),
    groupSize,
    missingCritical,
    hasContextFilter,
  };
}

/* La muestra del jugador es distinta de la calidad de datos: usa sus
   minutos reales, no el tamaño del universo comparado. */
function computePlayerSample(row){
  const minutes = state.minutesCol ? numVal(row, state.minutesCol) : null;
  if(minutes === null) return { key:'sin_dato', text:'Sin dato de minutos', minutes:null, color:'var(--ink-faint)' };
  if(minutes >= 1800) return { key:'amplia', text:'amplia', minutes, color:'var(--green)' };
  if(minutes >= 900) return { key:'suficiente', text:'suficiente', minutes, color:'var(--blue)' };
  if(minutes >= 450) return { key:'reducida', text:'reducida', minutes, color:'var(--amber)' };
  return { key:'muy_reducida', text:'muy reducida', minutes, color:'var(--red)' };
}

/* ---- Prioridad de scouting: combina Fit + Confianza con reglas
   explícitas (no un score numérico oculto). No uso la posición en el
   ranking como factor aparte porque ya está implícita en el Fit (usarla
   dos veces sería contar la misma información doble). El caso especial
   "revisar antes de priorizar" es justamente para el escenario que
   describiste: fit alto pero confianza baja no debería leerse como
   prioridad alta automática. ---- */
function computePriority(fitScore, confidenceKey, sampleKey){
  if(fitScore >= 75 && (confidenceKey === 'baja' || sampleKey === 'muy_reducida')) return { key:'revisar', emoji:'🟡', text:'Revisar antes de priorizar' };
  if(fitScore >= 75) return { key:'alta', emoji:'🟢', text:'Prioridad alta' };
  if(fitScore >= 65) return confidenceKey === 'alta'
    ? { key:'alta', emoji:'🟢', text:'Prioridad alta' }
    : { key:'media', emoji:'🟡', text:'Prioridad media' };
  if(fitScore >= 50) return { key:'media', emoji:'🟡', text:'Prioridad media' };
  return { key:'baja', emoji:'🔴', text:'Prioridad baja' };
}

/* ---- "Qué validar en video": contenido editorial, no calculado. Es un
   punto de partida razonable por posición basado en conocimiento futbolístico
   general — no algo derivado de las estadísticas (por definición, son
   justamente las cosas que las estadísticas NO capturan). Cámbialo cuando
   quieras, está pensado para ser fácil de editar acá mismo. ---- */
const VIDEO_CHECKLIST_BY_POSITION = {
  'Portero': ['Juego con los pies bajo presión', 'Comunicación y liderazgo de la defensa', 'Lectura de centros y anticipación'],
  'Central': ['Toma de decisiones bajo presión', 'Comunicación con la línea defensiva', 'Cobertura de espacios en transición'],
  'Lateral': ['Timing de las subidas', 'Recuperación defensiva tras pérdida', 'Uno contra uno defensivo'],
  'Mediocentro Defensivo': ['Posicionamiento sin balón', 'Lectura de líneas de pase rivales', 'Presión coordinada con el equipo'],
  'Interior': ['Llegada al área sin balón', 'Conexión entre líneas', 'Toma de decisiones en el último tercio'],
  'Mediapunta': ['Visión de juego y timing del último pase', 'Movilidad entre líneas', 'Asociación en espacios reducidos'],
  'Extremo': ['Uno contra uno en espacios reducidos', 'Decisión de centrar vs. definir', 'Repliegue defensivo'],
  'Delantero': ['Movimientos sin balón', 'Juego de espaldas / asociación', 'Finalización bajo presión'],
};
const VIDEO_CHECKLIST_DEFAULT = ['Comportamiento sin balón', 'Toma de decisiones bajo presión', 'Comunicación con compañeros'];
const SAMPLE_TOOLTIP = 'Clasificación orientativa; la estabilidad varía según la frecuencia de la métrica.';
function videoChecklist(){
  return VIDEO_CHECKLIST_BY_POSITION[state.presetUI.position] || VIDEO_CHECKLIST_DEFAULT;
}

function showScoutFeedback(message){
  document.getElementById('scout-save-feedback')?.remove();
  const toast = el('div', {id:'scout-save-feedback', text:message, role:'status', style:'position:fixed;right:22px;bottom:22px;z-index:200;padding:10px 13px;border-radius:8px;background:#163324;border:1px solid var(--green);color:#D8F5E4;font-size:12px;font-weight:700;box-shadow:0 10px 28px rgba(0,0,0,.35);'});
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

/* Categorías candidatas para el perfil: las que ya tienen métricas
   elegidas en el paso 3 (reusa exactamente lo que arma el preset o lo
   que el usuario armó a mano — no inventa una estructura nueva). */
function profileCategories(){
  return state.categories.filter(c => c.metrics.some(m => m.col));
}

function getWeight(catName){
  return state.profile.weights[catName] ?? 0;
}

/* Firma del conjunto de categorías actual (nombres en orden) — se usa
   para saber si hay que recalcular los pesos por default o si el usuario
   ya los tiene seteados (a mano o por un preset anterior) y no hay que
   pisarlos. */
function categorySignature(categories){
  return categories.map(c => c.name).join('|');
}

/* Pesos iniciales: los presets traen una hipótesis explícita por rol.
   Para una selección manual, se reparte en partes iguales en vez de
   inventar una prioridad por el orden de las categorías. */
function ensureDefaultWeights(categories){
  const sig = categorySignature(categories);
  if(state.profile.lastCategorySignature === sig) return; // ya están seteados, no los tocamos
  const explicit = categories.every(c => typeof c.baseWeight === 'number');
  const equal = Math.floor(100 / categories.length);
  const baseTotal = explicit ? categories.reduce((sum, c) => sum + Math.max(0, c.baseWeight), 0) : 0;
  let assigned = 0;
  categories.forEach((c, i) => {
    let weight;
    if(baseTotal > 0){
      weight = i === categories.length - 1 ? 100 - assigned : Math.round((c.baseWeight / baseTotal) * 100);
      assigned += weight;
    }else{
      weight = i === categories.length - 1 ? 100 - equal * i : equal;
    }
    state.profile.weights[c.name] = weight;
  });
  state.profile.lastCategorySignature = sig;
}

/* Promedio de percentiles de las métricas de una categoría, para un
   jugador puntual — null si no tiene ningún dato utilizable en esa
   categoría. También devuelve cuántas métricas de esa categoría tenían
   dato disponible (nOk) sobre el total (nTotal), para el factor de
   cobertura de la Confianza. */
function computeCategoryStats(row, cat, group){
  const metrics = cat.metrics.filter(m => m.col);
  let sum = 0, nOk = 0;
  metrics.forEach(m => {
    const val = numVal(row, m.col);
    if(val === null) return;
    const { pct } = computePercentile(group, m.col, val, m.invert);
    if(pct === null) return;
    sum += pct; nOk++;
  });
  return { avgPct: nOk > 0 ? sum / nOk : null, nOk, nTotal: metrics.length };
}

/* Score de adecuación de un jugador: promedio ponderado de los promedios
   de categoría. Categorías sin datos para ese jugador se excluyen del
   promedio (no se cuentan como 0) y los pesos restantes se renormalizan
   solos (división por weightTotal, no por la suma original de pesos). */
function computeFitScore(row, categories, group){
  let weightedSum = 0, weightTotal = 0;
  const breakdown = [];
  categories.forEach(cat => {
    const { avgPct, nOk, nTotal } = computeCategoryStats(row, cat, group);
    const w = getWeight(cat.name);
    breakdown.push({ name: cat.name, avgPct, weight: w, nOk, nTotal });
    if(avgPct !== null && w > 0){
      weightedSum += avgPct * w;
      weightTotal += w;
    }
  });
  breakdown.forEach(b => {
    b.contribution = b.avgPct !== null && weightTotal > 0 ? ((b.avgPct - 50) * b.weight / weightTotal) : null;
  });
  const score = weightTotal > 0 ? weightedSum / weightTotal : null;
  return { score, breakdown };
}

/* ========================================================================
   BIBLIOTECA DE PERFILES GUARDADOS — distinto del "Guardar configuración"
   que ya existe (ese es un archivo .json para descargar/compartir). Esto
   es una lista con nombre, persistida en localStorage del navegador, para
   volver a aplicar un perfil objetivo completo (categorías + pesos +
   filtros de grupo + contexto del preset) con un clic. Vive solo en este
   navegador — no se sincroniza entre dispositivos, eso requeriría un
   backend que esta app no tiene.
   ======================================================================== */
const PROFILE_LIBRARY_KEY = 'ruedaPercentiles_perfilesGuardados_v1';

function loadProfileLibrary(){
  try{
    const raw = localStorage.getItem(PROFILE_LIBRARY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  }catch(e){ return []; }
}
function persistProfileLibrary(list){
  try{
    localStorage.setItem(PROFILE_LIBRARY_KEY, JSON.stringify(list));
    return true;
  }catch(e){
    alert('No se pudo guardar el perfil (¿localStorage lleno o bloqueado por el navegador?).');
    return false;
  }
}
function saveCurrentAsProfile(name){
  const list = loadProfileLibrary();
  list.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    createdAt: new Date().toISOString(),
    config: {
      categories: state.categories,
      weights: state.profile.weights,
      filters: state.filters,
      presetUI: state.presetUI,
    },
  });
  return persistProfileLibrary(list);
}
function deleteSavedProfile(id){
  persistProfileLibrary(loadProfileLibrary().filter(p => p.id !== id));
}
function applySavedProfile(entry){
  const cfg = entry.config || {};
  state.categories = cfg.categories || [];
  state.profile.weights = cfg.weights || {};
  // clave: dejamos marcada la firma de categorías como "ya seteada" para
  // que ensureDefaultWeights() NO pise los pesos que acabamos de cargar
  // con los defaults automáticos.
  state.profile.lastCategorySignature = categorySignature(state.categories.filter(c => c.metrics.some(m => m.col)));
  state.filters = cfg.filters || [];
  state.presetUI = cfg.presetUI || state.presetUI;
  state.profileExpanded = null;
  renderMain();
}

function computeProfileRanking(){
  const categories = profileCategories();
  ensureDefaultWeights(categories);
  const group = groupRows();
  const rows = group
    .map(r => {
      const { score, breakdown } = computeFitScore(r, categories, group);
      const hasContextFilter = state.filters && state.filters.length > 0;
      const dataQuality = score !== null ? computeDataQuality(breakdown, group.length, hasContextFilter) : null;
      const sample = computePlayerSample(r);
      const priority = (score !== null && dataQuality) ? computePriority(score, dataQuality.label.key, sample.key) : null;
      return {
        ref: r,
        name: state.playerCol ? String(r[state.playerCol] ?? '') : '?',
        team: state.teamCol ? String(r[state.teamCol] ?? '') : '',
        age: state.ageCol ? numVal(r, state.ageCol) : null,
        minutes: sample.minutes,
        foot: state.footCol ? String(r[state.footCol] ?? '') : '',
        nationality: state.passportCol ? String(r[state.passportCol] ?? '') : '',
        score, breakdown, dataQuality, sample, priority,
      };
    })
    .filter(r => r.score !== null)
    .sort((a, b) => b.score - a.score);
  return { rows, categories };
}

export function getPlayerInsight(row){
  const categories = profileCategories();
  if(!categories.length) return null;
  ensureDefaultWeights(categories);
  const group = groupRows();
  const { score, breakdown } = computeFitScore(row, categories, group);
  if(score === null) return null;
  const dataQuality = computeDataQuality(breakdown, group.length, state.filters.length > 0);
  const sample = computePlayerSample(row);
  return { score, breakdown, dataQuality, sample, priority:computePriority(score, dataQuality.label.key, sample.key) };
}

function shortlistSnapshot(r){
  return {
    profile: [state.presetUI.position, state.presetUI.role].filter(Boolean).join(' · ') || 'Perfil personalizado',
    fit: r.score, priority:r.priority ? r.priority.text : '', dataQuality:r.dataQuality ? r.dataQuality.label.text : '',
    sample:r.sample ? r.sample.text : '',
  };
}

/* El ranking tiene su propio scroll interno. Al reconstruir la vista (por
   seguir/quitar o abrir una ficha), renderMain conserva el scroll principal,
   pero no el de esta mesa. Lo restauramos para que trabajar jugadores del
   fondo no implique volver arriba cada vez. */
function rerenderRankingKeepingScroll(){
  const previousTop = document.getElementById('profile-ranking-list')?.scrollTop || 0;
  renderMain();
  const restore = () => {
    const refreshed = document.getElementById('profile-ranking-list');
    if(refreshed) refreshed.scrollTop = previousTop;
  };
  if(typeof requestAnimationFrame === 'function') requestAnimationFrame(restore);
  else setTimeout(restore, 0);
}

/* El mismo botón funciona como interruptor: permite deshacer un seguimiento
   por error sin obligar al scout a entrar en otra pestaña ni confirmar nada. */
function toggleShortlist(row, snapshot){
  const existing = getShortlistItem(row);
  if(existing) removeShortlistItem(existing.key);
  else upsertShortlist(row, snapshot);
  rerenderRankingKeepingScroll();
}

export function renderProfileView(){
  const wrap = el('div', {class:'fade-in', style:'width:100%;max-width:1100px;display:flex;flex-direction:column;gap:10px;align-items:center;'});

  const categories = profileCategories();
  if(!categories.length){
    wrap.appendChild(el('div', {class:'helptext', text:'Elegí al menos una categoría con métricas en el paso 3 para poder definir un perfil objetivo.'}));
    return wrap;
  }

  /* ---- Selector de preset de modelo: en vez de armar todo desde cero,
     el scout puede arrancar de un preset de posición/rol ya armado (los
     mismos del paso 3) y después ajustar los sliders a gusto. ---- */
  const presetBox = el('div', {style:'background:var(--panel-2);border:1px solid var(--border);border-radius:14px;padding:14px 20px;width:100%;display:flex;align-items:center;gap:12px;flex-wrap:wrap;'});
  presetBox.appendChild(el('span', {text:'Preset de modelo', style:'font-size:12px;color:var(--ink-dim);font-weight:600;'}));
  const presetSelect = el('select', {style:'min-width:260px;flex:1;'});
  presetSelect.appendChild(el('option', {value:'', text:'Personalizado (dejar como está)'}));
  const realPresets = PRESETS.filter(p => !p.custom);
  realPresets.forEach((p, i) => {
    presetSelect.appendChild(el('option', {value:String(i), text:`${p.position} — ${p.role}`}));
  });
  presetSelect.addEventListener('change', (e) => {
    if(e.target.value === '') return;
    const preset = realPresets[parseInt(e.target.value, 10)];
    state.profileExpanded = null;
    state.profile.lastCategorySignature = null; // fuerza a recalcular defaults para las categorías del nuevo preset
    applyPreset(preset, state.presetUI.includePhysical); // ya re-renderiza todo internamente
  });
  presetBox.appendChild(presetSelect);
  wrap.appendChild(presetBox);

  /* ---- Biblioteca de perfiles guardados ---- */
  const libraryBox = el('div', {style:'background:var(--panel-2);border:1px solid var(--border);border-radius:14px;padding:14px 20px;width:100%;'});
  libraryBox.appendChild(el('div', {text:'Mis perfiles guardados', style:'font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--ink);margin-bottom:8px;'}));

  const savedProfiles = loadProfileLibrary();
  if(savedProfiles.length){
    const listWrap = el('div', {style:'display:flex;flex-direction:column;gap:6px;margin-bottom:12px;'});
    savedProfiles.forEach(p => {
      const dateStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString('es-AR') : '';
      listWrap.appendChild(el('div', {style:'display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 10px;background:#0D1220;border-radius:7px;border:1px solid var(--border);'}, [
        el('div', {style:'min-width:0;'}, [
          el('div', {text:p.name, style:'font-size:12px;color:var(--ink-dim);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'}),
          dateStr ? el('div', {text:`Guardado ${dateStr}`, style:'font-size:9.5px;color:var(--ink-faint);'}) : null,
        ]),
        el('div', {style:'display:flex;gap:6px;flex-shrink:0;'}, [
          el('button', {class:'btn btn-sm', text:'Cargar', onclick:()=>applySavedProfile(p)}),
          el('button', {class:'btn-icon', html:'&times;', title:'Eliminar', onclick:()=>{
            if(confirm(`¿Eliminar el perfil "${p.name}"? No se puede deshacer.`)){ deleteSavedProfile(p.id); renderMain(); }
          }}),
        ]),
      ]));
    });
    libraryBox.appendChild(listWrap);
  }else{
    libraryBox.appendChild(el('div', {class:'helptext', text:'Todavía no guardaste ningún perfil. Ajustá las categorías y los pesos como quieras y guardalo abajo para volver a usarlo después (queda guardado en este navegador).', style:'margin-bottom:12px;'}));
  }

  const saveRow = el('div', {style:'display:flex;gap:8px;'});
  const nameInput = el('input', {type:'text', placeholder:'Nombre del perfil (ej: Central — Presión alta)', style:'flex:1;'});
  nameInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') saveBtn.click(); });
  const saveBtn = el('button', {class:'btn btn-gold', text:'Guardar perfil actual', onclick:() => {
    const name = nameInput.value.trim();
    if(!name){ alert('Ponele un nombre al perfil antes de guardar.'); return; }
    if(saveCurrentAsProfile(name)) renderMain();
  }});
  saveRow.appendChild(nameInput);
  saveRow.appendChild(saveBtn);
  libraryBox.appendChild(saveRow);

  wrap.appendChild(libraryBox);

  ensureDefaultWeights(categories);

  /* ---- Panel de pesos: un slider por categoría, con tope duro de 100%
     entre todas — no se puede pasar, así los números siempre significan
     lo mismo (una porción de un total fijo) en vez de números sueltos sin
     relación entre sí. ---- */
  const weightsBox = el('div', {style:'background:var(--panel-2);border:1px solid var(--border);border-radius:14px;padding:16px 20px;width:100%;'});
  weightsBox.appendChild(el('div', {text:'Perfil objetivo — prioridades', style:'font-family:var(--font-display);font-size:14px;font-weight:700;color:var(--ink);margin-bottom:4px;'}));
  weightsBox.appendChild(el('div', {text:'Definí cuánto pesa cada categoría en el ajuste. Entre todas no pueden sumar más de 100%. El ranking se recalcula al soltar el control.', style:'font-size:11px;color:var(--ink-faint);margin-bottom:6px;line-height:1.5;'}));
  const totalLabel = el('div', {style:'font-size:11px;font-weight:700;margin-bottom:14px;font-family:var(--font-mono);'});
  function updateTotalLabel(){
    const sum = categories.reduce((a, c) => a + getWeight(c.name), 0);
    totalLabel.textContent = `Total asignado: ${sum}% / 100%`;
    totalLabel.style.color = sum >= 100 ? 'var(--green)' : 'var(--ink-faint)';
  }
  updateTotalLabel();
  weightsBox.appendChild(totalLabel);

  const slidersGrid = el('div', {style:'display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:16px 20px;'});
  categories.forEach(cat => {
    const w = getWeight(cat.name);
    const valSpan = el('span', {text: w + '%', style:'color:var(--gold);font-family:var(--font-mono);font-weight:700;font-size:12px;'});
    const labelRow = el('div', {style:'display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;'}, [
      el('span', {text: cat.name, style:'font-size:12px;color:var(--ink-dim);font-weight:600;'}),
      valSpan,
    ]);
    const slider = el('input', {type:'range', min:'0', max:'100', value:String(w), style:'width:100%;accent-color:#B6935C;cursor:pointer;'});
    slider.addEventListener('input', (e) => {
      // tope duro: no se puede pisar por encima de lo que dejan libre las
      // demás categorías — se calcula en vivo, así que da igual el orden
      // en que se muevan los sliders.
      const otherSum = categories.reduce((a, c) => c.name === cat.name ? a : a + getWeight(c.name), 0);
      const cap = 100 - otherSum;
      let nv = parseInt(e.target.value, 10);
      if(nv > cap) nv = cap;
      e.target.value = String(nv); // si se pasó, el control "rebota" al máximo disponible
      state.profile.weights[cat.name] = nv;
      valSpan.textContent = nv + '%';
      updateTotalLabel();
    });
    slider.addEventListener('change', () => { renderMain(); }); // recién acá se recalcula el ranking completo
    slidersGrid.appendChild(el('div', {}, [labelRow, slider]));
  });
  weightsBox.appendChild(slidersGrid);
  wrap.appendChild(weightsBox);

  /* ---- Ranking de todo el grupo por % de adecuación ---- */
  const { rows } = computeProfileRanking();
  const listBox = el('div', {style:'background:var(--panel-2);border:1px solid var(--border);border-radius:14px;padding:16px 20px;width:100%;'});
  listBox.appendChild(el('div', {text:`Ranking de adecuación al perfil (${rows.length} jugadores)`, style:'font-family:var(--font-display);font-size:14px;font-weight:700;color:var(--ink);margin-bottom:4px;'}));
  listBox.appendChild(el('div', {text:`Universo: ${comparisonContextLabel()}`, style:'font-size:11px;color:var(--gold);font-weight:700;margin:5px 0 2px;'}));
  listBox.appendChild(el('div', {text:'Abrí un jugador para ver su ficha de decisión; la rueda completa queda como segundo paso.', style:'font-size:11px;color:var(--ink-faint);margin-bottom:10px;'}));

  if(!rows.length){
    listBox.appendChild(el('div', {class:'helptext', text:'Ningún jugador del grupo tiene datos suficientes para calcular un score con las categorías elegidas.'}));
    wrap.appendChild(listBox);
    return wrap;
  }

  const filters = state.profileFilters;
  const quick = el('div', {style:'display:flex;gap:7px;flex-wrap:wrap;margin:10px 0;'});
  const quickSelect = (key, placeholder, options) => {
    const select = el('select', {style:'width:auto;min-width:135px;font-size:11px;padding:6px 8px;'});
    select.appendChild(el('option', {value:'', text:placeholder}));
    options.forEach(o => select.appendChild(el('option', {value:o.value, text:o.label, selected:filters[key]===o.value})));
    select.addEventListener('change', e => { filters[key] = e.target.value; renderMain(); });
    quick.appendChild(select);
  };

  /* Rango con doble deslizador + entrada numérica. La previsualización se
     actualiza mientras se arrastra y el ranking se recalcula sólo al soltar,
     para que el control siga siendo ágil aun con universos grandes. */
  const rangeFilter = (key, label, values, unit='') => {
    const validValues = values.filter(v => typeof v === 'number' && isFinite(v));
    if(!validValues.length) return;
    const dataMin = Math.floor(Math.min(...validValues));
    const dataMax = Math.ceil(Math.max(...validValues));
    if(dataMin === dataMax) return;
    const minKey = `${key}Min`, maxKey = `${key}Max`;
    const storedMin = Number(filters[minKey]), storedMax = Number(filters[maxKey]);
    let currentMin = Number.isFinite(storedMin) && filters[minKey] !== '' ? Math.max(dataMin, Math.min(dataMax, storedMin)) : dataMin;
    let currentMax = Number.isFinite(storedMax) && filters[maxKey] !== '' ? Math.max(dataMin, Math.min(dataMax, storedMax)) : dataMax;
    if(currentMin > currentMax) [currentMin, currentMax] = [currentMax, currentMin];

    const minRange = el('input', {type:'range', min:dataMin, max:dataMax, step:1, value:currentMin, style:'flex:1;min-width:80px;accent-color:var(--gold);'});
    const maxRange = el('input', {type:'range', min:dataMin, max:dataMax, step:1, value:currentMax, style:'flex:1;min-width:80px;accent-color:var(--gold);'});
    const minInput = el('input', {type:'number', min:dataMin, max:dataMax, step:1, value:currentMin, title:`Mínimo de ${label}`, style:'width:68px;padding:6px 7px;font-size:11px;'});
    const maxInput = el('input', {type:'number', min:dataMin, max:dataMax, step:1, value:currentMax, title:`Máximo de ${label}`, style:'width:68px;padding:6px 7px;font-size:11px;'});
    const summary = el('span', {style:'font-family:var(--font-mono);font-size:10px;color:var(--gold);white-space:nowrap;'});

    const sync = () => {
      currentMin = Math.max(dataMin, Math.min(dataMax, Number(minRange.value)));
      currentMax = Math.max(dataMin, Math.min(dataMax, Number(maxRange.value)));
      if(currentMin > currentMax){
        if(document.activeElement === minRange || document.activeElement === minInput) currentMax = currentMin;
        else currentMin = currentMax;
      }
      minRange.value = currentMin; maxRange.value = currentMax;
      minInput.value = currentMin; maxInput.value = currentMax;
      summary.textContent = `${currentMin}${unit} — ${currentMax}${unit}`;
    };
    const commit = () => {
      sync();
      filters[minKey] = currentMin === dataMin ? '' : currentMin;
      filters[maxKey] = currentMax === dataMax ? '' : currentMax;
      renderMain();
    };
    [minRange, maxRange].forEach(control => {
      control.addEventListener('input', sync);
      control.addEventListener('change', commit);
    });
    minInput.addEventListener('change', () => { minRange.value = minInput.value || dataMin; commit(); });
    maxInput.addEventListener('change', () => { maxRange.value = maxInput.value || dataMax; commit(); });
    sync();

    const reset = el('button', {class:'btn btn-sm', text:'Restablecer', style:'font-size:10px;padding:5px 7px;', onclick:()=>{
      filters[minKey] = ''; filters[maxKey] = ''; renderMain();
    }});
    quick.appendChild(el('div', {style:'min-width:280px;flex:1 1 410px;max-width:480px;padding:8px 9px;border:1px solid var(--border);border-radius:8px;background:#0D1220;'}, [
      el('div', {style:'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;'}, [
        el('span', {text:label, style:'font-size:10.5px;color:var(--ink-dim);font-weight:700;'}), summary,
      ]),
      el('div', {style:'display:flex;align-items:center;gap:6px;flex-wrap:wrap;'}, [minInput, minRange, maxRange, maxInput, reset]),
    ]));
  };
  quickSelect('priority', 'Prioridad', [{value:'alta',label:'Sólo prioridad alta'},{value:'media',label:'Prioridad media'},{value:'baja',label:'Prioridad baja'},{value:'revisar',label:'Revisar'}]);
  rangeFilter('age', 'Edad', rows.map(r => r.age), ' años');
  rangeFilter('minutes', 'Minutos', rows.map(r => r.minutes), ' min');
  const clubs = [...new Set(rows.map(r=>r.team).filter(Boolean))].sort();
  if(clubs.length) quickSelect('club', 'Club', clubs.map(v=>({value:v,label:v})));
  const feet = [...new Set(rows.map(r=>r.foot).filter(Boolean))].sort();
  if(feet.length) quickSelect('foot', 'Pie', feet.map(v=>({value:v,label:v})));
  const nations = [...new Set(rows.map(r=>r.nationality).filter(Boolean))].sort();
  if(nations.length) quickSelect('nationality', 'Nacionalidad', nations.map(v=>({value:v,label:v})));
  quickSelect('shortlisted', 'Seguimiento', [{value:'yes',label:'Añadidos a seguimiento'}]);
  listBox.appendChild(quick);
  const columnPicker = el('div', {style:'display:flex;gap:10px;flex-wrap:wrap;margin:-3px 0 10px;align-items:center;'});
  columnPicker.appendChild(el('span', {text:'Mostrar:', style:'font-size:10px;color:var(--ink-faint);'}));
  [['age','Edad'],['minutes','Minutos'],['club','Club'],['foot','Pie'],['nationality','Nacionalidad']].forEach(([key,label]) => {
    const check = el('input', {type:'checkbox'}); check.checked = !!state.profileColumns[key];
    check.addEventListener('change', e=>{ state.profileColumns[key] = e.target.checked; renderMain(); });
    columnPicker.appendChild(el('label', {style:'display:flex;align-items:center;gap:4px;font-size:10px;color:var(--ink-dim);cursor:pointer;'}, [check, el('span',{text:label})]));
  });
  listBox.appendChild(columnPicker);
  const shownRows = rows.filter(r => {
    if(filters.priority && r.priority.key !== filters.priority) return false;
    if(filters.ageMin !== '' && !(r.age >= Number(filters.ageMin))) return false;
    if(filters.ageMax !== '' && !(r.age <= Number(filters.ageMax))) return false;
    if(filters.minutesMin !== '' && !(r.minutes >= Number(filters.minutesMin))) return false;
    if(filters.minutesMax !== '' && !(r.minutes <= Number(filters.minutesMax))) return false;
    if(filters.club && r.team !== filters.club) return false;
    if(filters.foot && r.foot !== filters.foot) return false;
    if(filters.nationality && r.nationality !== filters.nationality) return false;
    if(filters.shortlisted==='yes' && !isShortlisted(r.ref)) return false;
    return true;
  });
  const list = el('div', {id:'profile-ranking-list', style:'display:flex;flex-direction:column;gap:4px;max-height:640px;overflow:auto;'});
  const colHead = el('div', {style:'display:grid;grid-template-columns:30px 1fr 80px 130px 125px 100px;gap:8px;padding:0 10px 4px;flex-shrink:0;'}, [
    el('span', {}),
    el('span', {}),
    el('span', {text:'FIT', style:'font-size:9px;color:var(--ink-faint);text-align:right;letter-spacing:.4px;'}),
    el('span', {text:'CALIDAD · MUESTRA', style:'font-size:9px;color:var(--ink-faint);text-align:right;letter-spacing:.4px;'}),
    el('span', {text:'PRIORIDAD', style:'font-size:9px;color:var(--ink-faint);text-align:right;letter-spacing:.4px;'}),
    el('span', {text:'ACCIÓN', style:'font-size:9px;color:var(--ink-faint);text-align:right;letter-spacing:.4px;'}),
  ]);
  list.appendChild(colHead);
  shownRows.forEach((r, i) => {
    const isExpanded = state.profileExpanded === r.ref;
    const scoreRounded = Math.round(r.score);
    const fLabel = fitLabel(scoreRounded);
    const rowBox = el('div', {style:`border-radius:8px;overflow:hidden;flex-shrink:0;border:1px solid ${isExpanded ? 'var(--gold)' : 'transparent'};`});

    const header = el('div', {
      style:`display:grid;grid-template-columns:30px 1fr 80px 130px 125px 100px;gap:8px;align-items:center;padding:8px 10px;cursor:pointer;
             background:${isExpanded ? 'var(--gold-soft)' : (i < 3 ? '#151C2C' : '#0D1220')};transition:background .15s ease;`,
      onclick: () => {
        const sel = window.getSelection();
        if(sel && sel.toString().length > 0) return; // estaba seleccionando texto para copiar, no togglear
        state.profileExpanded = isExpanded ? null : r.ref;
        rerenderRankingKeepingScroll();
      },
    }, [
      el('span', {text:'#' + (i + 1), style:'font-family:var(--font-mono);font-size:11px;color:var(--ink-faint);'}),
      el('div', {style:'min-width:0;'}, [
        el('div', {text:r.name, style:'font-size:12.5px;color:var(--ink);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'}),
        (() => {
          const bits = [];
          if(state.profileColumns.club && r.team) bits.push(r.team);
          if(state.profileColumns.age && r.age !== null) bits.push(`${Math.round(r.age)} años`);
          if(state.profileColumns.minutes && r.minutes !== null) bits.push(`${Math.round(r.minutes)} min`);
          if(state.profileColumns.foot && r.foot) bits.push(r.foot);
          if(state.profileColumns.nationality && r.nationality) bits.push(r.nationality);
          return bits.length ? el('div', {text:bits.join(' · '), style:'font-size:9.5px;color:var(--ink-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;'}) : null;
        })(),
      ]),
      el('span', {text: `${fLabel.emoji} ${scoreRounded}%`, style:`font-family:var(--font-mono);font-weight:700;font-size:12px;color:${bucketColor(scoreRounded)};text-align:right;white-space:nowrap;`}),
      el('span', {text: `${r.dataQuality.label.emoji} ${r.dataQuality.label.text} · ${r.sample.minutes === null ? '—' : Math.round(r.sample.minutes)+' min'} ${r.sample.text} ⓘ`, title:SAMPLE_TOOLTIP, style:'font-size:10px;color:var(--ink-dim);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'}),
      el('span', {text: `${r.priority.emoji} ${r.priority.text}`, style:'font-size:11px;color:var(--ink-dim);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'}),
      (() => {
        const followed = isShortlisted(r.ref);
        return el('button', {
          class:'btn btn-sm',
          text:followed ? '★ En seguimiento' : '☆ Seguir',
          title:followed ? 'Clic para quitar de seguimiento' : 'Añadir a seguimiento',
          'aria-pressed':followed ? 'true' : 'false',
          style:`font-size:10px;padding:4px 6px;${followed ? 'color:var(--gold);border-color:var(--gold);background:var(--gold-soft);' : ''}`,
          onclick:(e)=>{ e.stopPropagation(); toggleShortlist(r.ref, shortlistSnapshot(r)); },
        });
      })(),
    ]);
    rowBox.appendChild(header);

    if(isExpanded){
      const detail = el('div', {style:'padding:12px 14px 14px;background:#0A0E17;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:12px;'});

      // Ficha breve: primero la decisión operativa; la rueda queda disponible
      // sólo cuando hace falta profundizar.
      const positives = r.breakdown.filter(b => b.contribution > 0).length;
      const alerts = r.breakdown.filter(b => b.contribution < 0).length;
      const summaryCard = el('div', {style:'display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:11px 12px;background:#111927;border:1px solid var(--border);border-radius:9px;'}, [
        el('div', {style:'display:flex;gap:14px;flex-wrap:wrap;align-items:center;'}, [
          el('span', {text:`Fit ${scoreRounded}%`, style:`font-family:var(--font-mono);font-weight:700;color:${bucketColor(scoreRounded)};font-size:12px;`} ),
          el('span', {text:`Muestra ${r.sample.minutes === null ? '—' : Math.round(r.sample.minutes) + ' min'} · ${r.sample.text} ⓘ`, title:SAMPLE_TOOLTIP, style:`font-size:11px;color:${r.sample.color};cursor:help;`} ),
          el('span', {text:`${positives} fortalezas · ${alerts} alertas`, style:'font-size:11px;color:var(--ink-dim);'}),
          el('span', {text:r.priority.text, style:'font-size:11px;color:var(--ink);font-weight:700;'}),
        ]),
        el('div', {style:'display:flex;gap:6px;'}, [
          (() => {
            const followed = isShortlisted(r.ref);
            return el('button', {
              class:'btn btn-sm', text:followed ? '★ En seguimiento · Quitar' : 'Añadir a seguimiento',
              title:followed ? 'Quitar de seguimiento' : 'Añadir con estado Pendiente',
              style:followed ? 'color:var(--gold);border-color:var(--gold);background:var(--gold-soft);' : '',
              onclick:()=>toggleShortlist(r.ref, {...shortlistSnapshot(r), status:'Pendiente'}),
            });
          })(),
          el('button', {class:'btn btn-sm', text:'Abrir rueda completa', onclick:()=>selectPlayerForWheel(r.ref)}),
        ]),
      ]);
      detail.appendChild(summaryCard);

      // 1) Fit — explicación + disclaimer metodológico, siempre visible
      detail.appendChild(el('div', {}, [
        el('div', {text: `${fLabel.emoji} ${scoreRounded}% · ${fLabel.text}`, style:`font-family:var(--font-display);font-size:15px;font-weight:700;color:${bucketColor(scoreRounded)};`}),
        el('div', {text:'Cómo se obtiene: promedio ponderado de los percentiles de las categorías seleccionadas, según los pesos definidos arriba.', style:'font-size:10px;color:var(--ink-faint);margin-top:3px;line-height:1.5;'}),
        el('div', {text:'Es exclusivamente coincidencia estadística con el perfil definido — no representa probabilidad de rendimiento ni garantía de adaptación.', style:'font-size:10px;color:var(--ink-faint);line-height:1.5;'}),
      ]));

      // 2) Calidad de datos y muestra del jugador son dos señales distintas.
      const c = r.dataQuality;
      const confBlock = el('div', {style:'padding-top:8px;border-top:1px solid var(--border);'}, [
        el('div', {text:`${c.label.emoji} Calidad de datos: ${c.label.text}`, style:`font-size:12.5px;font-weight:700;color:var(--ink);`}),
        el('div', {text: c.missingCritical ? 'Falta información en una categoría de alto peso.' : (c.label.key === 'baja' ? 'Cobertura de datos insuficiente.' : 'Cobertura de datos adecuada.'), style:'font-size:10px;color:var(--ink-faint);margin-top:3px;line-height:1.5;'}),
      ]);
      const factorsRow = el('div', {style:'display:flex;gap:14px;flex-wrap:wrap;margin-top:6px;'}, [
        el('span', {text:`Cobertura de datos: ${c.coveragePct}%`, style:'font-size:9.5px;color:var(--ink-faint);'}),
        el('span', {text:`Universo comparado: ${c.groupSize} jugadores`, style:'font-size:9.5px;color:var(--ink-faint);'}),
        el('span', {text:`Muestra: ${r.sample.minutes === null ? 'sin dato' : Math.round(r.sample.minutes) + ' min'} · ${r.sample.text} ⓘ`, title:SAMPLE_TOOLTIP, style:`font-size:9.5px;color:${r.sample.color};font-weight:700;cursor:help;`}),
      ]);
      confBlock.appendChild(factorsRow);
      if(!c.hasContextFilter){
        confBlock.appendChild(el('div', {text:'Contexto: comparando contra toda la tabla cargada, sin filtro de posición/minutos — si mezcla perfiles muy distintos, los percentiles pueden ser menos representativos.', style:'font-size:9.5px;color:var(--ink-faint);margin-top:4px;line-height:1.5;'}));
      }
      detail.appendChild(confBlock);

      // 3) Aportes ponderados: explica el Fit con la misma lógica usada
      // para calcularlo (peso × diferencia contra el percentil 50).
      const withData = r.breakdown.filter(b => b.avgPct !== null);
      if(withData.length >= 2){
        const drivers = withData.filter(b => b.contribution > 0).sort((a,b) => b.contribution - a.contribution).slice(0, 3);
        const limiters = withData.filter(b => b.contribution < 0).sort((a,b) => a.contribution - b.contribution).slice(0, 3);
        if(drivers.length || limiters.length){
          const dl = el('div', {style:'display:flex;gap:18px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--border);'});
          if(drivers.length){
            dl.appendChild(el('div', {style:'min-width:160px;'}, [
              el('div', {text:'Impulsan', style:'font-size:10px;font-weight:700;color:var(--green);margin-bottom:4px;'}),
              ...drivers.map(b => el('div', {text:`${b.name}: +${Math.abs(b.contribution).toFixed(1)} pts · ${Math.round(b.avgPct)}%`, style:'font-size:10.5px;color:var(--ink-dim);line-height:1.6;'})),
            ]));
          }
          if(limiters.length){
            dl.appendChild(el('div', {style:'min-width:160px;'}, [
              el('div', {text:'Limitan', style:'font-size:10px;font-weight:700;color:var(--red);margin-bottom:4px;'}),
              ...limiters.map(b => el('div', {text:`${b.name}: −${Math.abs(b.contribution).toFixed(1)} pts · ${Math.round(b.avgPct)}%`, style:'font-size:10.5px;color:var(--ink-dim);line-height:1.6;'})),
            ]));
          }
          detail.appendChild(dl);
        }
      }

      // 4) Qué validar en video — contenido editorial por posición, no
      // calculado (ver nota en videoChecklist()).
      const checklist = videoChecklist();
      detail.appendChild(el('div', {style:'padding-top:8px;border-top:1px solid var(--border);'}, [
        el('div', {text:'⚠️ Pendiente de validar', style:'font-size:11px;font-weight:700;color:var(--amber);margin-bottom:4px;'}),
        el('div', {text:'Aspectos que las estadísticas no pueden determinar por sí solas:', style:'font-size:9.5px;color:var(--ink-faint);margin-bottom:5px;'}),
        ...checklist.map(item => el('div', {text:`· ${item}`, style:'font-size:10.5px;color:var(--ink-dim);line-height:1.6;'})),
      ]));

      // 5) Decisión humana y checklist de video. Al guardar una observación
      // el jugador entra automáticamente al seguimiento persistente.
      const existingScout = getShortlistItem(r.ref);
      const scoutBlock = el('div', {style:'padding-top:8px;border-top:1px solid var(--border);'});
      scoutBlock.appendChild(el('div', {text:'Decisión del scout', style:'font-size:11px;font-weight:700;color:var(--gold);margin-bottom:6px;'}));
      const ensureScoutItem = () => {
        const existing = getShortlistItem(r.ref);
        if(existing) return existing;
        const added = upsertShortlist(r.ref, shortlistSnapshot(r));
        showScoutFeedback('✓ Añadido a seguimiento');
        // Refleja el nuevo estado en el botón sin perder el punto de trabajo.
        setTimeout(rerenderRankingKeepingScroll, 0);
        return added;
      };
      const scoutFields = el('div', {style:'display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:7px;'});
      const evaluator = el('input', {type:'text', value:existingScout?.evaluator || '', placeholder:'Evaluador', style:'font-size:11px;padding:7px;'});
      const date = el('input', {type:'date', value:existingScout?.evaluationDate || new Date().toISOString().slice(0,10), style:'font-size:11px;padding:7px;'});
      const matchesWatched = el('input', {type:'number', min:'0', step:'1', value:existingScout?.matchesWatched ?? '', placeholder:'Partidos vistos', title:'Cantidad de partidos vistos', style:'font-size:11px;padding:7px;'});
      const rivals = el('input', {type:'text', value:existingScout?.rivals || '', placeholder:'Rivales vistos (ej. River, Boca)', title:'Rivales contra los que fue visto', style:'font-size:11px;padding:7px;'});
      const conclusion = el('select', {style:'font-size:11px;padding:7px;'});
      ['', 'Positiva', 'Neutra', 'Negativa', 'No evaluada'].forEach(v => conclusion.appendChild(el('option', {value:v, text:v || 'Conclusión', selected:(existingScout?.conclusion || '')===v})));
      evaluator.addEventListener('change', e=>{ const item=ensureScoutItem(); updateShortlistItem(item.key,{evaluator:e.target.value}); });
      date.addEventListener('change', e=>{ const item=ensureScoutItem(); updateShortlistItem(item.key,{evaluationDate:e.target.value}); });
      matchesWatched.addEventListener('change', e=>{ const item=ensureScoutItem(); const raw=e.target.value.trim(); updateShortlistItem(item.key,{matchesWatched:raw==='' ? '' : Math.max(0,Math.round(Number(raw)||0))}); });
      rivals.addEventListener('change', e=>{ const item=ensureScoutItem(); updateShortlistItem(item.key,{rivals:e.target.value}); });
      conclusion.addEventListener('change', e=>{ const item=ensureScoutItem(); updateShortlistItem(item.key,{conclusion:e.target.value}); });
      scoutFields.append(evaluator, date, matchesWatched, rivals, conclusion);
      scoutBlock.appendChild(scoutFields);
      const note = el('textarea', {placeholder:'Nota de scout / evidencia de video…', style:'width:100%;min-height:58px;margin-top:7px;background:#0D1220;border:1px solid var(--border);border-radius:7px;color:var(--ink);padding:8px;font-family:var(--font-body);font-size:11px;resize:vertical;'});
      note.value = existingScout?.note || '';
      note.addEventListener('change', e=>{ const item=ensureScoutItem(); updateShortlistItem(item.key,{note:e.target.value}); });
      scoutBlock.appendChild(note);
      const checks = el('div', {style:'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px;margin-top:8px;'});
      checklist.forEach(itemLabel => {
        const sel = el('select', {style:'font-size:10.5px;padding:6px 7px;'});
        ['no evaluada','positiva','neutra','negativa'].forEach(v => sel.appendChild(el('option', {value:v, text:`${itemLabel}: ${v}`, selected:(existingScout?.videoChecks || {})[itemLabel]===v})));
        sel.addEventListener('change', e=>{ const item=ensureScoutItem(); updateShortlistItem(item.key,{videoChecks:{...(item.videoChecks || {}), [itemLabel]:e.target.value}}); });
        checks.appendChild(sel);
      });
      scoutBlock.appendChild(checks);
      detail.appendChild(scoutBlock);

      // 6) Desglose completo, categoría por categoría
      const fullBreakdown = el('div', {style:'display:flex;flex-direction:column;gap:7px;padding-top:8px;border-top:1px solid var(--border);'});
      r.breakdown.forEach(b => {
        const hasData = b.avgPct !== null;
        const pctRounded = hasData ? Math.round(b.avgPct) : null;
        fullBreakdown.appendChild(el('div', {style:'display:flex;align-items:center;gap:8px;'}, [
          el('span', {text:b.name, style:'font-size:10.5px;color:var(--ink-dim);width:130px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'}),
          el('div', {style:'flex:1;height:6px;background:#1c2334;border-radius:3px;overflow:hidden;'}, [
            el('div', {style:`height:100%;width:${hasData ? pctRounded : 0}%;background:${hasData ? bucketColor(pctRounded) : '#3A4256'};`}),
          ]),
          el('span', {text: hasData ? pctRounded + '%' : 'sin datos', style:`font-size:10px;width:58px;text-align:right;font-family:var(--font-mono);color:${hasData ? 'var(--ink-faint)' : 'var(--red)'};`}),
          el('span', {text:`peso ${b.weight}%`, style:'font-size:9px;width:56px;text-align:right;color:var(--ink-faint);'}),
        ]));
      });
      detail.appendChild(fullBreakdown);
      rowBox.appendChild(detail);
    }
    list.appendChild(rowBox);
  });
  listBox.appendChild(list);
  wrap.appendChild(listBox);

  return wrap;
}
