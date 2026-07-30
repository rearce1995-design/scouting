// presets.js — helpers, alias y presets para el builder de ruedas
// Set completo: 8 posiciones (Arquero, Lateral, Defensor Central, Mediocentro/Pivote,
// Interior, Mediapunta, Extremo, Delantero) con 2-3 roles cada una + Personalizado.

export const PRESETS = [];

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
// agrega Disciplina de forma consistente a roles de jugadores de campo (no arqueros)
export function withDiscipline(cats){ return [...cats, disciplineCat()]; }

/* Alias reutilizables (nombres tipicos de un export de Wyscout en ingles) */
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

/* Alias fisicos / GPS: normalmente NO vienen en un export estandar de Wyscout de liga.
   Se agrupan en categorias marcadas physical:true para que el usuario las prenda/apague. */
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

PRESETS.push(
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
      M(A.aerialDuelsWon, 'Duelos Aéreos Ganados %'),
    ]),
    C('Salida directa', [
      M(A.accLongPasses, 'Precisión Pase Largo %'),
      M(A.avgLongPassLength, 'Longitud Media Pase Largo'),
    ]),
  ]},
  { position:'Arquero', role:'Líbero (Sweeper Keeper)', categories:[
    C('Atajada y cobertura', [
      M(A.prevGoals, 'Goles Evitados', {wide:true}),
      M(A.exits, 'Salidas', {wide:true}),
      M(A.saveRate, 'Save Rate %'),
    ]),
    C('Participación y distribución corta', [
      M(A.passes, 'Pases'),
      M(A.accPasses, 'Precisión de Pase %'),
      M(A.backPassesReceivedGK, 'Retrocesos Recibidos'),
      M(A.accShortMedPasses, 'Precisión Pase Corto/Medio %'),
    ]),
    C('Salida progresiva', [
      M(A.forwardPasses, 'Pases Hacia Adelante', {wide:true}),
      M(A.accForwardPasses, 'Precisión Pase Adelante %'),
      M(A.accLongPasses, 'Precisión Pase Largo %'),
    ]),
  ]},

  /* ========== 2. LATERAL (LD / LI) ========== */
  { position:'Lateral', role:'Defensivo / De Cierre', categories: withDiscipline([
    C('Duelos y marca', [
      M(A.defDuels, 'Duelos Defensivos', {wide:true}),
      M(A.defDuelsWon, 'Duelos Defensivos Ganados %', {wide:true}),
      M(A.aerialDuels, 'Duelos Aéreos'),
      M(A.aerialDuelsWon, 'Duelos Aéreos Ganados %'),
    ]),
    C('Anticipación y cierre', [
      M(A.padjInterceptions, 'PAdj Intercepciones'),
      M(A.padjSlidingTackles, 'PAdj Entradas'),
      M(A.shotsBlocked, 'Tiros Bloqueados'),
    ]),
    C('Distribución segura', [
      M(A.accPasses, 'Precisión de Pase %'),
      M(A.accBackPasses, 'Precisión Pase Atrás %'),
      M(A.accLateralPasses, 'Precisión Pase Lateral %'),
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
      M(A.crossesToGoalieBox, 'Centros al Área Chica'),
    ]),
    C('Ataque y desborde', [
      M(A.progRuns, 'Conducciones Progresivas'),
      M(A.dribbles, 'Regates'),
      M(A.successfulDribbles, 'Regates Exitosos %'),
      M(A.accelerations, 'Aceleraciones'),
      M(A.touchesBox, 'Toques en Área'),
    ]),
    C('Creación / asociación', [
      M(A.keyPasses, 'Pases Clave'),
      M(A.xA, 'xA'),
      M(A.shotAssists, 'Asistencias de Tiro'),
    ]),
    C('Físico', [
      M(PHYS.totalDistance, 'Distancia Total'),
      M(PHYS.hiDistance, 'Distancia Alta Intensidad'),
      M(PHYS.sprintingDistance, 'Distancia de Sprint'),
      M(PHYS.countSprint, 'Cantidad de Sprints'),
    ], {physical:true}),
  ])},
  { position:'Lateral', role:'Invertido (Inverted Full-Back)', categories: withDiscipline([
    C('Construcción interior', [
      M(A.passes, 'Pases', {wide:true}),
      M(A.accPasses, 'Precisión de Pase %', {wide:true}),
      M(A.accShortMedPasses, 'Precisión Pase Corto/Medio %'),
      M(A.receivedPasses, 'Pases Recibidos'),
    ]),
    C('Progresión de balón', [
      M(A.progPasses, 'Pases Progresivos', {wide:true}),
      M(A.accProgPasses, 'Precisión Pase Progresivo %'),
      M(A.passesFinalThird, 'Pases a Último Tercio'),
      M(A.accPassesFinalThird, 'Precisión Pase Último Tercio %'),
    ]),
    C('Defensa / interior', [
      M(A.defDuelsWon, 'Duelos Defensivos Ganados %'),
      M(A.padjInterceptions, 'PAdj Intercepciones'),
      M(A.offDuelsWon, 'Duelos Ofensivos Ganados %'),
    ]),
  ])},

  /* ========== 3. DEFENSOR CENTRAL (DFC) ========== */
  { position:'Defensor Central', role:'Marcador / Stopper', categories: withDiscipline([
    C('Duelos e intensidad', [
      M(A.defDuels, 'Duelos Defensivos', {wide:true}),
      M(A.defDuelsWon, 'Duelos Defensivos Ganados %', {wide:true}),
      M(A.successfulDefActions, 'Acciones Defensivas Exitosas'),
    ]),
    C('Juego aéreo dominante', [
      M(A.aerialDuels, 'Duelos Aéreos', {wide:true}),
      M(A.aerialDuelsWon, 'Duelos Aéreos Ganados %', {wide:true}),
      M(A.headGoals, 'Goles de Cabeza'),
    ]),
    C('Protección del área', [
      M(A.shotsBlocked, 'Tiros Bloqueados'),
      M(A.padjSlidingTackles, 'PAdj Entradas'),
    ]),
    C('Físico', [
      M(PHYS.height, 'Altura'),
      M(PHYS.countHighAccel, 'Aceleraciones Altas'),
      M(PHYS.countHighDecel, 'Desaceleraciones Altas'),
    ], {physical:true}),
  ])},
  { position:'Defensor Central', role:'De Salida / Líbero con Balón', categories: withDiscipline([
    C('Volumen e iniciación', [
      M(A.passes, 'Pases'),
      M(A.accPasses, 'Precisión de Pase %', {wide:true}),
      M(A.receivedPasses, 'Pases Recibidos'),
    ]),
    C('Filtrado y romper líneas', [
      M(A.forwardPasses, 'Pases Hacia Adelante', {wide:true}),
      M(A.accForwardPasses, 'Precisión Pase Adelante %'),
      M(A.progPasses, 'Pases Progresivos', {wide:true}),
      M(A.accProgPasses, 'Precisión Pase Progresivo %'),
      M(A.smartPasses, 'Pases Inteligentes'),
    ]),
    C('Pase largo y salida directa', [
      M(A.longPasses, 'Pases Largos'),
      M(A.accLongPasses, 'Precisión Pase Largo %'),
      M(A.avgLongPassLength, 'Longitud Media Pase Largo'),
    ]),
    C('Progresión por conducción', [
      M(A.progRuns, 'Conducciones Progresivas'),
      M(A.passesFinalThird, 'Pases a Último Tercio'),
    ]),
  ])},
  { position:'Defensor Central', role:'De Cobertura / Cierre', categories: withDiscipline([
    C('Posicionamiento e intercepción', [
      M(A.padjInterceptions, 'PAdj Intercepciones', {wide:true}),
      M(A.interceptions, 'Intercepciones', {wide:true}),
      M(A.shotsBlocked, 'Tiros Bloqueados'),
    ]),
    C('Efectividad y limpieza', [
      M(A.defDuelsWon, 'Duelos Defensivos Ganados %'),
      M(A.aerialDuelsWon, 'Duelos Aéreos Ganados %'),
    ]),
    C('Físico', [
      M(PHYS.maxSpeed, 'Velocidad Máxima', {wide:true}),
      M(PHYS.hsrDistance, 'Distancia Media-Alta Intensidad'),
      M(PHYS.sprintingDistance, 'Distancia de Sprint'),
    ], {physical:true}),
  ])},

  /* ========== 4. MEDIOCENTRO / PIVOTE (MCD - 5) ========== */
  { position:'Mediocentro (Pivote)', role:'Defensivo / Destructor (Anchor)', categories: withDiscipline([
    C('Presencia y recuperación', [
      M(A.defDuels, 'Duelos Defensivos', {wide:true}),
      M(A.defDuelsWon, 'Duelos Defensivos Ganados %', {wide:true}),
      M(A.successfulDefActions, 'Acciones Defensivas Exitosas'),
    ]),
    C('Anticipación y rebote', [
      M(A.padjInterceptions, 'PAdj Intercepciones', {wide:true}),
      M(A.aerialDuels, 'Duelos Aéreos'),
      M(A.aerialDuelsWon, 'Duelos Aéreos Ganados %'),
    ]),
    C('Control', [
      M(A.padjSlidingTackles, 'PAdj Entradas'),
      M(A.foulsSuffered, 'Faltas Recibidas'),
    ]),
    C('Pase de seguridad', [
      M(A.accShortMedPasses, 'Precisión Pase Corto/Medio %'),
      M(A.accLateralPasses, 'Precisión Pase Lateral %'),
    ]),
  ])},
  { position:'Mediocentro (Pivote)', role:'Organizador / Regista', categories: withDiscipline([
    C('Control del ritmo', [
      M(A.passes, 'Pases', {wide:true}),
      M(A.accPasses, 'Precisión de Pase %', {wide:true}),
      M(A.receivedPasses, 'Pases Recibidos'),
    ]),
    C('Trazos largos y cambios de frente', [
      M(A.longPasses, 'Pases Largos'),
      M(A.accLongPasses, 'Precisión Pase Largo %'),
      M(A.avgPassLength, 'Longitud Media de Pase'),
    ]),
    C('Pase progresivo y generación', [
      M(A.progPasses, 'Pases Progresivos', {wide:true}),
      M(A.accProgPasses, 'Precisión Pase Progresivo %'),
      M(A.smartPasses, 'Pases Inteligentes'),
      M(A.secondAssists, 'Segundas Asistencias'),
      M(A.thirdAssists, 'Terceras Asistencias'),
    ]),
    C('Salida del acoso', [
      M(A.offDuelsWon, 'Duelos Ofensivos Ganados %'),
      M(A.accPassesFinalThird, 'Precisión Pase Último Tercio %'),
    ]),
  ])},
  { position:'Mediocentro (Pivote)', role:'Cierre / Medio Cierre (Half-Back)', categories: withDiscipline([
    C('Defensa y repliegue', [
      M(A.padjInterceptions, 'PAdj Intercepciones', {wide:true}),
      M(A.defDuelsWon, 'Duelos Defensivos Ganados %', {wide:true}),
      M(A.aerialDuelsWon, 'Duelos Aéreos Ganados %'),
    ]),
    C('Salida de 3', [
      M(A.passes, 'Pases'),
      M(A.accForwardPasses, 'Precisión Pase Adelante %'),
      M(A.accLateralPasses, 'Precisión Pase Lateral %'),
    ]),
    C('Recuperación tras pérdida', [
      M(A.successfulDefActions, 'Acciones Defensivas Exitosas', {wide:true}),
      M(A.duelsWon, 'Duelos Ganados %'),
    ]),
  ])},

  /* ========== 5. INTERIOR (MC - 8) ========== */
  { position:'Interior', role:'Box-to-Box (Área a Área)', categories: withDiscipline([
    C('Rendimiento y llegada', [
      M(A.touchesBox, 'Toques en Área', {wide:true}),
      M(A.shots, 'Tiros'),
      M(A.xG, 'xG'),
      M(A.npGoals, 'Goles sin Penal'),
    ]),
    C('Aporte defensivo', [
      M(A.defDuels, 'Duelos Defensivos'),
      M(A.defDuelsWon, 'Duelos Defensivos Ganados %'),
      M(A.padjInterceptions, 'PAdj Intercepciones'),
    ]),
    C('Despliegue y conducción', [
      M(A.progRuns, 'Conducciones Progresivas', {wide:true}),
      M(A.offDuels, 'Duelos Ofensivos'),
      M(A.accelerations, 'Aceleraciones'),
    ]),
    C('Físico', [
      M(PHYS.totalDistance, 'Distancia Total'),
      M(PHYS.runningDistance, 'Distancia de Carrera'),
      M(PHYS.hiDistance, 'Distancia Alta Intensidad'),
    ], {physical:true}),
  ])},
  { position:'Interior', role:'Organizador / Mezzala', categories: withDiscipline([
    C('Pase clave y generación', [
      M(A.keyPasses, 'Pases Clave', {wide:true}),
      M(A.xA, 'xA', {wide:true}),
      M(A.shotAssists, 'Asistencias de Tiro'),
      M(A.passesFinalThird, 'Pases a Último Tercio'),
      M(A.passesToPenaltyArea, 'Pases al Área'),
    ]),
    C('Creatividad y desequilibrio', [
      M(A.smartPasses, 'Pases Inteligentes'),
      M(A.accSmartPasses, 'Precisión Pase Inteligente %'),
      M(A.throughPasses, 'Pases al Espacio'),
      M(A.successfulDribbles, 'Regates Exitosos %'),
    ]),
    C('Aporte por banda', [
      M(A.crosses, 'Centros'),
      M(A.accCrosses, 'Precisión de Centro %'),
      M(A.progPasses, 'Pases Progresivos'),
    ]),
  ])},
  { position:'Interior', role:'Posicional', categories: withDiscipline([
    C('Circulación continua', [
      M(A.passes, 'Pases', {wide:true}),
      M(A.accPasses, 'Precisión de Pase %', {wide:true}),
      M(A.accShortMedPasses, 'Precisión Pase Corto/Medio %'),
      M(A.receivedPasses, 'Pases Recibidos'),
    ]),
    C('Eficiencia de pase', [
      M(A.accForwardPasses, 'Precisión Pase Adelante %'),
      M(A.accLateralPasses, 'Precisión Pase Lateral %'),
      M(A.accBackPasses, 'Precisión Pase Atrás %'),
    ]),
    C('Mantenimiento y equilibrio', [
      M(A.padjInterceptions, 'PAdj Intercepciones'),
      M(A.foulsSuffered, 'Faltas Recibidas'),
      M(A.offDuelsWon, 'Duelos Ofensivos Ganados %'),
    ]),
  ])},

  /* ========== 6. MEDIAPUNTA (MCO - 10) ========== */
  { position:'Mediapunta', role:'Enganche Tradicional / Creador', categories: withDiscipline([
    C('Último pase y asistencia', [
      M(A.keyPasses, 'Pases Clave', {wide:true}),
      M(A.xA, 'xA', {wide:true}),
      M(A.shotAssists, 'Asistencias de Tiro'),
      M(A.assists, 'Asistencias'),
      M(A.secondAssists, 'Segundas Asistencias'),
    ]),
    C('Filtro e invención', [
      M(A.smartPasses, 'Pases Inteligentes', {wide:true}),
      M(A.accSmartPasses, 'Precisión Pase Inteligente %'),
      M(A.throughPasses, 'Pases al Espacio'),
      M(A.accThroughPasses, 'Precisión Pase al Espacio %'),
    ]),
    C('Peligro en área rival', [
      M(A.passesToPenaltyArea, 'Pases al Área'),
      M(A.accPassesToPenaltyArea, 'Precisión Pase al Área %'),
      M(A.deepCompletions, 'Pases en Profundidad'),
    ]),
    C('Pelota parada', [
      M(A.freeKicks, 'Tiros Libres'),
      M(A.directFreeKicks, 'Tiros Libres Directos'),
      M(A.corners, 'Córners'),
    ]),
  ])},
  { position:'Mediapunta', role:'De Presión / Segundo Volante (Shadow Striker)', categories: withDiscipline([
    C('Ofensiva y gol', [
      M(A.goals, 'Goles', {wide:true}),
      M(A.npGoals, 'Goles sin Penal'),
      M(A.xG, 'xG', {wide:true}),
      M(A.shots, 'Tiros'),
      M(A.shotsOnTarget, 'Tiros al Arco %'),
      M(A.goalConversion, 'Conversión %'),
    ]),
    C('Presencia en el área', [
      M(A.touchesBox, 'Toques en Área'),
      M(A.successfulAttackingActions, 'Acciones Ofensivas Exitosas'),
      M(A.offDuelsWon, 'Duelos Ofensivos Ganados %'),
    ]),
    C('Presión', [
      M(A.successfulDefActions, 'Acciones Defensivas Exitosas'),
      M(A.foulsSuffered, 'Faltas Recibidas'),
    ]),
    C('Físico', [
      M(PHYS.hiDistance, 'Distancia Alta Intensidad'),
      M(PHYS.countHighAccel, 'Aceleraciones Altas'),
    ], {physical:true}),
  ])},
  { position:'Mediapunta', role:'Falso / Organizador Avanzado', categories: withDiscipline([
    C('Asociación y recepción', [
      M(A.receivedPasses, 'Pases Recibidos', {wide:true}),
      M(A.passes, 'Pases'),
      M(A.accPasses, 'Precisión de Pase %'),
    ]),
    C('Avanzar el juego', [
      M(A.passesFinalThird, 'Pases a Último Tercio', {wide:true}),
      M(A.accPassesFinalThird, 'Precisión Pase Último Tercio %'),
      M(A.progPasses, 'Pases Progresivos'),
      M(A.deepCompletions, 'Pases en Profundidad'),
    ]),
    C('Retención de balón', [
      M(A.dribbles, 'Regates'),
      M(A.successfulDribbles, 'Regates Exitosos %'),
      M(A.foulsSuffered, 'Faltas Recibidas'),
    ]),
  ])},

  /* ========== 7. EXTREMO (ED / EI) ========== */
  { position:'Extremo', role:'Clásico (Winger)', categories: withDiscipline([
    C('Desborde y centros', [
      M(A.crosses, 'Centros', {wide:true}),
      M(A.accCrosses, 'Precisión de Centro %', {wide:true}),
      M(A.crossesToGoalieBox, 'Centros al Área Chica'),
      M(A.deepCompletedCrosses, 'Centros Profundos Completados'),
    ]),
    C('1v1 y velocidad', [
      M(A.dribbles, 'Regates', {wide:true}),
      M(A.successfulDribbles, 'Regates Exitosos %', {wide:true}),
      M(A.progRuns, 'Conducciones Progresivas'),
      M(A.accelerations, 'Aceleraciones'),
    ]),
    C('Asistencia', [
      M(A.xA, 'xA'),
      M(A.shotAssists, 'Asistencias de Tiro'),
      M(A.keyPasses, 'Pases Clave'),
    ]),
    C('Físico', [
      M(PHYS.maxSpeed, 'Velocidad Máxima', {wide:true}),
      M(PHYS.sprintingDistance, 'Distancia de Sprint'),
      M(PHYS.countSprint, 'Cantidad de Sprints'),
    ], {physical:true}),
  ])},
  { position:'Extremo', role:'Invertido / Infiltrado (Inside Forward)', categories: withDiscipline([
    C('Búsqueda de gol', [
      M(A.goals, 'Goles', {wide:true}),
      M(A.npGoals, 'Goles sin Penal'),
      M(A.xG, 'xG', {wide:true}),
      M(A.shots, 'Tiros'),
      M(A.shotsOnTarget, 'Tiros al Arco %'),
      M(A.goalConversion, 'Conversión %'),
    ]),
    C('Desequilibrio interior', [
      M(A.dribbles, 'Regates', {wide:true}),
      M(A.successfulDribbles, 'Regates Exitosos %'),
      M(A.touchesBox, 'Toques en Área'),
      M(A.offDuelsWon, 'Duelos Ofensivos Ganados %'),
    ]),
    C('Pase interno / filoso', [
      M(A.passesToPenaltyArea, 'Pases al Área'),
      M(A.accPassesToPenaltyArea, 'Precisión Pase al Área %'),
      M(A.throughPasses, 'Pases al Espacio'),
    ]),
  ])},
  { position:'Extremo', role:'Creador / Interior Abierto', categories: withDiscipline([
    C('Generación desde la banda', [
      M(A.keyPasses, 'Pases Clave', {wide:true}),
      M(A.smartPasses, 'Pases Inteligentes'),
      M(A.xA, 'xA', {wide:true}),
      M(A.passesFinalThird, 'Pases a Último Tercio'),
    ]),
    C('Circulación segura', [
      M(A.passes, 'Pases'),
      M(A.accPasses, 'Precisión de Pase %'),
      M(A.accShortMedPasses, 'Precisión Pase Corto/Medio %'),
    ]),
    C('Centro preciso de rosca', [
      M(A.accCrosses, 'Precisión de Centro %', {wide:true}),
      M(A.deepCompletions, 'Pases en Profundidad'),
    ]),
  ])},

  /* ========== 8. DELANTERO CENTRO (DC - 9) ========== */
  { position:'Delantero', role:'Nueve de Área / Rematador (Poacher / Target Man)', categories: withDiscipline([
    C('Definición y eficiencia', [
      M(A.goals, 'Goles', {wide:true}),
      M(A.npGoals, 'Goles sin Penal'),
      M(A.xG, 'xG', {wide:true}),
      M(A.shots, 'Tiros'),
      M(A.shotsOnTarget, 'Tiros al Arco %'),
      M(A.goalConversion, 'Conversión %'),
    ]),
    C('Presencia y cómputo en área', [
      M(A.touchesBox, 'Toques en Área', {wide:true}),
      M(A.headGoals, 'Goles de Cabeza'),
    ]),
    C('Fuerza aérea y espaldas', [
      M(A.aerialDuels, 'Duelos Aéreos'),
      M(A.aerialDuelsWon, 'Duelos Aéreos Ganados %', {wide:true}),
      M(A.receivedLongPasses, 'Pases Largos Recibidos'),
      M(A.offDuelsWon, 'Duelos Ofensivos Ganados %'),
    ]),
    C('Efectividad de penales', [
      M(A.penaltiesTaken, 'Penales Pateados'),
      M(A.penaltyConversion, 'Conversión de Penales %'),
    ]),
  ])},
  { position:'Delantero', role:'Falso 9 (False 9)', categories: withDiscipline([
    C('Bajada y recepción', [
      M(A.receivedPasses, 'Pases Recibidos', {wide:true}),
      M(A.passes, 'Pases'),
      M(A.accPasses, 'Precisión de Pase %'),
    ]),
    C('Asistencia a extremos/llegadores', [
      M(A.keyPasses, 'Pases Clave', {wide:true}),
      M(A.xA, 'xA', {wide:true}),
      M(A.shotAssists, 'Asistencias de Tiro'),
      M(A.throughPasses, 'Pases al Espacio'),
      M(A.accThroughPasses, 'Precisión Pase al Espacio %'),
    ]),
    C('Filtrados y conexión', [
      M(A.passesToPenaltyArea, 'Pases al Área'),
      M(A.smartPasses, 'Pases Inteligentes'),
      M(A.deepCompletions, 'Pases en Profundidad'),
    ]),
    C('Giro y gambeta', [
      M(A.successfulDribbles, 'Regates Exitosos %'),
      M(A.offDuelsWon, 'Duelos Ofensivos Ganados %'),
      M(A.foulsSuffered, 'Faltas Recibidas'),
    ]),
  ])},
  { position:'Delantero', role:'De Movilidad / Presión (Pressing Forward)', categories: withDiscipline([
    C('Desmarque y ruptura', [
      M(A.progRuns, 'Conducciones Progresivas', {wide:true}),
      M(A.accelerations, 'Aceleraciones'),
      M(A.touchesBox, 'Toques en Área'),
      M(A.xG, 'xG', {wide:true}),
    ]),
    C('Lucha y duelos ofensivos', [
      M(A.offDuels, 'Duelos Ofensivos'),
      M(A.offDuelsWon, 'Duelos Ofensivos Ganados %'),
      M(A.foulsSuffered, 'Faltas Recibidas'),
      M(A.successfulAttackingActions, 'Acciones Ofensivas Exitosas'),
    ]),
    C('Presión alta (sin pelota)', [
      M(A.successfulDefActions, 'Acciones Defensivas Exitosas'),
      M(A.defDuels, 'Duelos Defensivos'),
    ]),
    C('Físico', [
      M(PHYS.hiDistance, 'Distancia Alta Intensidad', {wide:true}),
      M(PHYS.sprintingDistance, 'Distancia de Sprint'),
      M(PHYS.countHighAccel, 'Aceleraciones Altas'),
      M(PHYS.maxSpeed, 'Velocidad Máxima'),
    ], {physical:true}),
  ])},

  { position:'Personalizado', role:'Crear mi propia selección', custom:true, categories:[
    C('Mi categoría', []),
  ]},
);
