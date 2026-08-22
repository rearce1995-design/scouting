// Presets de posiciones y roles para la rueda de percentiles.
export const PRESETS = [];

export function M(aliases, label, opts = {}) {
  return { aliases, label, invert: !!opts.invert, wide: !!opts.wide };
}
export function C(name, metrics, opts = {}) {
  return { name, metrics, physical: !!opts.physical };
}
export function disciplineCat() {
  return C('Disciplina', [
    M(['fouls per 90'], 'Faltas', { invert:true }),
    M(['yellow cards per 90'], 'Amarillas', { invert:true }),
    M(['red cards per 90'], 'Rojas', { invert:true }),
  ]);
}
export function withDiscipline(cats) { return [...cats, disciplineCat()]; }

// Alias habituales de exportaciones Wyscout. Se incluyen variantes para
// mantener compatibilidad con nombres de columna de distintas exportaciones.
export const A = {
  saveRate: ['save rate, %', 'save rate %', 'save rate'],
  prevGoals: ['prevented goals per 90', 'goals prevented per 90', 'goals prevented'],
  saves: ['saves per 90'], cleanSheets: ['clean sheets, %', 'clean sheets %'],
  exits: ['exits per 90'], aerialDuels: ['aerial duels per 90'], aerialDuelsWon: ['aerial duels won, %', 'aerial duels won %'],
  passes: ['passes per 90', 'passes'], accPasses: ['accurate passes, %', 'accurate passes %'],
  longPasses: ['long passes per 90', 'long passes'], accLongPasses: ['accurate long passes, %', 'accurate long passes %'],
  // Wyscout no exporta "Recoveries" ni "Clearances" como columnas propias.
  // Se mantienen estos alias por si algún export externo sí las trae, pero
  // los presets ya no los usan por defecto (ver padjInterceptions / padjSlidingTackles).
  recoveries: ['recoveries per 90', 'recoveries'],
  padjInterceptions: ['padj interceptions'],
  padjSlidingTackles: ['padj sliding tackles'],
  shotsAgainst: ['shots against per 90', 'shots against'],
  cleanSheetsCount: ['clean sheets'],
  defActionsOutsideArea: ['defensive actions outside area per 90', 'defensive actions outside area'],
  progPasses: ['progressive passes per 90', 'progressive passes'], accProgPasses: ['accurate progressive passes, %', 'accurate progressive passes %'],
  passesFinalThird: ['passes to final third per 90', 'passes to final third'],
  forwardPasses: ['forward passes per 90', 'forward passes'],
  smartPasses: ['smart passes per 90', 'smart passes'],
  defDuels: ['defensive duels per 90', 'defensive duels'], defDuelsWon: ['defensive duels won, %', 'defensive duels won %'],
  successfulDefActions: ['successful defensive actions per 90', 'successful defensive actions'],
  // OJO: si el export no trae una columna "Defensive actions per 90" propia,
  // el fallback por substring de findColumnByAliases() puede matchear por
  // error "Successful defensive actions per 90". Preferir 'successfulDefActions'
  // salvo que confirmes que tu export trae ambas columnas por separado.
  defActions: ['defensive actions per 90', 'defensive actions'],
  interceptions: ['interceptions per 90', 'interceptions'], clearances: ['clearances per 90', 'clearances'],
  blocks: ['blocks per 90', 'blocks', 'shots blocked per 90'],
  progRuns: ['progressive runs per 90', 'progressive runs'], crosses: ['crosses per 90', 'crosses'],
  accCrosses: ['accurate crosses, %', 'accurate crosses %'], deepCompletedCrosses: ['deep completed crosses per 90', 'deep completed crosses'],
  touchesFinalThird: ['touches in final third per 90', 'touches in final third'], deepCompletions: ['deep completions per 90', 'deep completions'],
  crossesToGoalieBox: ['crosses to goalie box per 90', 'crosses to goalie box'], keyPasses: ['key passes per 90', 'key passes'],
  xA: ['xa per 90', 'xa'], shotAssists: ['shot assists per 90', 'shot assists'],
  successfulDribbles: ['successful dribbles, %', 'successful dribbles %'],
  throughPasses: ['through passes per 90', 'through passes'], slidingTackles: ['sliding tackles per 90', 'sliding tackles'],
  fouls: ['fouls per 90', 'fouls'],
  goals: ['goals per 90', 'goals'], npGoals: ['non-penalty goals per 90', 'non penalty goals per 90'],
  xG: ['xg per 90', 'xg'], shots: ['shots per 90', 'shots'], touchesBox: ['touches in box per 90', 'touches in box'],
  dribbles: ['dribbles per 90', 'dribbles'], offDuels: ['offensive duels per 90', 'offensive duels'], offDuelsWon: ['offensive duels won, %', 'offensive duels won %'],
  passesPenaltyArea: ['passes to penalty area per 90', 'passes to penalty area'], foulsSuffered: ['fouls suffered per 90', 'fouls suffered'],
  shotsOnTarget: ['shots on target, %', 'shots on target %'], goalConversion: ['goal conversion, %', 'goal conversion %'],
  receivedPasses: ['received passes per 90', 'received passes', 'passes received per 90', 'passes received'],
  receivedLongPasses: ['received long passes per 90', 'received long passes'], headGoals: ['head goals per 90', 'head goals'],
  recoveriesOppHalf: ['recoveries in opposition half per 90', 'recoveries in opposition half'],
  accelerations: ['accelerations per 90', 'accelerations'],
};

export const PHYS = {
  maxSpeed: ['max speed'], hiDistance: ['hi distance per 90', 'hi distance'],
  sprintingDistance: ['sprinting distance per 90', 'sprint distance per 90', 'sprint distance'],
  countHighAccel: ['count high acceleration per 90', 'high accelerations per 90', 'high accelerations'],
  accelerations: ['accelerations per 90', 'accelerations'],
};

const W = (key, label, opts) => M(A[key], label, opts);
const G = (key, label, opts) => M(PHYS[key], label, opts);
const SECTION_LABELS = {
  'Portero': ['Atajadas y cobertura', 'Distribución', 'Juego aéreo y recuperación'],
  'Central': ['Defensa y duelos', 'Salida de balón', 'Cobertura'],
  'Lateral': ['Defensa y recuperación', 'Progresión', 'Creación y profundidad'],
  'Mediocentro Defensivo': ['Recuperación y duelos', 'Distribución', 'Control'],
  'Interior': ['Equilibrio y recuperación', 'Progresión', 'Llegada y creación'],
  'Mediapunta': ['Creación', 'Progresión y desequilibrio', 'Llegada al área'],
  'Extremo': ['Desborde', 'Creación y profundidad', 'Finalización'],
  'Delantero': ['Finalización', 'Juego asociativo', 'Duelos y presión'],
};

// ANTES: sectionsFor cortaba la lista de métricas en 3 tercios automáticos
// por posición en el array (metrics.slice(0,n/3) etc.) y les pegaba las
// etiquetas de SECTION_LABELS en orden fijo. Eso rompía apenas el autor
// escribía las métricas en un orden distinto al que asumía la función
// (ej: "Central Constructor" arrancaba con métricas de pase y terminaba
// con métricas de duelos, entonces "Defensa y duelos" mostraba solo pases).
// AHORA: cada categoría recibe EXPLÍCITAMENTE su propio array de métricas,
// sin adivinar nada por posición.
function sectionsFor(position, groups, customLabels) {
  const labels = customLabels || SECTION_LABELS[position] || ['Bloque 1', 'Bloque 2', 'Bloque 3'];
  return groups
    .map((metrics, i) => C(labels[i] || `Bloque ${i + 1}`, metrics))
    .filter(section => section.metrics.length);
}

// `groups` ahora es un array de arrays: uno por categoría, en el mismo
// orden que las labels de esa posición (o de `opts.labels` si se customizan).
const role = (position, name, groups, gps, opts = {}) => ({
  position, role: name,
  categories: [...sectionsFor(position, groups, opts.labels), C('GPS', gps, { physical: true })],
});

PRESETS.push(
  role('Portero', 'Portero Tradicional', [
    [W('saveRate', 'Save %'), W('prevGoals', 'Goals prevented', {wide:true}), W('shotsAgainst', 'Shots against'), W('cleanSheetsCount', 'Clean sheets')],
    [W('accPasses', 'Accurate passes %'), W('longPasses', 'Long passes per 90'), W('accLongPasses', 'Accurate long passes %'), W('passes', 'Passes per 90')],
    [W('exits', 'Exits per 90'), W('aerialDuelsWon', 'Aerial duels won %'), W('padjInterceptions', 'PAdj Interceptions')],
  ], [G('maxSpeed', 'Max Speed'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'Count High Accelerations'), G('sprintingDistance', 'Sprint Distance')]),
  role('Portero', 'Portero Líbero', [
    [W('saveRate', 'Save %'), W('prevGoals', 'Goals prevented'), W('aerialDuelsWon', 'Aerial duels won %'), W('exits', 'Exits per 90')],
    [W('passes', 'Passes per 90'), W('accPasses', 'Accurate passes %'), W('longPasses', 'Long passes per 90'), W('accLongPasses', 'Accurate long passes %')],
    [W('progPasses', 'Progressive passes'), W('passesFinalThird', 'Passes to final third'), W('padjInterceptions', 'PAdj Interceptions')],
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('accelerations', 'Accelerations')],
    { labels: ['Atajadas y cobertura', 'Distribución', 'Progresión y recuperación'] }),

  role('Central', 'Central Defensivo', [
    [W('successfulDefActions', 'Successful defensive actions'), W('defDuels', 'Defensive duels'), W('defDuelsWon', 'Defensive duels won %'), W('aerialDuels', 'Aerial duels'), W('aerialDuelsWon', 'Aerial duels won %')],
    [W('passes', 'Passes per 90'), W('accPasses', 'Accurate passes %')],
    [W('interceptions', 'Interceptions'), W('padjInterceptions', 'PAdj Interceptions'), W('padjSlidingTackles', 'PAdj Sliding tackles'), W('blocks', 'Blocks')],
  ], [G('hiDistance', 'HI Distance'), G('sprintingDistance', 'Sprint Distance'), G('maxSpeed', 'Max Speed'), G('countHighAccel', 'High Accelerations')]),
  role('Central', 'Central Constructor', [
    [W('defDuelsWon', 'Defensive duels won %'), W('interceptions', 'Interceptions'), W('padjInterceptions', 'PAdj Interceptions')],
    [W('progPasses', 'Progressive passes'), W('accProgPasses', 'Accurate progressive passes %'), W('passesFinalThird', 'Passes to final third'), W('forwardPasses', 'Forward passes')],
    [W('smartPasses', 'Smart passes'), W('longPasses', 'Long passes'), W('accLongPasses', 'Accurate long passes %'), W('accPasses', 'Accurate passes %')],
  ], [G('hiDistance', 'HI Distance'), G('sprintingDistance', 'Sprint Distance'), G('maxSpeed', 'Max Speed'), G('countHighAccel', 'High Accelerations')],
    { labels: ['Defensa y duelos', 'Salida de balón', 'Distribución'] }),

  role('Lateral', 'Lateral Clásico', [
    [W('successfulDefActions', 'Successful defensive actions'), W('defDuelsWon', 'Defensive duels won %'), W('interceptions', 'Interceptions'), W('padjInterceptions', 'PAdj Interceptions')],
    [W('progRuns', 'Progressive runs'), W('progPasses', 'Progressive passes'), W('crosses', 'Crosses'), W('accCrosses', 'Accurate crosses %')],
    [W('deepCompletedCrosses', 'Deep completed crosses'), W('passesFinalThird', 'Passes to final third'), W('xA', 'xA')],
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')]),
  role('Lateral', 'Carrilero', [
    [W('progRuns', 'Progressive runs'), W('progPasses', 'Progressive passes'), W('passesFinalThird', 'Passes to final third'), W('deepCompletions', 'Deep completions')],
    [W('crosses', 'Crosses'), W('accCrosses', 'Accurate crosses %'), W('crossesToGoalieBox', 'Crosses to goalie box'), W('keyPasses', 'Key passes')],
    [W('xA', 'xA'), W('shotAssists', 'Shot assists'), W('successfulDribbles', 'Successful dribbles %')],
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')],
    { labels: ['Progresión', 'Creación y centros', 'Desborde y llegada'] }),
  role('Lateral', 'Lateral Invertido', [
    [W('successfulDefActions', 'Successful defensive actions'), W('interceptions', 'Interceptions'), W('padjInterceptions', 'PAdj Interceptions')],
    [W('passes', 'Passes per 90'), W('accPasses', 'Accurate passes %'), W('progPasses', 'Progressive passes'), W('progRuns', 'Progressive runs')],
    [W('accProgPasses', 'Accurate progressive passes %'), W('smartPasses', 'Smart passes'), W('passesFinalThird', 'Passes to final third'), W('throughPasses', 'Through passes')],
  ], [G('hiDistance', 'HI Distance'), G('sprintingDistance', 'Sprint Distance'), G('maxSpeed', 'Max Speed'), G('countHighAccel', 'High Accelerations')]),

  role('Mediocentro Defensivo', 'Recuperador', [
    [W('successfulDefActions', 'Successful defensive actions'), W('defDuelsWon', 'Defensive duels won %'), W('interceptions', 'Interceptions'), W('padjInterceptions', 'PAdj Interceptions'), W('slidingTackles', 'Sliding tackles'), W('aerialDuelsWon', 'Aerial duels won %')],
    [W('progPasses', 'Progressive passes'), W('accPasses', 'Accurate passes %'), W('longPasses', 'Long passes')],
    [W('accLongPasses', 'Accurate long passes %'), W('fouls', 'Fouls', {invert:true})],
  ], [G('hiDistance', 'HI Distance'), G('sprintingDistance', 'Sprint Distance'), G('maxSpeed', 'Max Speed'), G('countHighAccel', 'High Accelerations')]),
  role('Mediocentro Defensivo', 'Regista', [
    [W('padjInterceptions', 'PAdj Interceptions'), W('interceptions', 'Interceptions')],
    [W('passes', 'Passes'), W('accPasses', 'Accurate passes %'), W('longPasses', 'Long passes'), W('accLongPasses', 'Accurate long passes %'), W('progPasses', 'Progressive passes')],
    [W('smartPasses', 'Smart passes'), W('throughPasses', 'Through passes'), W('passesFinalThird', 'Passes to final third'), W('accProgPasses', 'Accurate progressive passes %')],
  ], [G('hiDistance', 'HI Distance'), G('sprintingDistance', 'Sprint Distance'), G('maxSpeed', 'Max Speed'), G('countHighAccel', 'High Accelerations')],
    { labels: ['Recuperación', 'Distribución', 'Creación'] }),

  role('Interior', 'Box to Box', [
    [W('successfulDefActions', 'Successful defensive actions'), W('padjInterceptions', 'PAdj Interceptions')],
    [W('progRuns', 'Progressive runs'), W('progPasses', 'Progressive passes')],
    [W('xG', 'xG'), W('goals', 'Goals'), W('xA', 'xA'), W('keyPasses', 'Key passes'), W('shotAssists', 'Shot assists'), W('touchesBox', 'Touches in box'), W('successfulDribbles', 'Successful dribbles %')],
  ], [G('hiDistance', 'HI Distance'), G('sprintingDistance', 'Sprint Distance'), G('maxSpeed', 'Max Speed'), G('countHighAccel', 'High Accelerations')]),
  role('Interior', 'Organizador', [
    [W('padjInterceptions', 'PAdj Interceptions'), W('interceptions', 'Interceptions')],
    [W('passes', 'Passes'), W('accPasses', 'Accurate passes %'), W('progPasses', 'Progressive passes'), W('accProgPasses', 'Accurate progressive passes %'), W('passesFinalThird', 'Passes to final third')],
    [W('smartPasses', 'Smart passes'), W('throughPasses', 'Through passes'), W('keyPasses', 'Key passes'), W('xA', 'xA')],
  ], [G('hiDistance', 'HI Distance'), G('sprintingDistance', 'Sprint Distance'), G('maxSpeed', 'Max Speed'), G('countHighAccel', 'High Accelerations')]),
  role('Interior', 'Llegador', [
    [W('progRuns', 'Progressive runs'), W('offDuelsWon', 'Offensive duels won %'), W('touchesBox', 'Touches in box')],
    [W('goals', 'Goals'), W('npGoals', 'Non penalty goals'), W('xG', 'xG'), W('shots', 'Shots')],
    [W('keyPasses', 'Key passes'), W('xA', 'xA'), W('shotAssists', 'Shot assists'), W('successfulDribbles', 'Successful dribbles %')],
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')],
    { labels: ['Movilidad y duelos', 'Finalización', 'Creación'] }),

  role('Mediapunta', 'Enganche', [
    [W('keyPasses', 'Key passes'), W('smartPasses', 'Smart passes'), W('throughPasses', 'Through passes'), W('xA', 'xA')],
    [W('progPasses', 'Progressive passes'), W('accPasses', 'Accurate passes %'), W('successfulDribbles', 'Successful dribbles %'), W('foulsSuffered', 'Fouls suffered')],
    [W('shotAssists', 'Shot assists'), W('passesPenaltyArea', 'Passes to penalty area'), W('deepCompletions', 'Deep completions')],
  ], [G('hiDistance', 'HI Distance'), G('sprintingDistance', 'Sprint Distance'), G('maxSpeed', 'Max Speed'), G('countHighAccel', 'High Accelerations')]),
  role('Mediapunta', 'Segundo Punta', [
    [W('xA', 'xA'), W('keyPasses', 'Key passes'), W('shotAssists', 'Shot assists'), W('throughPasses', 'Through passes')],
    [W('progRuns', 'Progressive runs'), W('dribbles', 'Dribbles'), W('successfulDribbles', 'Successful dribbles %'), W('offDuelsWon', 'Offensive duels won %')],
    [W('goals', 'Goals'), W('xG', 'xG'), W('touchesBox', 'Touches in box')],
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')]),

  role('Extremo', 'Extremo Clásico', [
    [W('dribbles', 'Dribbles'), W('successfulDribbles', 'Successful dribbles %'), W('progRuns', 'Progressive runs'), W('foulsSuffered', 'Fouls suffered')],
    [W('crosses', 'Crosses'), W('accCrosses', 'Accurate crosses %'), W('deepCompletedCrosses', 'Deep completed crosses'), W('crossesToGoalieBox', 'Crosses to goalie box')],
    [W('xA', 'xA'), W('keyPasses', 'Key passes'), W('shotAssists', 'Shot assists')],
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')],
    { labels: ['Desborde', 'Creación y profundidad', 'Asociación y asistencias'] }),
  role('Extremo', 'Extremo Invertido', [
    [W('progRuns', 'Progressive runs'), W('dribbles', 'Dribbles'), W('successfulDribbles', 'Successful dribbles %'), W('touchesBox', 'Touches in box')],
    [W('passesPenaltyArea', 'Passes to penalty area'), W('throughPasses', 'Through passes'), W('xA', 'xA')],
    [W('goals', 'Goals'), W('npGoals', 'Non penalty goals'), W('xG', 'xG'), W('shots', 'Shots')],
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')]),
  role('Extremo', 'Extremo Creador', [
    [W('progRuns', 'Progressive runs'), W('successfulDribbles', 'Successful dribbles %')],
    [W('xA', 'xA'), W('keyPasses', 'Key passes'), W('smartPasses', 'Smart passes'), W('throughPasses', 'Through passes'), W('passesFinalThird', 'Passes to final third')],
    [W('shotAssists', 'Shot assists'), W('progPasses', 'Progressive passes'), W('deepCompletions', 'Deep completions'), W('accPasses', 'Accurate passes %')],
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')],
    { labels: ['Desborde', 'Creación y profundidad', 'Asociación y pase'] }),

  role('Delantero', 'Poacher', [
    [W('goals', 'Goals'), W('npGoals', 'Non penalty goals'), W('xG', 'xG'), W('shots', 'Shots'), W('shotsOnTarget', 'Shots on target %'), W('goalConversion', 'Goal conversion %'), W('headGoals', 'Head goals')],
    [W('touchesBox', 'Touches in box'), W('receivedPasses', 'Received passes')],
    [W('offDuelsWon', 'Offensive duels won %'), W('aerialDuelsWon', 'Aerial duels won %')],
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')]),
  role('Delantero', 'Target Man', [
    [W('headGoals', 'Head goals'), W('goals', 'Goals'), W('xG', 'xG')],
    [W('keyPasses', 'Key passes'), W('receivedPasses', 'Passes received'), W('receivedLongPasses', 'Received long passes')],
    [W('offDuels', 'Offensive duels'), W('offDuelsWon', 'Offensive duels won %'), W('aerialDuels', 'Aerial duels'), W('aerialDuelsWon', 'Aerial duels won %'), W('foulsSuffered', 'Fouls suffered')],
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')]),
  role('Delantero', 'Falso 9', [
    [W('receivedPasses', 'Received passes'), W('passes', 'Passes'), W('accPasses', 'Accurate passes %')],
    [W('smartPasses', 'Smart passes'), W('throughPasses', 'Through passes'), W('deepCompletions', 'Deep completions'), W('successfulDribbles', 'Successful dribbles %')],
    [W('keyPasses', 'Key passes'), W('xA', 'xA'), W('passesPenaltyArea', 'Passes to penalty area'), W('foulsSuffered', 'Fouls suffered')],
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')],
    { labels: ['Recepción y control', 'Juego asociativo', 'Creación'] }),
  role('Delantero', 'Pressing Forward', [
    [W('xG', 'xG'), W('goals', 'Goals'), W('shots', 'Shots'), W('touchesBox', 'Touches in box')],
    [W('progRuns', 'Progressive runs'), W('accelerations', 'Accelerations per 90'), W('foulsSuffered', 'Fouls suffered')],
    [W('successfulDefActions', 'Successful defensive actions'), W('defDuels', 'Defensive duels'), W('padjInterceptions', 'PAdj Interceptions'), W('offDuelsWon', 'Offensive duels won %')],
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')],
    { labels: ['Finalización', 'Movilidad y transición', 'Duelos y presión'] }),

  { position:'Personalizado', role:'Crear mi propia selección', custom:true, categories:[C('Mi categoría', [])] },
);

/* Hipótesis base explícitas por rol. Son el punto de partida reproducible
   del departamento (no una gradiente derivada del orden de categorías);
   cada scout puede ajustarlas y guardar su propio perfil encima. */
const ROLE_BASE_WEIGHTS = {
  'Portero|Portero Tradicional':[55,25,20], 'Portero|Portero Líbero':[40,35,25],
  'Central|Central Defensivo':[55,15,30], 'Central|Central Constructor':[25,45,30],
  'Lateral|Lateral Clásico':[40,35,25], 'Lateral|Carrilero':[30,45,25], 'Lateral|Lateral Invertido':[35,40,25],
  'Mediocentro Defensivo|Recuperador':[55,30,15], 'Mediocentro Defensivo|Regista':[25,45,30],
  'Interior|Box to Box':[30,35,35], 'Interior|Organizador':[20,45,35], 'Interior|Llegador':[25,45,30],
  'Mediapunta|Enganche':[45,35,20], 'Mediapunta|Segundo Punta':[30,35,35],
  'Extremo|Extremo Clásico':[40,35,25], 'Extremo|Extremo Invertido':[35,30,35], 'Extremo|Extremo Creador':[25,50,25],
  'Delantero|Poacher':[60,20,20], 'Delantero|Target Man':[40,20,40], 'Delantero|Falso 9':[30,45,25], 'Delantero|Pressing Forward':[40,25,35],
};
PRESETS.forEach(preset => {
  const weights = ROLE_BASE_WEIGHTS[`${preset.position}|${preset.role}`];
  if(!weights) return;
  preset.categories.forEach((category, index) => {
    // GPS es opt-in: no altera la hipótesis táctica base hasta que el scout
    // le asigne peso explícitamente.
    category.baseWeight = category.physical ? 0 : (weights[index] ?? 0);
  });
});
