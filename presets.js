// presets.js — helpers, alias y presets para el builder de ruedas

export function M(aliases, label, opts){
  opts = opts || {};
  return { aliases, label, invert: !!opts.invert, wide: !!opts.wide };
}
export function C(name, metrics, opts){
  opts = opts || {};
  return { name, metrics, physical: !!opts.physical };
}
export function disciplineCat(){
  return C('Disciplina', [
    M(['fouls per 90'], 'Faltas', {invert:true}),
    M(['yellow cards per 90'], 'Amarillas', {invert:true}),
    M(['red cards per 90'], 'Rojas', {invert:true}),
  ]);
}
export function withDiscipline(cats){ return [...cats, disciplineCat()]; }

/* Alias reutilizables (nombres típicos de un export de Wyscout / tracking) */
export const A = {
  duels: ['duels per 90'], duelsWon: ['duels won, %'],
  defDuels: ['defensive duels per 90'], defDuelsWon: ['defensive duels won, %'],
  aerialDuels: ['aerial duels per 90'], aerialDuelsWon: ['aerial duels won, %'],
  interceptions: ['interceptions per 90'], padjInterceptions: ['padj interceptions'],
  slidingTackles: ['sliding tackles per 90'], padjSlidingTackles: ['padj sliding tackles'],
  shotsBlocked: ['shots blocked per 90'],
  fouls: ['fouls per 90'], yellow: ['yellow cards per 90'], red: ['red cards per 90'],
  foulsSuffered: ['fouls suffered per 90'],
  passes: ['passes per 90'], accPasses: ['accurate passes, %'],
  progPasses: ['progressive passes per 90'], accProgPasses: ['accurate progressive passes, %'],
  passesFinalThird: ['passes to final third per 90'], accPassesFinalThird: ['accurate passes to final third, %'],
  longPasses: ['long passes per 90'], accLongPasses: ['accurate long passes, %'],
  avgLongPassLength: ['average long pass length, m', 'long pass length, m'],
  avgPassLength: ['average pass length, m'],
  throughPasses: ['through passes per 90'], accThroughPasses: ['accurate through passes, %'],
  smartPasses: ['smart passes per 90'], accSmartPasses: ['accurate smart passes, %'],
  keyPasses: ['key passes per 90'], shotAssists: ['shot assists per 90'],
  crosses: ['crosses per 90'], accCrosses: ['accurate crosses, %'],
  deepCompletedCrosses: ['deep completed crosses per 90'], crossesToGoalieBox: ['crosses to goalie box per 90'],
  dribbles: ['dribbles per 90'], successfulDribbles: ['successful dribbles, %'],
  progRuns: ['progressive runs per 90'], accelerations: ['accelerations per 90'],
  touchesBox: ['touches in box per 90'], assists: ['assists per 90'], xA: ['xa per 90'],
  secondAssists: ['second assists per 90'], thirdAssists: ['third assists per 90'],
  goals: ['goals per 90'], npGoals: ['non-penalty goals per 90'],
  xG: ['xg per 90'], shots: ['shots per 90'], shotsOnTarget: ['shots on target, %'],
  goalConversion: ['goal conversion, %'], headGoals: ['head goals per 90'],
  offDuels: ['offensive duels per 90'], offDuelsWon: ['offensive duels won, %'],
  successfulDefActions: ['successful defensive actions per 90'],
  successfulAttackingActions: ['successful attacking actions per 90'],
  receivedPasses: ['received passes per 90'], receivedLongPasses: ['received long passes per 90'],
  forwardPasses: ['forward passes per 90'], accForwardPasses: ['accurate forward passes, %'],
  accBackPasses: ['accurate back passes, %'], accLateralPasses: ['accurate lateral passes, %'],
  accShortMedPasses: ['accurate short / medium passes, %', 'accurate short/medium passes, %'],
  backPassesReceivedGK: ['back passes received as gk per 90'],
  passesToPenaltyArea: ['passes to penalty area per 90'], accPassesToPenaltyArea: ['accurate passes to penalty area, %'],
  deepCompletions: ['deep completions per 90'],
  freeKicks: ['free kicks per 90'], directFreeKicks: ['direct free kicks per 90'], corners: ['corners per 90'],
  penaltiesTaken: ['penalties taken'], penaltyConversion: ['penalty conversion, %'],
  saveRate: ['save rate, %','save rate'], prevGoals: ['prevented goals per 90'],
  exits: ['exits per 90'], concededGoals: ['conceded goals per 90'],
  cleanSheets: ['clean sheets'], shotsAgainst: ['shots against per 90'], xGAgainst: ['xg against per 90'],
};

/* Métricas físicas / tracking */
export const PHYS = {
  height: ['height'],
  maxSpeed: ['max speed'],
  hiDistance: ['hi distance per 90'],
  hsrDistance: ['hsr distance per 90'],
  sprintingDistance: ['sprinting distance per 90'],
  countSprint: ['count sprint per 90'],
  totalDistance: ['total distance per 90'],
  runningDistance: ['running distance per 90'],
  countHighAccel: ['count high acceleration per 90'],
  countHighDecel: ['count high deceleration per 90'],
};

/* PRESETS — posiciones / roles con categorías y métricas */
export const PRESETS = [
  /* ========== 1. ARQUERO (POR) ========== */
  { position:'Arquero', role:'Tradicional / De Cierre', categories:[
    C('Rendimiento bajo palos', [
      M(A.saveRate, 'Save Rate %', {wide:true}),
      M(A.prevGoals, 'Goles Evitados', {wide:true}),
      M(A.concededGoals, 'Goles Recibidos', {invert:true}),
      M(A.cleanSheets, 'Vallas Invictas'),
      M(A.shotsAgainst, 'Tiros Recibidos'),
      M(A.xGAgainst, 'xG en Contra'),
    ]),
    C('Juego aéreo y área chica', [
      M(A.exits, 'Salidas', {wide:true}),
      M(A.aerialDuelsWon || ['aerial duels won, %'], 'Duelos Aéreos Ganados %'),
    ]),
    C('Salida directa', [
      M(A.accLongPasses || ['accurate long passes, %'], 'Precisión Pase Largo %'),
      M(A.avgLongPassLength, 'Longitud Media Pase Largo'),
    ]),
  ]},
  { position:'Arquero', role:'Líbero (Sweeper Keeper)', categories:[
    C('Atajada y cobertura', [
      M(A.prevGoals, 'Goles Evitados', {wide:true}),
      M(A.exits, 'Salidas', {wide:true}),
      M(A.saveRate, 'Save Rate %'),
    ]),
    C('Distribución', [
      M(A.passes, 'Pases'),
      M(A.accPasses, 'Precisión de Pase %'),
      M(A.accShortMedPasses, 'Precisión Pase Corto/Medio %'),
    ]),
    C('Juego largo', [
      M(A.accLongPasses, 'Precisión Pase Largo %'),
      M(A.forwardPasses, 'Pases Hacia Adelante'),
    ]),
  ]},

  /* ========== 2. LATERAL (LD / LI) ========== */
  { position:'Lateral', role:'Defensivo / De Cierre', categories: withDiscipline([
    C('Duelos y marca', [
      M(A.defDuels, 'Duelos Defensivos', {wide:true}),
      M(A.defDuelsWon, 'Duelos Defensivos Ganados %', {wide:true}),
      M(A.aerialDuels, 'Duelos Aéreos'),
    ]),
    C('Anticipación y cierre', [
      M(A.padjInterceptions, 'PAdj Intercepciones'),
      M(A.padjSlidingTackles, 'PAdj Entradas'),
      M(A.shotsBlocked, 'Tiros Bloqueados'),
    ]),
    C('Distribución segura', [
      M(A.accPasses, 'Precisión de Pase %'),
      M(A.accBackPasses, 'Precisión Pase Atrás %'),
    ]),
    C('Físico', [
      M(PHYS.maxSpeed, 'Velocidad Máxima'),
      M(PHYS.hiDistance, 'Distancia Alta Intensidad'),
    ], {physical:true}),
  ])},
  { position:'Lateral', role:'Carrilero (Wing-Back)', categories: withDiscipline([
    C('Centros y profundidad', [
      M(A.crosses, 'Centros', {wide:true}),
      M(A.accCrosses, 'Precisión de Centro %', {wide:true}),
      M(A.deepCompletedCrosses, 'Centros Profundos Completados'),
    ]),
    C('Ataque y desborde', [
      M(A.progRuns, 'Conducciones Progresivas'),
      M(A.dribbles, 'Regates'),
      M(A.successfulDribbles, 'Regates Exitosos %'),
      M(A.touchesBox, 'Toques en Área'),
    ]),
    C('Creación', [
      M(A.keyPasses, 'Pases Clave'),
      M(A.xA, 'xA'),
    ]),
    C('Físico', [
      M(PHYS.totalDistance, 'Distancia Total'),
      M(PHYS.sprintingDistance, 'Distancia de Sprint'),
    ], {physical:true}),
  ])},
  { position:'Lateral', role:'Invertido (Inverted Full-Back)', categories: withDiscipline([
    C('Construcción interior', [
      M(A.passes, 'Pases', {wide:true}),
      M(A.accPasses, 'Precisión de Pase %', {wide:true}),
      M(A.accShortMedPasses, 'Precisión Pase Corto/Medio %'),
    ]),
    C('Progresión', [
      M(A.progPasses, 'Pases Progresivos'),
      M(A.receivedPasses, 'Pases Recibidos'),
    ]),
    C('Defensa', [
      M(A.defDuelsWon, 'Duelos Defensivos Ganados %'),
      M(A.padjInterceptions, 'PAdj Intercepciones'),
    ]),
  ])},

  /* ========== 3. DEFENSOR CENTRAL (DFC) ========== */
  { position:'Defensor Central', role:'Marcador / Stopper', categories: withDiscipline([
    C('Duelos e intensidad', [
      M(A.defDuels, 'Duelos Defensivos', {wide:true}),
      M(A.defDuelsWon, 'Duelos Defensivos Ganados %', {wide:true}),
      M(A.successfulDefActions, 'Acciones Defensivas Exitosas'),
    ]),
    C('Juego aéreo', [
      M(A.aerialDuels, 'Duelos Aéreos', {wide:true}),
      M(A.aerialDuelsWon, 'Duelos Aéreos Ganados %'),
    ]),
    C('Protección de área', [
      M(A.shotsBlocked, 'Tiros Bloqueados'),
      M(A.padjSlidingTackles, 'PAdj Entradas'),
    ]),
    C('Físico', [
      M(PHYS.height, 'Altura'),
      M(PHYS.countHighAccel, 'Aceleraciones Altas'),
    ], {physical:true}),
  ])},
  { position:'Defensor Central', role:'De Salida / Líbero con Balón', categories: withDiscipline([
    C('Volumen e iniciación', [
      M(A.passes, 'Pases'),
      M(A.accPasses, 'Precisión de Pase %'),
      M(A.passesFinalThird, 'Pases a Último Tercio'),
    ]),
    C('Progresión', [
      M(A.progPasses, 'Pases Progresivos', {wide:true}),
      M(A.accProgPasses, 'Precisión Pase Progresivo %'),
    ]),
    C('Defensa', [
      M(A.padjInterceptions, 'PAdj Intercepciones'),
      M(A.defDuels, 'Duelos Defensivos'),
    ]),
    C('Físico', [
      M(PHYS.height, 'Altura'),
      M(PHYS.totalDistance, 'Distancia Total'),
    ], {physical:true}),
  ])},

  /* ========== 4. MEDIOCAMPO ========== */
  { position:'Mediocentro', role:'Organizador / Playmaker', categories:[
    C('Distribución', [
      M(A.passes, 'Pases', {wide:true}),
      M(A.accPasses, 'Precisión de Pase %', {wide:true}),
      M(A.keyPasses, 'Pases Clave'),
      M(A.xA, 'xA'),
    ]),
    C('Progresión', [
      M(A.progPasses, 'Pases Progresivos'),
      M(A.smartPasses, 'Smart Passes'),
      M(A.forwardPasses, 'Pases Hacia Adelante'),
    ]),
    C('Defensa/Recuperación', [
      M(A.interceptions || A.interceptions, 'Intercepciones'),
      M(A.defDuels, 'Duelos Defensivos'),
    ]),
  ]},
  { position:'Mediocentro', role:'Recuperador / Box-to-Box', categories:[
    C('Recuperación', [
      M(A.defDuels, 'Duelos Defensivos', {wide:true}),
      M(A.interceptions || A.interceptions, 'Intercepciones'),
      M(A.slidingTackles, 'Entradas Deslizantes'),
    ]),
    C('Transición', [
      M(A.progRuns, 'Conducciones Progresivas'),
      M(A.forwardPasses, 'Pases Hacia Adelante'),
      M(A.progPasses, 'Pases Progresivos'),
    ]),
    C('Aporte ofensivo', [
      M(A.keyPasses, 'Pases Clave'),
      M(A.goals, 'Goles'),
      M(A.assists, 'Asistencias'),
    ]),
  ]},

  /* ========== 5. EXTREMO / INTERIOR ========== */
  { position:'Extremo', role:'Extremo/Interior', categories:[
    C('Desborde', [
      M(A.dribbles, 'Regates', {wide:true}),
      M(A.successfulDribbles, 'Regates Exitosos %'),
      M(A.progRuns, 'Conducciones Progresivas'),
    ]),
    C('Creación y finalización', [
      M(A.keyPasses, 'Pases Clave'),
      M(A.xA, 'xA'),
      M(A.shotsOnTarget, 'Precisión Tiros %'),
      M(A.goals, 'Goles'),
    ]),
    C('Centros', [
      M(A.crosses, 'Centros'),
      M(A.accCrosses, 'Precisión de Centro %'),
    ]),
  ]},

  /* ========== 6. DELANTERO (ST / No.9) ========== */
  { position:'Delantero', role:'Centrodelantero / Rematador', categories:[
    C('Finalización', [
      M(A.goals, 'Goles', {wide:true}),
      M(A.xG, 'xG'),
      M(A.shotsOnTarget, 'Tiros a Puerta %'),
    ]),
    C('Participación', [
      M(A.keyPasses, 'Pases Clave'),
      M(A.xA, 'xA'),
      M(A.shots, 'Tiros por 90'),
    ]),
    C('Juego aéreo y movilidad', [
      M(A.headGoals, 'Goles de Cabeza'),
      M(A.progRuns, 'Conducciones Progresivas'),
    ]),
  ]},

  /* ========== 7. Preset genérico vacío (custom) ========== */
  { position:'Custom', role:'Personalizado', custom:true, categories:[
    /* el preset custom solo aporta categorías vacías para editar */
    { name: 'Ofensivo', metrics: [] },
    { name: 'Defensivo', metrics: [] },
  ]},
];