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

function sectionsFor(position, metrics) {
  const labels = SECTION_LABELS[position] || ['Bloque 1', 'Bloque 2', 'Bloque 3'];
  const firstEnd = Math.ceil(metrics.length / 3);
  const secondEnd = Math.ceil(metrics.length * 2 / 3);
  return [
    C(labels[0], metrics.slice(0, firstEnd)),
    C(labels[1], metrics.slice(firstEnd, secondEnd)),
    C(labels[2], metrics.slice(secondEnd)),
  ].filter(section => section.metrics.length);
}

const role = (position, name, wyscout, gps) => ({
  position, role:name,
  categories: [...sectionsFor(position, wyscout), C('GPS', gps, { physical:true })],
});

PRESETS.push(
  role('Portero', 'Portero Tradicional', [
    W('saveRate', 'Save %'), W('prevGoals', 'Goals prevented', {wide:true}), W('shotsAgainst', 'Shots against'),
    W('cleanSheetsCount', 'Clean sheets'), W('exits', 'Exits per 90'), W('aerialDuelsWon', 'Aerial duels won %'),
    W('accPasses', 'Accurate passes %'), W('longPasses', 'Long passes per 90'), W('accLongPasses', 'Accurate long passes %'),
    W('passes', 'Passes per 90'), W('padjInterceptions', 'PAdj Interceptions'),
  ], [G('maxSpeed', 'Max Speed'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'Count High Accelerations'), G('sprintingDistance', 'Sprint Distance')]),
  role('Portero', 'Portero Líbero', [
    W('aerialDuelsWon', 'Aerial duels won %'), W('exits', 'Exits per 90'), W('progPasses', 'Progressive passes'),
    W('passesFinalThird', 'Passes to final third'), W('longPasses', 'Long passes per 90'), W('accLongPasses', 'Accurate long passes %'),
    W('accPasses', 'Accurate passes %'), W('passes', 'Passes per 90'), W('padjInterceptions', 'PAdj Interceptions'),
    W('prevGoals', 'Goals prevented'), W('saveRate', 'Save %'),
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('accelerations', 'Accelerations')]),

  role('Central', 'Central Defensivo', [
    W('successfulDefActions', 'Successful defensive actions'), W('defDuels', 'Defensive duels'), W('defDuelsWon', 'Defensive duels won %'),
    W('aerialDuels', 'Aerial duels'), W('aerialDuelsWon', 'Aerial duels won %'), W('interceptions', 'Interceptions'),
    W('padjInterceptions', 'PAdj Interceptions'), W('padjSlidingTackles', 'PAdj Sliding tackles'), W('blocks', 'Blocks'), W('passes', 'Passes per 90'), W('accPasses', 'Accurate passes %'),
  ], [G('hiDistance', 'HI Distance'), G('sprintingDistance', 'Sprint Distance'), G('maxSpeed', 'Max Speed'), G('countHighAccel', 'High Accelerations')]),
  role('Central', 'Central Constructor', [
    W('progPasses', 'Progressive passes'), W('accProgPasses', 'Accurate progressive passes %'), W('passesFinalThird', 'Passes to final third'),
    W('forwardPasses', 'Forward passes'), W('smartPasses', 'Smart passes'), W('longPasses', 'Long passes'),
    W('accLongPasses', 'Accurate long passes %'), W('accPasses', 'Accurate passes %'), W('defDuelsWon', 'Defensive duels won %'),
    W('interceptions', 'Interceptions'), W('padjInterceptions', 'PAdj Interceptions'),
  ], [G('hiDistance', 'HI Distance'), G('sprintingDistance', 'Sprint Distance'), G('maxSpeed', 'Max Speed'), G('countHighAccel', 'High Accelerations')]),

  role('Lateral', 'Lateral Clásico', [
    W('successfulDefActions', 'Successful defensive actions'), W('defDuelsWon', 'Defensive duels won %'), W('interceptions', 'Interceptions'),
    W('padjInterceptions', 'PAdj Interceptions'), W('progRuns', 'Progressive runs'), W('progPasses', 'Progressive passes'), W('crosses', 'Crosses'),
    W('accCrosses', 'Accurate crosses %'), W('deepCompletedCrosses', 'Deep completed crosses'), W('passesFinalThird', 'Passes to final third'), W('xA', 'xA'),
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')]),
  role('Lateral', 'Carrilero', [
    W('progRuns', 'Progressive runs'), W('progPasses', 'Progressive passes'), W('passesFinalThird', 'Passes to final third'),
    W('deepCompletions', 'Deep completions'), W('crosses', 'Crosses'), W('accCrosses', 'Accurate crosses %'),
    W('crossesToGoalieBox', 'Crosses to goalie box'), W('keyPasses', 'Key passes'), W('xA', 'xA'), W('shotAssists', 'Shot assists'), W('successfulDribbles', 'Successful dribbles %'),
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')]),
  role('Lateral', 'Lateral Invertido', [
    W('passes', 'Passes per 90'), W('accPasses', 'Accurate passes %'), W('progPasses', 'Progressive passes'),
    W('accProgPasses', 'Accurate progressive passes %'), W('smartPasses', 'Smart passes'), W('passesFinalThird', 'Passes to final third'),
    W('throughPasses', 'Through passes'), W('padjInterceptions', 'PAdj Interceptions'), W('successfulDefActions', 'Successful defensive actions'), W('interceptions', 'Interceptions'), W('progRuns', 'Progressive runs'),
  ], [G('hiDistance', 'HI Distance'), G('sprintingDistance', 'Sprint Distance'), G('maxSpeed', 'Max Speed'), G('countHighAccel', 'High Accelerations')]),

  role('Mediocentro Defensivo', 'Recuperador', [
    W('successfulDefActions', 'Successful defensive actions'), W('defDuelsWon', 'Defensive duels won %'), W('interceptions', 'Interceptions'),
    W('padjInterceptions', 'PAdj Interceptions'), W('slidingTackles', 'Sliding tackles'), W('aerialDuelsWon', 'Aerial duels won %'),
    W('progPasses', 'Progressive passes'), W('accPasses', 'Accurate passes %'), W('longPasses', 'Long passes'), W('accLongPasses', 'Accurate long passes %'), W('fouls', 'Fouls', {invert:true}),
  ], [G('hiDistance', 'HI Distance'), G('sprintingDistance', 'Sprint Distance'), G('maxSpeed', 'Max Speed'), G('countHighAccel', 'High Accelerations')]),
  role('Mediocentro Defensivo', 'Regista', [
    W('passes', 'Passes'), W('accPasses', 'Accurate passes %'), W('progPasses', 'Progressive passes'), W('accProgPasses', 'Accurate progressive passes %'),
    W('passesFinalThird', 'Passes to final third'), W('smartPasses', 'Smart passes'), W('throughPasses', 'Through passes'), W('longPasses', 'Long passes'),
    W('accLongPasses', 'Accurate long passes %'), W('padjInterceptions', 'PAdj Interceptions'), W('interceptions', 'Interceptions'),
  ], [G('hiDistance', 'HI Distance'), G('sprintingDistance', 'Sprint Distance'), G('maxSpeed', 'Max Speed'), G('countHighAccel', 'High Accelerations')]),

  role('Interior', 'Box to Box', [
    W('successfulDefActions', 'Successful defensive actions'), W('padjInterceptions', 'PAdj Interceptions'), W('progRuns', 'Progressive runs'),
    W('progPasses', 'Progressive passes'), W('xG', 'xG'), W('goals', 'Goals'), W('xA', 'xA'), W('keyPasses', 'Key passes'),
    W('shotAssists', 'Shot assists'), W('touchesBox', 'Touches in box'), W('successfulDribbles', 'Successful dribbles %'),
  ], [G('hiDistance', 'HI Distance'), G('sprintingDistance', 'Sprint Distance'), G('maxSpeed', 'Max Speed'), G('countHighAccel', 'High Accelerations')]),
  role('Interior', 'Organizador', [
    W('passes', 'Passes'), W('accPasses', 'Accurate passes %'), W('progPasses', 'Progressive passes'), W('accProgPasses', 'Accurate progressive passes %'),
    W('smartPasses', 'Smart passes'), W('throughPasses', 'Through passes'), W('keyPasses', 'Key passes'), W('xA', 'xA'),
    W('passesFinalThird', 'Passes to final third'), W('padjInterceptions', 'PAdj Interceptions'), W('interceptions', 'Interceptions'),
  ], [G('hiDistance', 'HI Distance'), G('sprintingDistance', 'Sprint Distance'), G('maxSpeed', 'Max Speed'), G('countHighAccel', 'High Accelerations')]),
  role('Interior', 'Llegador', [
    W('goals', 'Goals'), W('npGoals', 'Non penalty goals'), W('xG', 'xG'), W('shots', 'Shots'), W('touchesBox', 'Touches in box'),
    W('progRuns', 'Progressive runs'), W('keyPasses', 'Key passes'), W('xA', 'xA'), W('shotAssists', 'Shot assists'),
    W('successfulDribbles', 'Successful dribbles %'), W('offDuelsWon', 'Offensive duels won %'),
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')]),

  role('Mediapunta', 'Enganche', [
    W('keyPasses', 'Key passes'), W('smartPasses', 'Smart passes'), W('throughPasses', 'Through passes'), W('xA', 'xA'),
    W('shotAssists', 'Shot assists'), W('progPasses', 'Progressive passes'), W('passesPenaltyArea', 'Passes to penalty area'),
    W('deepCompletions', 'Deep completions'), W('accPasses', 'Accurate passes %'), W('successfulDribbles', 'Successful dribbles %'), W('foulsSuffered', 'Fouls suffered'),
  ], [G('hiDistance', 'HI Distance'), G('sprintingDistance', 'Sprint Distance'), G('maxSpeed', 'Max Speed'), G('countHighAccel', 'High Accelerations')]),
  role('Mediapunta', 'Segundo Punta', [
    W('goals', 'Goals'), W('xG', 'xG'), W('touchesBox', 'Touches in box'), W('progRuns', 'Progressive runs'), W('dribbles', 'Dribbles'),
    W('successfulDribbles', 'Successful dribbles %'), W('xA', 'xA'), W('keyPasses', 'Key passes'), W('shotAssists', 'Shot assists'),
    W('throughPasses', 'Through passes'), W('offDuelsWon', 'Offensive duels won %'),
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')]),

  role('Extremo', 'Extremo Clásico', [
    W('dribbles', 'Dribbles'), W('successfulDribbles', 'Successful dribbles %'), W('progRuns', 'Progressive runs'), W('crosses', 'Crosses'),
    W('accCrosses', 'Accurate crosses %'), W('deepCompletedCrosses', 'Deep completed crosses'), W('crossesToGoalieBox', 'Crosses to goalie box'),
    W('xA', 'xA'), W('keyPasses', 'Key passes'), W('shotAssists', 'Shot assists'), W('foulsSuffered', 'Fouls suffered'),
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')]),
  role('Extremo', 'Extremo Invertido', [
    W('goals', 'Goals'), W('npGoals', 'Non penalty goals'), W('xG', 'xG'), W('shots', 'Shots'), W('touchesBox', 'Touches in box'),
    W('progRuns', 'Progressive runs'), W('dribbles', 'Dribbles'), W('successfulDribbles', 'Successful dribbles %'),
    W('passesPenaltyArea', 'Passes to penalty area'), W('throughPasses', 'Through passes'), W('xA', 'xA'),
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')]),
  role('Extremo', 'Extremo Creador', [
    W('xA', 'xA'), W('keyPasses', 'Key passes'), W('smartPasses', 'Smart passes'), W('throughPasses', 'Through passes'),
    W('shotAssists', 'Shot assists'), W('progPasses', 'Progressive passes'), W('passesFinalThird', 'Passes to final third'),
    W('deepCompletions', 'Deep completions'), W('accPasses', 'Accurate passes %'), W('successfulDribbles', 'Successful dribbles %'), W('progRuns', 'Progressive runs'),
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')]),

  role('Delantero', 'Poacher', [
    W('goals', 'Goals'), W('npGoals', 'Non penalty goals'), W('xG', 'xG'), W('shots', 'Shots'), W('shotsOnTarget', 'Shots on target %'),
    W('goalConversion', 'Goal conversion %'), W('touchesBox', 'Touches in box'), W('receivedPasses', 'Received passes'),
    W('offDuelsWon', 'Offensive duels won %'), W('aerialDuelsWon', 'Aerial duels won %'), W('headGoals', 'Head goals'),
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')]),
  role('Delantero', 'Target Man', [
    W('receivedLongPasses', 'Received long passes'), W('offDuels', 'Offensive duels'), W('offDuelsWon', 'Offensive duels won %'),
    W('aerialDuels', 'Aerial duels'), W('aerialDuelsWon', 'Aerial duels won %'), W('headGoals', 'Head goals'), W('goals', 'Goals'),
    W('xG', 'xG'), W('keyPasses', 'Key passes'), W('receivedPasses', 'Passes received'), W('foulsSuffered', 'Fouls suffered'),
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')]),
  role('Delantero', 'Falso 9', [
    W('receivedPasses', 'Received passes'), W('passes', 'Passes'), W('accPasses', 'Accurate passes %'), W('keyPasses', 'Key passes'),
    W('xA', 'xA'), W('smartPasses', 'Smart passes'), W('throughPasses', 'Through passes'), W('passesPenaltyArea', 'Passes to penalty area'),
    W('successfulDribbles', 'Successful dribbles %'), W('foulsSuffered', 'Fouls suffered'), W('deepCompletions', 'Deep completions'),
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')]),
  role('Delantero', 'Pressing Forward', [
    W('successfulDefActions', 'Successful defensive actions'), W('defDuels', 'Defensive duels'), W('padjInterceptions', 'PAdj Interceptions'),
    W('progRuns', 'Progressive runs'), W('xG', 'xG'), W('goals', 'Goals'), W('shots', 'Shots'), W('touchesBox', 'Touches in box'),
    W('offDuelsWon', 'Offensive duels won %'), W('foulsSuffered', 'Fouls suffered'), W('accelerations', 'Accelerations per 90'),
  ], [G('maxSpeed', 'Max Speed'), G('sprintingDistance', 'Sprint Distance'), G('hiDistance', 'HI Distance'), G('countHighAccel', 'High Accelerations')]),

  { position:'Personalizado', role:'Crear mi propia selección', custom:true, categories:[C('Mi categoría', [])] },
);
