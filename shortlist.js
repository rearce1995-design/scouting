/* Seguimiento persistente: el puente entre el ranking estadístico y la
   decisión de scouting. Vive en localStorage para no requerir backend. */
import {
  state, el, loadShortlist, updateShortlistItem, removeShortlistItem,
  selectPlayerForWheel, renderMain,
} from './app.js';

const STATES = ['Pendiente', 'Ver video', 'Evaluado', 'Recomendado', 'Descartado'];

function fmtDate(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('es-AR');
}
function stateColor(status){
  return ({'Pendiente':'var(--amber)', 'Ver video':'var(--blue)', 'Evaluado':'var(--gold)', 'Recomendado':'var(--green)', 'Descartado':'var(--red)'})[status] || 'var(--ink-dim)';
}
function findRow(item){
  return state.rows.find(r => {
    const name = state.playerCol ? String(r[state.playerCol] ?? '').trim() : '';
    const team = state.teamCol ? String(r[state.teamCol] ?? '').trim() : '';
    const age = state.ageCol ? String(r[state.ageCol] ?? '').trim() : '';
    return `${name}|${team}|${age}`.toLowerCase() === item.key;
  });
}

function exportShortlistToExcel(){
  if(!window.XLSX){
    alert('No se pudo cargar la herramienta de exportación. Revisá tu conexión e intentá de nuevo.');
    return;
  }
  const rows = loadShortlist()
    .sort((a,b) => String(b.updatedAt || b.addedAt).localeCompare(String(a.updatedAt || a.addedAt)))
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
    {wch:20}, {wch:18}, {wch:18}, {wch:18}, {wch:12}, {wch:15}, {wch:20}, {wch:70},
  ];
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, sheet, 'Seguimiento');
  const stamp = new Date().toISOString().slice(0,10);
  window.XLSX.writeFile(workbook, `seguimiento_scouting_${stamp}.xlsx`);
}

export function renderShortlistView(){
  const wrap = el('div', {class:'fade-in', style:'width:100%;max-width:1400px;display:flex;flex-direction:column;gap:10px;'});
  const items = loadShortlist().sort((a,b) => String(b.updatedAt || b.addedAt).localeCompare(String(a.updatedAt || a.addedAt)));
  wrap.appendChild(el('div', {style:'background:var(--panel-2);border:1px solid var(--border);border-radius:14px;padding:16px 20px;'}, [
    el('div', {text:`Seguimiento (${items.length})`, style:'font-family:var(--font-display);font-size:16px;font-weight:700;color:var(--ink);'}),
    el('div', {text:'Decisiones, video y observaciones guardadas en este navegador.', style:'font-size:11px;color:var(--ink-faint);margin-top:4px;'}),
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
    const filtered = loadShortlist()
      .sort((a,b) => String(b.updatedAt || b.addedAt).localeCompare(String(a.updatedAt || a.addedAt)))
      .filter(item => !statusFilter.value || item.status === statusFilter.value);
    const head = el('div', {style:'display:grid;grid-template-columns:minmax(180px,1.4fr) minmax(110px,.8fr) minmax(130px,1fr) 70px 95px 145px minmax(160px,1.2fr) 90px 34px;gap:9px;padding:0 8px 8px;min-width:1080px;border-bottom:1px solid var(--border);'},
      ['JUGADOR','CLUB','PERFIL','FIT','MINUTOS','ESTADO','NOTA','FECHA',''].map(t => el('span', {text:t, style:'font-size:9px;color:var(--ink-faint);letter-spacing:.4px;'})));
    table.appendChild(head);
    filtered.forEach(item => {
      const row = el('div', {style:'display:grid;grid-template-columns:minmax(180px,1.4fr) minmax(110px,.8fr) minmax(130px,1fr) 70px 95px 145px minmax(160px,1.2fr) 90px 34px;gap:9px;align-items:center;padding:8px;min-width:1080px;border-bottom:1px solid #1c2334;'});
      const player = el('button', {class:'btn', text:item.name || 'Jugador', style:'text-align:left;padding:4px 0;border:0;background:transparent;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', onclick:()=>{
        const source = findRow(item);
        if(source) selectPlayerForWheel(source);
        else alert('Este jugador no está en la tabla cargada actualmente. Sus notas siguen guardadas en seguimiento.');
      }});
      const status = el('select', {style:`padding:6px 8px;border-color:${stateColor(item.status)};color:${stateColor(item.status)};font-size:11px;`});
      STATES.forEach(s => status.appendChild(el('option', {value:s, text:s, selected:item.status===s})));
      status.addEventListener('change', e => { updateShortlistItem(item.key, {status:e.target.value}); renderTable(); });
      const note = el('input', {type:'text', value:item.note || '', placeholder:'Nota rápida…', style:'font-size:11px;padding:6px 8px;'});
      note.addEventListener('change', e => { updateShortlistItem(item.key, {note:e.target.value}); });
      row.appendChild(player);
      row.appendChild(el('span', {text:item.team || '—', style:'font-size:11px;color:var(--ink-dim);'}));
      row.appendChild(el('span', {text:item.profile || '—', style:'font-size:11px;color:var(--ink-dim);'}));
      row.appendChild(el('span', {text:item.fit === null || item.fit === undefined ? '—' : `${Math.round(item.fit)}%`, style:'font-family:var(--font-mono);font-size:11px;color:var(--gold);font-weight:700;'}));
      row.appendChild(el('span', {text:item.minutes === null || item.minutes === undefined ? '—' : `${Math.round(item.minutes)} min`, style:'font-family:var(--font-mono);font-size:11px;color:var(--ink-dim);'}));
      row.appendChild(status);
      row.appendChild(note);
      row.appendChild(el('span', {text:fmtDate(item.addedAt), style:'font-size:10px;color:var(--ink-faint);'}));
      row.appendChild(el('button', {class:'btn-icon', html:'&times;', title:'Quitar de seguimiento', onclick:()=>{ if(confirm(`¿Quitar a ${item.name} del seguimiento?`)){ removeShortlistItem(item.key); renderMain(); } }}));
      table.appendChild(row);
    });
    if(!filtered.length) table.appendChild(el('div', {class:'helptext', text:'No hay jugadores con ese estado.', style:'padding:14px;'}));
  };
  statusFilter.addEventListener('change', renderTable);
  wrap.appendChild(el('div', {style:'display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;'}, [
    statusFilter,
    el('button', {class:'btn btn-gold', text:'Exportar Excel', onclick:exportShortlistToExcel}),
  ]));
  renderTable();
  wrap.appendChild(table);
  return wrap;
}
