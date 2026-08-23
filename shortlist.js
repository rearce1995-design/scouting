/* Seguimiento persistente: el puente entre el ranking estadístico y la
   decisión de scouting. Vive en localStorage para no requerir backend. */
import {
  state, el, loadShortlist, updateShortlistItem, removeShortlistItem,
  selectPlayerForWheel, renderMain, currentShortlistInfo, renameCurrentShortlist,
} from './app.js';

const STATES = ['Pendiente', 'Descartado', 'Prioridad baja', 'Prioridad media', 'Prioridad alta', 'Prioridad máxima'];

function fmtDate(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('es-AR');
}
function stateColor(status){
  return ({
    'Pendiente':'var(--amber)', 'Descartado':'var(--red)',
    'Prioridad baja':'var(--red)', 'Prioridad media':'var(--amber)',
    'Prioridad alta':'var(--green)', 'Prioridad máxima':'var(--gold)',
  })[status] || 'var(--ink-dim)';
}
function sortByFit(items){
  return [...items].sort((a, b) => {
    const fitValue = item => (item.fit === null || item.fit === undefined || item.fit === '')
      ? -Infinity : (Number.isFinite(Number(item.fit)) ? Number(item.fit) : -Infinity);
    const fitA = fitValue(a);
    const fitB = fitValue(b);
    if(fitB !== fitA) return fitB - fitA;
    // Con el mismo Fit, la actualización más reciente queda primero.
    return String(b.updatedAt || b.addedAt).localeCompare(String(a.updatedAt || a.addedAt));
  });
}
// El estado responde "en qué etapa está"; el puesto mantiene la prioridad
// estadística global aunque la vista esté filtrada por una sola etapa.
function rankedByFit(items){
  return sortByFit(items).map((item, index) => ({item, fitRank:index + 1}));
}
function findRow(item){
  return state.rows.find(r => {
    const name = state.playerCol ? String(r[state.playerCol] ?? '').trim() : '';
    const team = state.teamCol ? String(r[state.teamCol] ?? '').trim() : '';
    const age = state.ageCol ? String(r[state.ageCol] ?? '').trim() : '';
    return `${name}|${team}|${age}`.toLowerCase() === item.key;
  });
}
function openPlayer(item){
  const source = findRow(item);
  if(source) selectPlayerForWheel(source);
  else alert('Este jugador no está en la tabla cargada actualmente. Sus notas siguen guardadas en seguimiento.');
}
function removeItem(item){
  if(confirm(`¿Quitar a ${item.name} del seguimiento?`)){
    removeShortlistItem(item.key);
    renderMain();
  }
}

function renderKanbanBoard(){
  const boardWrap = el('div', {style:'background:var(--panel-2);border:1px solid var(--border);border-radius:14px;padding:12px;overflow-x:auto;'});
  const board = el('div', {style:'display:grid;grid-template-columns:repeat(5,minmax(215px,1fr));gap:10px;min-width:1120px;align-items:start;'});
  const all = rankedByFit(loadShortlist());

  STATES.forEach(statusName => {
    const cards = all.filter(({item}) => (item.status || 'Pendiente') === statusName);
    const column = el('section', {style:`min-height:280px;border:1px solid ${stateColor(statusName)};border-radius:10px;background:#0D1220;overflow:hidden;`});
    column.appendChild(el('div', {style:`display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 11px;background:${stateColor(statusName)}22;border-bottom:1px solid ${stateColor(statusName)}55;`}, [
      el('span', {text:statusName.toUpperCase(), style:`font-size:12px;font-weight:700;color:${stateColor(statusName)};`} ),
      el('span', {text:String(cards.length), style:'font-family:var(--font-mono);font-size:11px;color:var(--ink-dim);'}),
    ]));
    const stack = el('div', {style:'display:flex;flex-direction:column;gap:8px;padding:8px;'});
    cards.forEach(({item, fitRank}) => {
      const card = el('article', {style:'padding:10px;border:1px solid var(--border);border-radius:8px;background:#151B28;box-shadow:0 3px 10px rgba(0,0,0,.14);'});
      const player = el('button', {class:'btn', text:item.name || 'Jugador', style:'padding:0;border:0;background:transparent;text-align:left;font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px;', onclick:()=>openPlayer(item)});
      card.appendChild(el('div', {style:'display:flex;justify-content:space-between;align-items:flex-start;gap:6px;'}, [
        el('div', {style:'min-width:0;display:flex;align-items:center;gap:6px;'}, [
          el('span', {text:'#' + fitRank, title:'Puesto global dentro de Seguimiento por Fit', style:'font-family:var(--font-mono);font-size:10px;color:var(--ink-faint);flex-shrink:0;'}),
          player,
        ]),
        el('button', {class:'btn-icon', html:'&times;', title:'Quitar de seguimiento', onclick:()=>removeItem(item)}),
      ]));
      card.appendChild(el('div', {text:item.team || '—', style:'font-size:10px;color:var(--ink-faint);margin-top:3px;'}));
      card.appendChild(el('div', {style:'display:flex;justify-content:space-between;gap:7px;margin:9px 0 8px;font-family:var(--font-mono);'}, [
        el('span', {text:item.fit === null || item.fit === undefined ? 'Fit —' : `Fit ${Math.round(item.fit)}%`, style:'font-size:11px;color:var(--gold);font-weight:700;'}),
        el('span', {text:item.minutes === null || item.minutes === undefined ? '— min' : `${Math.round(item.minutes)} min`, style:'font-size:10px;color:var(--ink-dim);'}),
      ]));
      const hasMatchesWatched = item.matchesWatched !== null && item.matchesWatched !== undefined && item.matchesWatched !== '';
      if(hasMatchesWatched || item.rivals) card.appendChild(el('div', {text:`Observación: ${hasMatchesWatched ? item.matchesWatched + ' partidos' : '—'}${item.rivals ? ' · ' + item.rivals : ''}`, style:'font-size:10px;color:var(--ink-dim);line-height:1.4;margin:-2px 0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'}));
      const status = el('select', {style:`width:100%;padding:6px 7px;font-size:10.5px;color:${stateColor(item.status)};border-color:${stateColor(item.status)};`});
      STATES.forEach(s => status.appendChild(el('option', {value:s, text:s, selected:item.status===s})));
      status.addEventListener('change', e => { updateShortlistItem(item.key, {status:e.target.value}); renderMain(); });
      card.appendChild(status);
      if(item.note) card.appendChild(el('div', {text:item.note, style:'font-size:10px;color:var(--ink-dim);line-height:1.45;margin-top:8px;white-space:pre-wrap;'}));
      stack.appendChild(card);
    });
    if(!cards.length) stack.appendChild(el('div', {text:'Sin jugadores', style:'padding:12px 4px;font-size:10px;color:var(--ink-faint);text-align:center;'}));
    column.appendChild(stack);
    board.appendChild(column);
  });
  boardWrap.appendChild(board);
  return boardWrap;
}

function exportShortlistToExcel(){
  if(!window.XLSX){
    alert('No se pudo cargar la herramienta de exportación. Revisá tu conexión e intentá de nuevo.');
    return;
  }
  const rows = sortByFit(loadShortlist())
    .map(item => ({
      Jugador: item.name || '',
      Club: item.team || '',
      Perfil: item.profile || '',
      Fit: item.fit === null || item.fit === undefined ? '' : Math.round(item.fit),
      'Calidad de datos': item.dataQuality || '',
      Muestra: item.minutes === null || item.minutes === undefined ? '' : Math.round(item.minutes),
      'Estado': item.status || 'Pendiente',
      'Nota de scout': item.note || '',
      Evaluador: item.evaluator || '',
      'Fecha de evaluación': item.evaluationDate || '',
      'Partidos vistos': item.matchesWatched === null || item.matchesWatched === undefined || item.matchesWatched === '' ? '' : Number(item.matchesWatched),
      Rivales: item.rivals || '',
      Conclusión: item.conclusion || '',
      Nacionalidad: item.nationality || '',
      Pie: item.foot || '',
      'Añadido el': fmtDate(item.addedAt),
      'Última actualización': fmtDate(item.updatedAt),
      'Checklist de video': Object.entries(item.videoChecks || {}).map(([label, value]) => `${label}: ${value}`).join(' · '),
    }));
  const sheet = window.XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    {wch:24}, {wch:18}, {wch:26}, {wch:9}, {wch:18}, {wch:12}, {wch:15}, {wch:44},
    {wch:20}, {wch:18}, {wch:14}, {wch:32}, {wch:18}, {wch:18}, {wch:12}, {wch:15}, {wch:20}, {wch:70},
  ];
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, sheet, 'Seguimiento');
  const stamp = new Date().toISOString().slice(0,10);
  const listSlug = currentShortlistInfo().name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'seguimiento';
  window.XLSX.writeFile(workbook, `${listSlug}_${stamp}.xlsx`);
}

export function renderShortlistView(){
  const wrap = el('div', {class:'fade-in', style:'width:100%;max-width:1400px;display:flex;flex-direction:column;gap:10px;'});
  const items = sortByFit(loadShortlist());
  const listInfo = currentShortlistInfo();
  const listName = el('input', {type:'text', value:listInfo.name, placeholder:'Nombre de la lista', title:'Nombre de esta lista de seguimiento', style:'width:min(300px,100%);font-size:12px;padding:8px 9px;'});
  listName.addEventListener('change', e => { renameCurrentShortlist(e.target.value); renderMain(); });
  wrap.appendChild(el('div', {style:'background:var(--panel-2);border:1px solid var(--border);border-radius:14px;padding:16px 20px;'}, [
    el('div', {style:'display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;'}, [
      el('div', {}, [
        el('div', {text:`Seguimiento · ${listInfo.name} (${items.length})`, style:'font-family:var(--font-display);font-size:16px;font-weight:700;color:var(--ink);'}),
        el('div', {text:`Lista vinculada a: ${listInfo.sourceName || 'datos actuales'} · ordenada por Fit.`, style:'font-size:11px;color:var(--ink-faint);margin-top:4px;'}),
      ]),
      el('label', {style:'display:flex;flex-direction:column;gap:4px;font-size:10px;color:var(--ink-faint);min-width:220px;'}, [el('span', {text:'NOMBRE DE LA LISTA'}), listName]),
    ]),
  ]));
  if(!items.length){
    wrap.appendChild(el('div', {class:'helptext', text:'Todavía no hay jugadores en seguimiento. Podés añadirlos desde la rueda individual o desde el ranking de perfil.'}));
    return wrap;
  }

  const statusFilter = el('select', {style:'max-width:220px;'});
  statusFilter.appendChild(el('option', {value:'', text:'Todos los estados'}));
  STATES.forEach(s => statusFilter.appendChild(el('option', {value:s, text:s})));
  const table = el('div', {style:'background:var(--panel-2);border:1px solid var(--border);border-radius:14px;padding:12px;overflow-x:auto;'});
  const renderTable = () => {
    table.innerHTML = '';
    const filtered = rankedByFit(loadShortlist())
      .filter(({item}) => !statusFilter.value || item.status === statusFilter.value);
    const head = el('div', {style:'display:grid;grid-template-columns:48px minmax(180px,1.25fr) minmax(105px,.75fr) minmax(125px,.95fr) 65px 88px 80px minmax(150px,1fr) 135px 85px 34px;gap:9px;padding:0 8px 8px;min-width:1320px;border-bottom:1px solid var(--border);'},
      ['PUESTO','JUGADOR','CLUB','PERFIL','FIT','MINUTOS','PARTIDOS','RIVALES','ESTADO','NOTA','FECHA',''].map(t => el('span', {text:t, style:'font-size:9px;color:var(--ink-faint);letter-spacing:.4px;'})));
    table.appendChild(head);
    filtered.forEach(({item, fitRank}) => {
      const row = el('div', {style:'display:grid;grid-template-columns:48px minmax(180px,1.25fr) minmax(105px,.75fr) minmax(125px,.95fr) 65px 88px 80px minmax(150px,1fr) 135px 85px 34px;gap:9px;align-items:center;padding:8px;min-width:1320px;border-bottom:1px solid #1c2334;'});
      const player = el('button', {class:'btn', text:item.name || 'Jugador', style:'text-align:left;padding:4px 0;border:0;background:transparent;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', onclick:()=>openPlayer(item)});
      const status = el('select', {style:`padding:6px 8px;border-color:${stateColor(item.status)};color:${stateColor(item.status)};font-size:11px;`});
      STATES.forEach(s => status.appendChild(el('option', {value:s, text:s, selected:item.status===s})));
      status.addEventListener('change', e => { updateShortlistItem(item.key, {status:e.target.value}); renderTable(); });
      const note = el('input', {type:'text', value:item.note || '', placeholder:'Nota rápida…', style:'font-size:11px;padding:6px 8px;'});
      note.addEventListener('change', e => { updateShortlistItem(item.key, {note:e.target.value}); });
      const matches = el('input', {type:'number', min:'0', step:'1', value:item.matchesWatched ?? '', placeholder:'0', title:'Partidos vistos', style:'font-size:11px;padding:6px 8px;width:100%;'});
      matches.addEventListener('change', e => {
        const raw = e.target.value.trim();
        updateShortlistItem(item.key, {matchesWatched:raw === '' ? '' : Math.max(0, Math.round(Number(raw) || 0))});
      });
      const rivals = el('input', {type:'text', value:item.rivals || '', placeholder:'Rivales vistos…', title:'Rivales vistos', style:'font-size:11px;padding:6px 8px;width:100%;'});
      rivals.addEventListener('change', e => { updateShortlistItem(item.key, {rivals:e.target.value}); });
      row.appendChild(el('span', {text:'#' + fitRank, title:'Puesto global dentro de Seguimiento por Fit', style:'font-family:var(--font-mono);font-size:11px;color:var(--ink-faint);'}));
      row.appendChild(player);
      row.appendChild(el('span', {text:item.team || '—', style:'font-size:11px;color:var(--ink-dim);'}));
      row.appendChild(el('span', {text:item.profile || '—', style:'font-size:11px;color:var(--ink-dim);'}));
      row.appendChild(el('span', {text:item.fit === null || item.fit === undefined ? '—' : `${Math.round(item.fit)}%`, style:'font-family:var(--font-mono);font-size:11px;color:var(--gold);font-weight:700;'}));
      row.appendChild(el('span', {text:item.minutes === null || item.minutes === undefined ? '—' : `${Math.round(item.minutes)} min`, style:'font-family:var(--font-mono);font-size:11px;color:var(--ink-dim);'}));
      row.appendChild(matches);
      row.appendChild(rivals);
      row.appendChild(status);
      row.appendChild(note);
      row.appendChild(el('span', {text:fmtDate(item.addedAt), style:'font-size:10px;color:var(--ink-faint);'}));
      row.appendChild(el('button', {class:'btn-icon', html:'&times;', title:'Quitar de seguimiento', onclick:()=>removeItem(item)}));
      table.appendChild(row);
    });
    if(!filtered.length) table.appendChild(el('div', {class:'helptext', text:'No hay jugadores con ese estado.', style:'padding:14px;'}));
  };
  statusFilter.addEventListener('change', renderTable);
  const viewButton = (view, label) => el('button', {
    class:'btn btn-sm', text:label,
    style:state.shortlistView===view ? 'color:var(--gold);border-color:var(--gold);background:var(--gold-soft);' : '',
    'aria-pressed':state.shortlistView===view ? 'true' : 'false',
    onclick:()=>{ state.shortlistView=view; renderMain(); },
  });
  wrap.appendChild(el('div', {style:'display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;'}, [
    el('div', {style:'display:flex;gap:6px;'}, [viewButton('table', 'Tabla'), viewButton('kanban', 'Situación de scouting')]),
    el('div', {style:'display:flex;gap:8px;flex-wrap:wrap;'}, [
      state.shortlistView==='table' ? statusFilter : null,
      el('button', {class:'btn btn-gold', text:'Exportar Excel', onclick:exportShortlistToExcel}),
    ]),
  ]));
  if(state.shortlistView==='kanban') wrap.appendChild(renderKanbanBoard());
  else { renderTable(); wrap.appendChild(table); }
  return wrap;
}
