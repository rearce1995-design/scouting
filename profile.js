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
  renderMain, bucketColor, applyPreset,
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

/* ---- Confianza: independiente del Fit. Combina 4 factores como se
   discutió. OJO — el factor C ("consistencia") es una aproximación mía,
   no una definición estándar: mide qué tan parejas son las categorías de
   MAYOR peso (desvío estándar bajo = cuentan una historia consistente).
   Los pesos 35/20/25/20 entre factores también son un punto de partida
   razonable, no un resultado derivado de nada — ajustalos si con uso real
   ves que algún factor debería pesar más o menos. ---- */
function computeConfidence(breakdown, groupSize){
  // A. cobertura: de todas las métricas elegidas, ¿cuántas tiene el jugador?
  const totalMetrics = breakdown.reduce((a, b) => a + b.nTotal, 0);
  const okMetrics = breakdown.reduce((a, b) => a + b.nOk, 0);
  const coveragePct = totalMetrics > 0 ? (okMetrics / totalMetrics) * 100 : 0;

  // B. tamaño de muestra del grupo de comparación (igual para todos los
  // jugadores de este ranking — a más jugadores, percentiles más estables)
  const sampleScore = groupSize >= 60 ? 100 : groupSize >= 30 ? 75 : groupSize >= 15 ? 50 : 25;

  // C. consistencia (aproximación): desvío estándar entre las categorías
  // de mayor peso (por encima de la mediana de pesos) que sí tienen dato.
  const weights = breakdown.map(b => b.weight);
  const sortedW = weights.slice().sort((a, b) => a - b);
  const medianWeight = sortedW.length ? sortedW[Math.floor(sortedW.length / 2)] : 0;
  const important = breakdown.filter(b => b.weight >= medianWeight && b.avgPct !== null);
  let consistencyScore = 100;
  if(important.length >= 2){
    const vals = important.map(b => b.avgPct);
    const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
    const variance = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length;
    consistencyScore = Math.max(0, 100 - Math.sqrt(variance) * 1.4);
  }

  // D. dato crítico faltante: alguna categoría de peso alto (>=70) sin
  // ningún dato para este jugador — esto es una bandera roja fuerte, no
  // solo "un poco menos de cobertura".
  const missingCritical = breakdown.some(b => b.weight >= 70 && b.avgPct === null);

  let score = coveragePct * 0.35 + sampleScore * 0.20 + consistencyScore * 0.25 + (missingCritical ? 0 : 100) * 0.20;
  if(missingCritical) score = Math.min(score, 35); // tope duro: si falta un dato que pesa mucho, la confianza cae directo a "Baja" (no alcanza con dejarla en "Media") — así la regla de Prioridad que busca justamente confianza baja + fit alto ("revisar antes de priorizar") se activa de forma consistente
  score = Math.round(Math.max(0, Math.min(100, score)));

  let label;
  if(score >= 70) label = { key:'alta', emoji:'🟢', text:'Alta' };
  else if(score >= 40) label = { key:'media', emoji:'🟡', text:'Media' };
  else label = { key:'baja', emoji:'🔴', text:'Baja' };

  return { score, label, coveragePct: Math.round(coveragePct), sampleScore, consistencyScore: Math.round(consistencyScore), missingCritical };
}

/* ---- Prioridad de scouting: combina Fit + Confianza con reglas
   explícitas (no un score numérico oculto). No uso la posición en el
   ranking como factor aparte porque ya está implícita en el Fit (usarla
   dos veces sería contar la misma información doble). El caso especial
   "revisar antes de priorizar" es justamente para el escenario que
   describiste: fit alto pero confianza baja no debería leerse como
   prioridad alta automática. ---- */
function computePriority(fitScore, confidenceKey){
  if(fitScore >= 75 && confidenceKey === 'baja') return { key:'revisar', emoji:'🟡', text:'Revisar antes de priorizar' };
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
function videoChecklist(){
  return VIDEO_CHECKLIST_BY_POSITION[state.presetUI.position] || VIDEO_CHECKLIST_DEFAULT;
}

/* Categorías candidatas para el perfil: las que ya tienen métricas
   elegidas en el paso 3 (reusa exactamente lo que arma el preset o lo
   que el usuario armó a mano — no inventa una estructura nueva). */
function profileCategories(){
  return state.categories.filter(c => c.metrics.some(m => m.col));
}

function getWeight(catName){
  if(state.profile.weights[catName] === undefined) state.profile.weights[catName] = 50;
  return state.profile.weights[catName];
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
  const score = weightTotal > 0 ? weightedSum / weightTotal : null;
  return { score, breakdown };
}

function computeProfileRanking(){
  const categories = profileCategories();
  const group = groupRows();
  const rows = group
    .map(r => {
      const { score, breakdown } = computeFitScore(r, categories, group);
      const confidence = score !== null ? computeConfidence(breakdown, group.length) : null;
      const priority = (score !== null && confidence) ? computePriority(score, confidence.label.key) : null;
      return {
        ref: r,
        name: state.playerCol ? String(r[state.playerCol] ?? '') : '?',
        team: state.teamCol ? String(r[state.teamCol] ?? '') : '',
        score, breakdown, confidence, priority,
      };
    })
    .filter(r => r.score !== null)
    .sort((a, b) => b.score - a.score);
  return { rows, categories };
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
    applyPreset(preset, state.presetUI.includePhysical); // ya re-renderiza todo internamente; categorías nuevas arrancan en 50% por default (ver getWeight)
  });
  presetBox.appendChild(presetSelect);
  wrap.appendChild(presetBox);

  /* ---- Panel de pesos: un slider por categoría ---- */
  const weightsBox = el('div', {style:'background:var(--panel-2);border:1px solid var(--border);border-radius:14px;padding:16px 20px;width:100%;'});
  weightsBox.appendChild(el('div', {text:'Perfil objetivo — prioridades', style:'font-family:var(--font-display);font-size:14px;font-weight:700;color:var(--ink);margin-bottom:4px;'}));
  weightsBox.appendChild(el('div', {text:'Definí cuánto pesa cada categoría en el ajuste (0 = no importa, 100 = máxima prioridad). El ranking se recalcula al soltar el control.', style:'font-size:11px;color:var(--ink-faint);margin-bottom:14px;line-height:1.5;'}));

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
      valSpan.textContent = e.target.value + '%'; // feedback instantáneo mientras arrastra
    });
    slider.addEventListener('change', (e) => {
      state.profile.weights[cat.name] = parseInt(e.target.value, 10); // recién acá se guarda y se recalcula todo
      renderMain();
    });
    slidersGrid.appendChild(el('div', {}, [labelRow, slider]));
  });
  weightsBox.appendChild(slidersGrid);
  wrap.appendChild(weightsBox);

  /* ---- Ranking de todo el grupo por % de adecuación ---- */
  const { rows } = computeProfileRanking();
  const listBox = el('div', {style:'background:var(--panel-2);border:1px solid var(--border);border-radius:14px;padding:16px 20px;width:100%;'});
  listBox.appendChild(el('div', {text:`Ranking de adecuación al perfil (${rows.length} jugadores)`, style:'font-family:var(--font-display);font-size:14px;font-weight:700;color:var(--ink);margin-bottom:4px;'}));
  listBox.appendChild(el('div', {text:'Tocá un jugador para ver el desglose por categoría.', style:'font-size:11px;color:var(--ink-faint);margin-bottom:10px;'}));

  if(!rows.length){
    listBox.appendChild(el('div', {class:'helptext', text:'Ningún jugador del grupo tiene datos suficientes para calcular un score con las categorías elegidas.'}));
    wrap.appendChild(listBox);
    return wrap;
  }

  const list = el('div', {style:'display:flex;flex-direction:column;gap:4px;max-height:640px;overflow-y:auto;'});
  const colHead = el('div', {style:'display:grid;grid-template-columns:30px 1fr 100px 90px 150px;gap:8px;padding:0 10px 4px;flex-shrink:0;'}, [
    el('span', {}),
    el('span', {}),
    el('span', {text:'FIT', style:'font-size:9px;color:var(--ink-faint);text-align:right;letter-spacing:.4px;'}),
    el('span', {text:'CONFIANZA', style:'font-size:9px;color:var(--ink-faint);text-align:right;letter-spacing:.4px;'}),
    el('span', {text:'PRIORIDAD', style:'font-size:9px;color:var(--ink-faint);text-align:right;letter-spacing:.4px;'}),
  ]);
  list.appendChild(colHead);
  rows.forEach((r, i) => {
    const isExpanded = state.profileExpanded === r.ref;
    const scoreRounded = Math.round(r.score);
    const fLabel = fitLabel(scoreRounded);
    const rowBox = el('div', {style:`border-radius:8px;overflow:hidden;flex-shrink:0;border:1px solid ${isExpanded ? 'var(--gold)' : 'transparent'};`});

    const header = el('div', {
      style:`display:grid;grid-template-columns:30px 1fr 100px 90px 150px;gap:8px;align-items:center;padding:8px 10px;cursor:pointer;
             background:${isExpanded ? 'var(--gold-soft)' : (i < 3 ? '#151C2C' : '#0D1220')};transition:background .15s ease;`,
      onclick: () => { state.profileExpanded = isExpanded ? null : r.ref; renderMain(); },
    }, [
      el('span', {text:'#' + (i + 1), style:'font-family:var(--font-mono);font-size:11px;color:var(--ink-faint);'}),
      el('span', {text: r.team ? `${r.name} — ${r.team}` : r.name, style:'font-size:12.5px;color:var(--ink);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'}),
      el('span', {text: `${fLabel.emoji} ${scoreRounded}%`, style:`font-family:var(--font-mono);font-weight:700;font-size:12px;color:${bucketColor(scoreRounded)};text-align:right;white-space:nowrap;`}),
      el('span', {text: `${r.confidence.label.emoji} ${r.confidence.label.text}`, style:'font-size:11px;color:var(--ink-dim);text-align:right;white-space:nowrap;'}),
      el('span', {text: `${r.priority.emoji} ${r.priority.text}`, style:'font-size:11px;color:var(--ink-dim);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'}),
    ]);
    rowBox.appendChild(header);

    if(isExpanded){
      const detail = el('div', {style:'padding:12px 14px 14px;background:#0A0E17;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:12px;'});

      // 1) Fit — explicación + disclaimer metodológico, siempre visible
      detail.appendChild(el('div', {}, [
        el('div', {text: `${fLabel.emoji} ${scoreRounded}% · ${fLabel.text}`, style:`font-family:var(--font-display);font-size:15px;font-weight:700;color:${bucketColor(scoreRounded)};`}),
        el('div', {text:'Cómo se obtiene: promedio ponderado de los percentiles de las categorías seleccionadas, según los pesos definidos arriba.', style:'font-size:10px;color:var(--ink-faint);margin-top:3px;line-height:1.5;'}),
        el('div', {text:'Es exclusivamente coincidencia estadística con el perfil definido — no representa probabilidad de rendimiento ni garantía de adaptación.', style:'font-size:10px;color:var(--ink-faint);line-height:1.5;'}),
      ]));

      // 2) Confianza — independiente del Fit, con sus 4 factores a la vista
      const c = r.confidence;
      const confBlock = el('div', {style:'padding-top:8px;border-top:1px solid var(--border);'}, [
        el('div', {text:`${c.label.emoji} Confianza ${c.label.text.toLowerCase()} (${c.score}%)`, style:`font-size:12.5px;font-weight:700;color:var(--ink);`}),
        el('div', {text: c.missingCritical ? 'Falta información en una categoría de alto peso — esto limita la confianza aunque el resto de los datos sea bueno.' : 'Evalúa cobertura de datos, tamaño del grupo de comparación y consistencia entre las categorías más importantes.', style:'font-size:10px;color:var(--ink-faint);margin-top:3px;line-height:1.5;'}),
      ]);
      const factorsRow = el('div', {style:'display:flex;gap:14px;flex-wrap:wrap;margin-top:6px;'}, [
        el('span', {text:`Cobertura de datos: ${c.coveragePct}%`, style:'font-size:9.5px;color:var(--ink-faint);'}),
        el('span', {text:`Tamaño de muestra: ${c.sampleScore}%`, style:'font-size:9.5px;color:var(--ink-faint);'}),
        el('span', {text:`Consistencia: ${c.consistencyScore}%`, style:'font-size:9.5px;color:var(--ink-faint);'}),
      ]);
      confBlock.appendChild(factorsRow);
      detail.appendChild(confBlock);

      // 3) Fortalezas / Limitaciones (mismo dato que el desglose de abajo,
      // resumido en las categorías más fuertes/débiles). Solo si hay
      // categorías suficientes como para que la diferencia diga algo.
      const withData = r.breakdown.filter(b => b.avgPct !== null);
      if(withData.length >= 4){
        const drivers = withData.filter(b => b.avgPct >= 65).sort((a,b) => b.avgPct - a.avgPct).slice(0, 3);
        const limiters = withData.filter(b => b.avgPct <= 40).sort((a,b) => a.avgPct - b.avgPct).slice(0, 3);
        if(drivers.length || limiters.length){
          const dl = el('div', {style:'display:flex;gap:18px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--border);'});
          if(drivers.length){
            dl.appendChild(el('div', {style:'min-width:160px;'}, [
              el('div', {text:'Impulsan', style:'font-size:10px;font-weight:700;color:var(--green);margin-bottom:4px;'}),
              ...drivers.map(b => el('div', {text:`${b.name}: ${Math.round(b.avgPct)}%`, style:'font-size:10.5px;color:var(--ink-dim);line-height:1.6;'})),
            ]));
          }
          if(limiters.length){
            dl.appendChild(el('div', {style:'min-width:160px;'}, [
              el('div', {text:'Limitan', style:'font-size:10px;font-weight:700;color:var(--red);margin-bottom:4px;'}),
              ...limiters.map(b => el('div', {text:`${b.name}: ${Math.round(b.avgPct)}%`, style:'font-size:10.5px;color:var(--ink-dim);line-height:1.6;'})),
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

      // 5) Desglose completo, categoría por categoría
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
