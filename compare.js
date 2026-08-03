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
  fetchFlagDataUri, svgStringToPngDataUrl,
} from './app.js';
import { countryToFifaCode, flagCdnUrl } from './flags.js';

/* Arma la imagen de una rueda (header con nombre/club/bandera + la rueda
   en sí) para insertar en el PDF. Reusa el <svg> YA renderizado en pantalla
   (document.getElementById('wheel-svg-a'/'-b')) en vez de generar uno
   nuevo, porque ese ya tiene aplicado el ajuste de tamaño de las etiquetas
   (fitLabelsToArcs) que se hace al montarlo en el DOM — generar uno nuevo
   "al vuelo" para el PDF podría no tener ese ajuste y superponer texto. */
async function buildWheelImage(row, suffix, accentColor){
  const svgLive = document.getElementById('wheel-svg-' + suffix);
  if(!svgLive) return null;

  const serializer = new XMLSerializer();
  const wheelOuter = serializer.serializeToString(svgLive);

  // La rueda original tiene viewBox="-45 -45 790 790" (790 unidades).
  // BUG que arreglé acá: antes solo trasladaba ese contenido dentro de un
  // lienzo más chico sin escalarlo, así que la mitad quedaba recortada
  // fuera del viewBox de la imagen. Ahora se escala correctamente a
  // WHEEL_DEST y se compensa el origen -45 ya escalado.
  const WHEEL_SRC = 790;
  const WHEEL_DEST = 720; // tamaño final de la rueda dentro de la imagen — grande, para que el texto se lea bien
  const scale = WHEEL_DEST / WHEEL_SRC;
  const PAD = 24, HEADER_H = 92;
  const W = WHEEL_DEST + PAD * 2;
  const H = HEADER_H + WHEEL_DEST + PAD * 2;
  const tx = PAD + 45 * scale;
  const ty = HEADER_H + PAD + 45 * scale;
  const wheelGroup = wheelOuter
    .replace(/^<svg[^>]*>/i, `<g transform="translate(${tx}, ${ty}) scale(${scale})">`)
    .replace(/<\/svg>$/i, '</g>');

  const countryName = resolveCountryName(row);
  const fifaCode = countryToFifaCode(countryName);
  const flag = await fetchFlagDataUri(fifaCode);

  const name = titleForRow(row);
  const club = state.teamCol ? String(row[state.teamCol] || '').trim() : '';
  const pos = state.presetUI.position || '';
  const role = state.presetUI.role || '';
  const clubRoleLine = [club, (pos && role ? `${pos} (${role})` : (pos || role))].filter(Boolean).join(' · ');

  const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let header = `<text x="${PAD}" y="32" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="26" fill="${accentColor}">${esc(name)}</text>`;
  if(clubRoleLine){
    header += `<text x="${PAD}" y="56" font-family="Inter, sans-serif" font-weight="700" font-size="14" fill="#D7DCE6">${esc(clubRoleLine)}</text>`;
  }
  if(flag){
    const fh = 30, fw = fh * flag.aspect;
    header += `<image href="${flag.dataUri}" x="${W - PAD - fw}" y="18" width="${fw}" height="${fh}" rx="3"/>`;
  }
  header += `<path d="M ${PAD} ${HEADER_H - 12} H ${W - PAD}" stroke="${accentColor}" stroke-opacity=".55" stroke-width="1"/>`;

  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#0A0E17"/>
    ${header}
    ${wheelGroup}
  </svg>`;

  const dataUrl = await svgStringToPngDataUrl(svgStr, W, H, '#0A0E17');
  return { dataUrl, w: W, h: H };
}

/* "Descargar PDF": genera el archivo directo en el navegador con jsPDF —
   sin pasar por el diálogo de impresión del sistema operativo (que en
   algunos entornos se cuelga esperando una impresora real, como reportó
   el usuario). Arma las dos ruedas como imágenes y la tabla comparativa
   como texto vectorial real (no una captura de pantalla). */
async function exportComparePDF(){
  const { rowA, rowB } = state.compare;
  if(!rowA || !rowB) return;

  const btn = document.getElementById('cmp-pdf-btn');
  const originalText = btn ? btn.textContent : '';
  if(btn){ btn.textContent = 'Generando…'; btn.disabled = true; }

  try{
    if(!window.jspdf || !window.jspdf.jsPDF){
      alert('No se pudo cargar la librería de PDF (revisá tu conexión) — intentá de nuevo.');
      return;
    }
    const { jsPDF } = window.jspdf;

    const [imgA, imgB] = await Promise.all([
      buildWheelImage(rowA, 'a', '#C9A353'),
      buildWheelImage(rowB, 'b', '#5B85D6'),
    ]);
    if(!imgA || !imgB){
      alert('No se pudieron generar las imágenes de las ruedas. Asegurate de que las dos estén visibles en pantalla e intentá de nuevo.');
      return;
    }

    const doc = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 10;
    const usableW = pageW - margin * 2;

    const paintPageBg = () => { doc.setFillColor(10, 14, 23); doc.rect(0, 0, pageW, pageH, 'F'); };
    paintPageBg();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(230, 232, 239);
    doc.text('Comparación de jugadores', margin, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(139, 143, 156);
    doc.text(`Generado ${new Date().toLocaleDateString('es-AR')}`, margin, 20);

    // dos ruedas lado a lado — lo más grandes posible dentro del ancho útil
    const gap = 4;
    const imgW = (usableW - gap) / 2;
    const imgH = imgW * (imgA.h / imgA.w);
    const imgY = 24;
    doc.addImage(imgA.dataUrl, 'PNG', margin, imgY, imgW, imgH);
    doc.addImage(imgB.dataUrl, 'PNG', margin + imgW + gap, imgY, imgW, imgH);

    // tabla comparativa — con más aire respecto de las ruedas
    const group = groupRows();
    const colW = [usableW * 0.5, usableW * 0.25, usableW * 0.25];
    const col2X = margin + colW[0];
    const col3X = col2X + colW[1];
    let y = imgY + imgH + 16;

    const ensureSpace = (needed) => {
      if(y + needed > pageH - margin){
        doc.addPage();
        paintPageBg();
        y = margin;
      }
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(230, 232, 239);
    doc.text('Comparación métrica por métrica', margin, y);
    y += 6.5;

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(201, 163, 83);
    doc.text(titleForRow(rowA), col2X + colW[1] / 2, y, { align:'center' });
    doc.setTextColor(91, 133, 214);
    doc.text(titleForRow(rowB), col3X + colW[2] / 2, y, { align:'center' });
    y += 3.5;
    doc.setDrawColor(38, 43, 54);
    doc.line(margin, y, margin + usableW, y);
    y += 5.5;

    state.categories.forEach(cat => {
      const metrics = cat.metrics.filter(m => m.col);
      if(!metrics.length) return;
      ensureSpace(10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(201, 163, 83);
      doc.text(String(cat.name || '').toUpperCase(), margin, y);
      y += 5;

      metrics.forEach(m => {
        ensureSpace(6);
        const valA = numVal(rowA, m.col), valB = numVal(rowB, m.col);
        const pctA = computePercentile(group, m.col, valA, m.invert).pct;
        const pctB = computePercentile(group, m.col, valB, m.invert).pct;
        let aWins = false, bWins = false;
        if(valA !== null && valB !== null && valA !== valB){
          aWins = m.invert ? valA < valB : valA > valB;
          bWins = !aWins;
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(174, 182, 200);
        doc.text(String(m.label || m.col), margin, y);

        if(aWins){ doc.setFillColor(35, 30, 15); doc.rect(col2X, y - 3.3, colW[1], 4.6, 'F'); }
        if(bWins){ doc.setFillColor(20, 26, 40); doc.rect(col3X, y - 3.3, colW[2], 4.6, 'F'); }

        const textA = `${fmtVal(valA)}${pctA !== null ? ` · ${pctA}th` : ''}`;
        const textB = `${fmtVal(valB)}${pctB !== null ? ` · ${pctB}th` : ''}`;
        doc.setFont('helvetica', aWins ? 'bold' : 'normal');
        doc.setTextColor(aWins ? 201 : 174, aWins ? 163 : 182, aWins ? 83 : 200);
        doc.text(textA, col2X + colW[1] / 2, y, { align:'center' });
        doc.setFont('helvetica', bWins ? 'bold' : 'normal');
        doc.setTextColor(bWins ? 91 : 174, bWins ? 133 : 182, bWins ? 214 : 200);
        doc.text(textB, col3X + colW[2] / 2, y, { align:'center' });

        y += 5;
      });
      y += 2;
    });

    const fileName = `comparacion_${titleForRow(rowA)}_vs_${titleForRow(rowB)}.pdf`
      .replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
    doc.save(fileName);
  }catch(e){
    console.error(e);
    alert('No se pudo generar el PDF. Probá de nuevo.');
  }finally{
    if(btn){ btn.textContent = originalText; btn.disabled = false; }
  }
}

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
  const pickerRow = el('div', {class:'no-print', style:'display:flex;gap:14px;flex-wrap:wrap;width:100%;max-width:780px;'});
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

  const pdfBtn = el('div', {class:'no-print', style:'display:flex;justify-content:flex-end;width:100%;max-width:1220px;'}, [
    el('button', {id:'cmp-pdf-btn', class:'btn btn-gold', text:'Descargar PDF', onclick: exportComparePDF}),
  ]);
  wrap.appendChild(pdfBtn);

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
