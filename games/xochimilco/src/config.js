// El escape de Xochimilco · todos los números de balance, zonas y textos viven aquí (docs/02 reglas comunes).
// Unidades: metros (m), segundos (s). Los carriles se numeran 0, 1, 2 de izquierda a derecha.

export const GAME_ID = 'xochimilco';

// ---------------------------------------------------------------- mundo
export const WORLD = {
  lanes: 3,
  laneW: 2.4, // separación entre centros de carril
  canalHalf: 4.8, // semiancho del canal; fuera empiezan las chinampas
  playerHalf: 0.36, // semiancho de la caja de colisión del ajolote
  playerDepth: 0.42, // semiprofundidad (eje z) de la caja del ajolote
  goal: 2000, // meta: pantalla ESCAPASTE
  zoneLen: 500, // metros por zona
  zoneCount: 4,
  far: 96, // distancia máxima de dibujo
  d0: 8.5, // distancia cámara-jugador
};

export function laneX(i) {
  return (i - 1) * WORLD.laneW;
}

// ---------------------------------------------------------------- velocidad (m/s)
// start: salida · end: al llegar a la meta · cap: tope en modo infinito · abs: tope absoluto con Chinampa Dash.
// El servidor valida durationMs >= distance / velocidad máxima: la velocidad máxima de este juego es `abs`.
export const SPEED = {
  start: 13,
  end: 26,
  cap: 32,
  abs: 36,
  accel: 6.5, // m/s² al recuperar velocidad
  launch: 2.4, // s de arranque desde 0
};

// ---------------------------------------------------------------- movimiento del ajolote
export const MOVE = {
  laneRate: 16, // suavizado exponencial del cambio de carril (1/s)
  jumpTime: 0.7, // s de aire (docs/02 §2.2)
  jumpPeak: 1.7, // altura máxima (m)
  fastFall: 3.6, // multiplicador de gravedad con fast-fall (S en el aire)
  jumpBuffer: 0.16, // s que se recuerda una pulsación de salto
  diveBuffer: 0.12,
  diveTime: 0.8, // s bajo el agua (docs/02 §2.2)
  diveDepth: 0.95, // profundidad visual (m)
  diveCost: 34, // oxígeno por inmersión
  o2Max: 100,
  o2Regen: 42, // oxígeno por segundo en la superficie
  o2Delay: 0.3, // s tras emerger antes de recargar
};

// ---------------------------------------------------------------- vidas y power-ups
export const LIVES = {
  start: 2,
  max: 3, // docs/02 §2.4: ajolotitos, máximo 3
  iframes: 1.8, // s de invulnerabilidad tras un golpe
  hitSlow: 0.5, // fracción de velocidad tras un golpe
  slowRecover: 1.4, // s para recuperar la velocidad
  deathTime: 1.15, // s de animación antes de la pantalla de fin
};

export const DASH = {
  time: 3, // s de Chinampa Dash e invulnerabilidad (docs/02 §2.4)
  mult: 1.3, // impulso de velocidad
};

// ---------------------------------------------------------------- puntuación (docs/02 §2.6)
// Puntaje = metros + flores × 10 × combo
export const SCORE = {
  flower: 10,
  comboMax: 5, // el servidor valida score <= distance + flores·10·comboMax
  comboEvery: 8, // flores seguidas para subir un nivel de combo
  comboWindow: 2.1, // s sin recoger flores antes de perder el combo
};

// ---------------------------------------------------------------- ritmo del generador de patrones
export const PACING = {
  gapT: [2.1, 1.75, 1.5, 1.28, 1.12], // s mínimos entre obstáculos de patrones de dificultad 1..5 (reacción)
  introLead: 4.2, // s antes del primer obstáculo
  spawnAhead: 150, // m por delante que se mantienen generados
  keepBehind: 14, // m por detrás antes de descartar
  lifeEvery: 360, // m mínimos entre ajolotitos
  dashEvery: 640, // m mínimos entre Chinampa Dash
};

// ---------------------------------------------------------------- red y récords
export const NET = {
  topN: 10,
  localN: 5,
  retryMs: 10600, // límite del servidor: 1 envío cada 10 s por IP
  minPostDist: 50, // por debajo de esta distancia no se publica el puntaje
  waitMs: 7000, // espera máxima mostrando "Enviando…"
};

export const ALIAS_RE = /^[A-Za-z0-9ÁÉÍÓÚÑáéíóúñ _-]{3,12}$/;
export const DEFAULT_ALIAS = 'Ajolote';

// ---------------------------------------------------------------- zonas (docs/02 §2.5)
// Colores en hex; los números se interpolan al cruzar de una zona a otra.
export const ZONES = [
  {
    id: 'dia',
    nombre: 'Canal de día',
    sub: 'Respira hondo: la mañana está tranquila.',
    pal: {
      skyTop: '#2f95e0', skyMid: '#7ccbf2', skyLow: '#e6f7ee',
      orb: 'sun', orbCol: '#fff6c2', orbX: 0.72, orbY: 0.16,
      hillFar: '#8cc7b8', hillNear: '#5fae8e', cloud: '#ffffff', cloudA: 0.92,
      waterFar: '#86d8d0', waterNear: '#1f8ea0', waterBand: '#ffffff', sparkle: '#ffffff',
      bankA: '#69b84f', bankB: '#58a43f', shore: '#c39a62', shoreDark: '#6e4f2c',
      fog: '#e4f7ee', fogMax: 0.55, fogNear: 38, fogFar: 105,
      dark: 0, star: 0, leaf: '#3f8f3a', leaf2: '#63b24a', trunk: '#5b4630', accent: '#ffd23f',
    },
  },
  {
    id: 'mercado',
    nombre: 'Mercado flotante',
    sub: 'Trajineras, flores y mucho ruido.',
    pal: {
      skyTop: '#ee6f4a', skyMid: '#ffb36b', skyLow: '#ffe6bd',
      orb: 'sun', orbCol: '#fff0b0', orbX: 0.28, orbY: 0.3,
      hillFar: '#d8a27e', hillNear: '#b87a58', cloud: '#ffe2c6', cloudA: 0.85,
      waterFar: '#f2c68f', waterNear: '#248a9a', waterBand: '#fff4dc', sparkle: '#fff4d6',
      bankA: '#8cbc4a', bankB: '#7aa83c', shore: '#d6a35f', shoreDark: '#7f5528',
      fog: '#ffe1bd', fogMax: 0.55, fogNear: 38, fogFar: 105,
      dark: 0, star: 0, leaf: '#4f9a3a', leaf2: '#78b648', trunk: '#5e452b', accent: '#ff5ca8',
    },
  },
  {
    id: 'noche',
    nombre: 'Noche con mariachi',
    sub: 'Se acabó la luz: confía en tus reflejos.',
    pal: {
      skyTop: '#050a28', skyMid: '#141c55', skyLow: '#5a3a8a',
      orb: 'moon', orbCol: '#f4f1ff', orbX: 0.3, orbY: 0.17,
      hillFar: '#1b2250', hillNear: '#101a3a', cloud: '#6a6ab0', cloudA: 0.2,
      waterFar: '#3a3f8f', waterNear: '#0a2744', waterBand: '#8aa0ff', sparkle: '#c8d4ff',
      bankA: '#1d3b30', bankB: '#173126', shore: '#4a3a2a', shoreDark: '#1c130c',
      fog: '#2a2268', fogMax: 0.72, fogNear: 26, fogFar: 92,
      dark: 0.55, star: 1, leaf: '#1f4a3a', leaf2: '#2f6a4c', trunk: '#2a2018', accent: '#ff9ad5',
    },
  },
  {
    id: 'munecas',
    nombre: 'Isla de las Muñecas',
    sub: 'La niebla susurra. No mires atrás.',
    pal: {
      skyTop: '#4c5d63', skyMid: '#8da09f', skyLow: '#c9d6cc',
      orb: 'sun', orbCol: '#e8efe0', orbX: 0.62, orbY: 0.2,
      hillFar: '#6d8579', hillNear: '#506659', cloud: '#cfd9d2', cloudA: 0.55,
      waterFar: '#97ae9f', waterNear: '#2d4a3d', waterBand: '#cfe5d8', sparkle: '#e8fff4',
      bankA: '#4a5a3a', bankB: '#3f4d31', shore: '#6f6a4c', shoreDark: '#2e2a1a',
      fog: '#b4c4ba', fogMax: 0.88, fogNear: 12, fogFar: 72,
      dark: 0.28, star: 0, leaf: '#4c5f3b', leaf2: '#6b8050', trunk: '#3a2f26', accent: '#c9ff7a',
    },
  },
];

// Nombres de las trajineras (se pintan una sola vez en su sprite).
export const TRAJINERA_NAMES = ['Lupita', 'Xóchitl', 'Frida', 'Citlali', 'Marisol', 'Catrina'];
