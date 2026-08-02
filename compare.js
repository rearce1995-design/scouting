/* =========================================================================
   compare.js — pestaña "Comparación": dos ruedas lado a lado + tabla
   comparativa métrica por métrica.

   Aislado a propósito de app.js (que ya es grande) para que este archivo
   crezca por su cuenta si el modo comparación suma funciones más adelante
   (exportar a PNG, comparar 3+, etc.) sin abarrotar el archivo principal.

   Depende de utilidades y del `state` compartido que exporta app.js — es
   un import circular (app.js también importa de acá), pero es seguro:
   todo lo que se usa son funciones (hoisted) y el objeto `state` por
   referencia, nunca se evalúa nada de esto en el top-level del módulo.
   ========================================================================= */

import {
  state, el, opt, sortedRowsForPicker, playerLabel, titleForRow, resolveCountryName,
  groupRows, numVal, computePercentile, fmtVal, renderWheelSVG, renderMain,
} from './app.js';
import { countryToFifaCode, flagCdnUrl } from './flags.js';

export function renderModeTabs(){
  const wrap = el('div', {style:'display:flex;gap:8px;width:100%;max-width:1220px;'});
  const tab = (key, label) => el('button', {
    type:'button', text: label, class:'mode-tab',
    style:`padding:8px 18px;font-size:12.5px;font-weight:700;border-radius:9px;cursor:pointer;
           background:${state.viewMode===key ? 'var(--gold-soft)' : 'transparent'};
           border:1px solid ${state.viewMode===key ? 'var(--gold)' : 'var(--border)'};
           color:${state.viewMode===key ? 'var(--gold)' : 'var(--ink-dim)'};`,
    onclick: () => { state.viewMode = key; state.activeRanking = null; renderMain(); }
  });
  wrap.appendChild(tab('single', 'Rueda individual'));
  wrap.appendChild(tab('compare', 'Comparación'));
  return wrap;
}

export function renderCompareView(){
  const wrap = el('div', {class:'fade-in', style:'width:100%;max-width:1220px;display:flex;flex-direction:column;gap:16px;align-items:center;'});

  // selector de los dos jugadores a comparar (mismo orden/formato que el
  // picker del modo individual, independiente del jugador único de ahí)
  const sorted = sortedRowsForPicker();
  const pickerRow = el('div', {style:'display:flex;gap:14px;flex-wrap:wrap;width:100%;max-width:780px;'});
  const makePicker = (label, key) => {
    const sel = el('select', {style:'min-width:220px;'});
    sel.appendChild(opt('', '— elegir jugador —', !state.compare[key]));
    sorted.forEach((r, i) => {
      sel.appendChild(opt(String(i), playerLabel(r), state.compare[key] === r));
    });
    sel.addEventListener('change', (e) => {
      const idx = e.target.value === '' ? -1 : parseInt(e.target.value, 10);
      state.compare[key] = idx >= 0 ? sorted[idx] : null;
      renderMain();
    });
    return el('div', {style:'flex:1;min-width:200px;'}, [ el('label', {class:'field-label', text:label}), sel ]);
  };
  pickerRow.appendChild(makePicker('Jugador A', 'rowA'));
  pickerRow.appendChild(makePicker('Jugador B', 'rowB'));
  wrap.appendChild(pickerRow);

  const { rowA, rowB } = state.compare;
  if(!rowA || !rowB){
    wrap.appendChild(el('div', {class:'helptext', text:'Elegí dos jugadores para compararlos lado a lado.'}));
    return wrap;
  }
  if(rowA === rowB){
    wrap.appendChild(el('div', {class:'helptext', text:'Elegí dos jugadores distintos — ahora mismo elegiste el mismo dos veces.'}));
    return wrap;
  }

  const wheelsRow = el('div', {style:'display:flex;gap:16px;justify-content:center;flex-wrap:wrap;align-items:flex-start;width:100%;'});
  wheelsRow.appendChild(buildCompareCard(rowA, 'a', 'var(--gold)'));
  wheelsRow.appendChild(buildCompareCard(rowB, 'b', 'var(--blue)'));
  wrap.appendChild(wheelsRow);

  wrap.appendChild(renderCompareTable(rowA, rowB));

  return wrap;
}

/* Tarjeta individual de un jugador dentro de la comparación: mismo look
   que la rueda del modo individual pero más compacta (para que entren dos
   lado a lado), y sin el click-to-ranking (la tabla de abajo ya cumple
   ese rol acá). El nombre/club/bandera salen directo de la fila, no de
   los campos editables del paso 4 (esos son solo para el modo individual). */
function buildCompareCard(row, suffix, accentColor){
  const card = el('div', {class:'wheel-wrap-card'});
  const headerRow = el('div', {style:'display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:2px 4px 10px;'});
  const club = state.teamCol ? String(row[state.teamCol] || '').trim() : '';
  const pos = state.presetUI.position || '';
  const role = state.presetUI.role || '';
  const clubRoleLine = [club, (pos && role ? `${pos} (${role})` : (pos || role))].filter(Boolean).join(' · ');
  const titleBlock = el('div', {style:'min-width:0;'}, [
    el('h2', {text: titleForRow(row), style:`margin:0;font-family:var(--font-display);font-size:19px;font-weight:700;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${accentColor};`}),
    clubRoleLine ? el('div', {text: clubRoleLine, style:'color:var(--ink);font-size:12px;margin-top:5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'}) : null,
  ]);
  const countryName = resolveCountryName(row);
  const fifaCode = countryToFifaCode(countryName);
  const flagBlock = fifaCode
    ? el('img', { src: flagCdnUrl(fifaCode), alt: countryName, title: countryName, loading:'eager', referrerpolicy:'no-referrer',
        style:'height:24px;width:auto;border-radius:3px;box-shadow:0 0 0 1px rgba(255,255,255,.1);flex-shrink:0;margin-top:2px;',
        onerror:(e)=>{ e.target.replaceWith(el('div', {text: countryName || '', style:'font-size:11px;color:var(--ink-faint);'})); } })
    : (countryName ? el('div', {text: countryName, style:'font-size:11px;color:var(--ink-faint);margin-top:3px;flex-shrink:0;'}) : el('div', {}));
  headerRow.appendChild(titleBlock);
  headerRow.appendChild(flagBlock);
  card.appendChild(headerRow);
  card.appendChild(el('div', {style:`height:1px;background:linear-gradient(90deg, ${accentColor}, transparent);margin:0 4px 8px;`}));

  const svgWrap = el('div', {style:'width:100%;aspect-ratio:1/1;max-width:480px;margin:0 auto;position:relative;'});
  const tooltipEl = el('div', {id:'wheel-tooltip'});
  const svg = renderWheelSVG(tooltipEl, row, false);
  svg.setAttribute('id', 'wheel-svg-' + suffix);
  svgWrap.appendChild(svg);
  svgWrap.appendChild(tooltipEl);
  card.appendChild(svgWrap);

  return card;
}

/* Tabla comparativa: una fila por métrica (agrupadas por categoría, igual
   que en la rueda), valor + percentil de cada jugador contra el mismo
   grupo de referencia, con el que gana esa métrica resaltado. */
function renderCompareTable(rowA, rowB){
  const group = groupRows();
  const box = el('div', {style:'background:var(--panel-2);border:1px solid var(--border);border-radius:14px;padding:18px 20px;width:100%;max-width:1220px;'});
  box.appendChild(el('div', {text:'Comparación métrica por métrica', style:'font-family:var(--font-display);font-size:14.5px;font-weight:700;color:var(--ink);margin-bottom:12px;'}));

  box.appendChild(el('div', {style:'display:grid;grid-template-columns:1fr 140px 140px;gap:10px;padding:0 4px 8px;border-bottom:1px solid var(--border);margin-bottom:6px;'}, [
    el('span', {}),
    el('span', {text: titleForRow(rowA), style:'font-size:11.5px;font-weight:700;color:var(--gold);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'}),
    el('span', {text: titleForRow(rowB), style:'font-size:11.5px;font-weight:700;color:var(--blue);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'}),
  ]));

  state.categories.forEach(cat => {
    const metrics = cat.metrics.filter(m => m.col);
    if(!metrics.length) return;
    box.appendChild(el('div', {text: cat.name, style:`font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:${cat.color || 'var(--gold)'};padding:10px 4px 5px;`}));
    metrics.forEach(m => {
      const valA = numVal(rowA, m.col), valB = numVal(rowB, m.col);
      const pctA = computePercentile(group, m.col, valA, m.invert).pct;
      const pctB = computePercentile(group, m.col, valB, m.invert).pct;
      let aWins = false, bWins = false;
      if(valA !== null && valB !== null && valA !== valB){
        aWins = m.invert ? valA < valB : valA > valB;
        bWins = !aWins;
      }
      const cellStyle = (isWinner) => `font-size:12px;text-align:center;padding:6px 4px;border-radius:6px;font-family:var(--font-mono);
        background:${isWinner ? 'var(--gold-soft)' : 'transparent'};
        color:${isWinner ? 'var(--gold)' : 'var(--ink-dim)'};
        font-weight:${isWinner ? '700' : '500'};`;
      box.appendChild(el('div', {class:'cmp-row', style:'display:grid;grid-template-columns:1fr 140px 140px;gap:10px;align-items:center;padding:3px 4px;border-radius:6px;'}, [
        el('span', {text: m.label || m.col, style:'font-size:12px;color:var(--ink-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'}),
        el('span', {text: `${fmtVal(valA)}${pctA!==null ? ` · ${pctA}th` : ''}`, style: cellStyle(aWins)}),
        el('span', {text: `${fmtVal(valB)}${pctB!==null ? ` · ${pctB}th` : ''}`, style: cellStyle(bWins)}),
      ]));
    });
  });

  return box;
}
