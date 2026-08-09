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
   categoría. */
function computeCategoryAvgPct(row, cat, group){
  const metrics = cat.metrics.filter(m => m.col);
  let sum = 0, n = 0;
  metrics.forEach(m => {
    const val = numVal(row, m.col);
    if(val === null) return;
    const { pct } = computePercentile(group, m.col, val, m.invert);
    if(pct === null) return;
    sum += pct; n++;
  });
  return n > 0 ? sum / n : null;
}

/* Score de adecuación de un jugador: promedio ponderado de los promedios
   de categoría. Categorías sin datos para ese jugador se excluyen del
   promedio (no se cuentan como 0) y los pesos restantes se renormalizan
   solos (división por weightTotal, no por la suma original de pesos). */
function computeFitScore(row, categories, group){
  let weightedSum = 0, weightTotal = 0;
  const breakdown = [];
  categories.forEach(cat => {
    const avgPct = computeCategoryAvgPct(row, cat, group);
    const w = getWeight(cat.name);
    breakdown.push({ name: cat.name, avgPct, weight: w });
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
      return {
        ref: r,
        name: state.playerCol ? String(r[state.playerCol] ?? '') : '?',
        team: state.teamCol ? String(r[state.teamCol] ?? '') : '',
        score, breakdown,
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
  rows.forEach((r, i) => {
    const isExpanded = state.profileExpanded === r.ref;
    const scoreRounded = Math.round(r.score);
    const rowBox = el('div', {style:`border-radius:8px;overflow:hidden;border:1px solid ${isExpanded ? 'var(--gold)' : 'transparent'};`});

    const header = el('div', {
      style:`display:grid;grid-template-columns:30px 1fr 165px;gap:10px;align-items:center;padding:8px 10px;cursor:pointer;
             background:${isExpanded ? 'var(--gold-soft)' : (i < 3 ? '#151C2C' : '#0D1220')};transition:background .15s ease;`,
      onclick: () => { state.profileExpanded = isExpanded ? null : r.ref; renderMain(); },
    }, [
      el('span', {text:'#' + (i + 1), style:'font-family:var(--font-mono);font-size:11px;color:var(--ink-faint);'}),
      el('span', {text: r.team ? `${r.name} — ${r.team}` : r.name, style:'font-size:12.5px;color:var(--ink);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'}),
      el('span', {text: scoreRounded + '% · Ajuste al perfil', style:`font-family:var(--font-mono);font-weight:700;font-size:12.5px;color:${bucketColor(scoreRounded)};text-align:right;white-space:nowrap;`}),
    ]);
    rowBox.appendChild(header);

    if(isExpanded){
      const detail = el('div', {style:'padding:12px 14px 14px;background:#0A0E17;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:10px;'});

      // Explicación del score + disclaimer metodológico — a propósito
      // siempre visible al expandir, no algo que haya que ir a buscar.
      detail.appendChild(el('div', {}, [
        el('div', {text: `${scoreRounded}% · Ajuste al perfil`, style:`font-family:var(--font-display);font-size:15px;font-weight:700;color:${bucketColor(scoreRounded)};`}),
        el('div', {text:'Cómo se obtiene: promedio ponderado de los percentiles de las categorías seleccionadas, según los pesos definidos arriba.', style:'font-size:10px;color:var(--ink-faint);margin-top:3px;line-height:1.5;'}),
        el('div', {text:'No representa probabilidad de rendimiento ni garantía de adaptación al equipo o la competencia.', style:'font-size:10px;color:var(--ink-faint);line-height:1.5;'}),
      ]));

      // "Lo impulsa / Lo limita": mismo dato del desglose de abajo, resumido
      // en las categorías más fuertes/débiles — solo si hay categorías
      // suficientes como para que la diferencia diga algo (con 2-3 categorías
      // ya se ve todo en el desglose completo, este resumen sería redundante).
      const withData = r.breakdown.filter(b => b.avgPct !== null);
      if(withData.length >= 4){
        const drivers = withData.filter(b => b.avgPct >= 65).sort((a,b) => b.avgPct - a.avgPct).slice(0, 3);
        const limiters = withData.filter(b => b.avgPct <= 40).sort((a,b) => a.avgPct - b.avgPct).slice(0, 3);
        if(drivers.length || limiters.length){
          const dl = el('div', {style:'display:flex;gap:18px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);'});
          if(drivers.length){
            dl.appendChild(el('div', {style:'min-width:160px;'}, [
              el('div', {text:'Lo impulsa', style:'font-size:10px;font-weight:700;color:var(--green);margin-bottom:4px;'}),
              ...drivers.map(b => el('div', {text:`${b.name}: ${Math.round(b.avgPct)}%`, style:'font-size:10.5px;color:var(--ink-dim);line-height:1.6;'})),
            ]));
          }
          if(limiters.length){
            dl.appendChild(el('div', {style:'min-width:160px;'}, [
              el('div', {text:'Lo limita', style:'font-size:10px;font-weight:700;color:var(--red);margin-bottom:4px;'}),
              ...limiters.map(b => el('div', {text:`${b.name}: ${Math.round(b.avgPct)}%`, style:'font-size:10.5px;color:var(--ink-dim);line-height:1.6;'})),
            ]));
          }
          detail.appendChild(dl);
        }
      }

      // Desglose completo, categoría por categoría
      r.breakdown.forEach(b => {
        const hasData = b.avgPct !== null;
        const pctRounded = hasData ? Math.round(b.avgPct) : null;
        detail.appendChild(el('div', {style:'display:flex;align-items:center;gap:8px;'}, [
          el('span', {text:b.name, style:'font-size:10.5px;color:var(--ink-dim);width:130px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'}),
          el('div', {style:'flex:1;height:6px;background:#1c2334;border-radius:3px;overflow:hidden;'}, [
            el('div', {style:`height:100%;width:${hasData ? pctRounded : 0}%;background:${hasData ? bucketColor(pctRounded) : '#3A4256'};`}),
          ]),
          el('span', {text: hasData ? pctRounded + '%' : 'sin datos', style:`font-size:10px;width:58px;text-align:right;font-family:var(--font-mono);color:${hasData ? 'var(--ink-faint)' : 'var(--red)'};`}),
          el('span', {text:`peso ${b.weight}%`, style:'font-size:9px;width:56px;text-align:right;color:var(--ink-faint);'}),
        ]));
      });
      rowBox.appendChild(detail);
    }
    list.appendChild(rowBox);
  });
  listBox.appendChild(list);
  wrap.appendChild(listBox);

  return wrap;
}
