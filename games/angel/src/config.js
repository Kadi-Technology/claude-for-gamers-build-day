// config.js (ANG-G) - Números de balance de Ángel Survivors. Todo lo ajustable vive aquí.
//
// Otros módulos leen partes de este archivo:
//   - player.js lee CONFIG.player (speed, radius, hp, accel, friction, dashTime, dashSpeed, hurtIframes,
//     aimCone, assistRange, aimDist, magnet).
//   - main.js aplica CONFIG.balance.* y CONFIG.supers sobre los objetos de balance exportados por abilities.js,
//     pickups.js, weapons.js y superweapons.js (ABILITY_BALANCE, PICKUP_BALANCE, WEAPON_BALANCE, SUPER_BALANCE).
// Exporta CONFIG por nombre y por defecto.

export const CONFIG = {
  nombre: 'Ángel Survivors',

  // Vista lógica del canvas: se limita para que el costo de pintado y la zona de spawn sean estables.
  view: { maxW: 1920, maxH: 1080, margin: 200 },

  // Capacidad inicial de los pools (crecen solos si se agotan).
  pools: { enemies: 640, projectiles: 900, drops: 700, fx: 900, nums: 96, shots: 240 },

  grid: { cell: 96 },

  // Apuntado automatico: cada ataque (Y / ⚔️) se redirige al enemigo mas cercano dentro del alcance del arma;
  // sin enemigo en alcance usa la mirada o el mouse. Nada ataca solo. Interruptor en el menu (storage cfg.angel.autoaim).
  autoAim: true,
  // Alcance (px) para elegir objetivo. El latigo se calcula con su alcance real por nivel + autoRange.latigoPad.
  autoRange: {
    estaca: 520, agua: 400, latigoPad: 30,
    macuahuitl: 190, minigun: 640, bazuca: 600, lanzallamas: 260, rayo: 900,
    default: 480,
  },

  // Claves que lee player.js. Cambiar aquí cambia al jugador.
  player: {
    hp: 100,
    radius: 16,
    speed: 230,
    accel: 15,
    friction: 20,
    dashTime: 0.25,
    dashSpeed: 820,
    hurtIframes: 0.5,
    aimCone: 25,
    assistRange: 520,
    aimDist: 260,
    magnet: 120,
    // Propios de main.js
    regen: 0.9,          // HP por segundo tras `regenDelay` sin recibir daño
    regenDelay: 4,
    attackBuffer: 0.12,  // s que se recuerda una pulsación de Y mientras el arma recarga
    inputLockAfterMenu: 3, // ticks sin acciones al volver de un menú (evita que "1" de una carta elija arma)
  },

  // Valores que main.js copia sobre ABILITY_BALANCE, PICKUP_BALANCE, SUPER_BALANCE y WEAPON_BALANCE al arrancar.
  balance: {
    bell: { cooldown: 8, radius: 285, damage: 60, knock: 190 },
    dash: { cooldown: 3 },
    magnetBase: 120,
    pickups: { maxGems: 420 },
    // Daño acumulado que sube un arma de nivel: nv1→2, 2→3, 3→4 y 4→5 (WEAPON_BALANCE.mastery de weapons.js).
    mastery: [200, 450, 800, 1300],
  },

  // XP necesaria para pasar de `lvl` al siguiente: base + lin·(lvl-1) + quad·(lvl-1)².
  xp: { base: 5, lin: 4, quad: 0.6 },

  // Enemigos (GDD §1.6). hp/dmg escalan con la oleada (ver `scaling`).
  enemies: {
    chupacabras: { nombre: 'Chupacabras', hp: 26, speed: 92, r: 14, dmg: 7, xp: 1, mass: 1, accel: 9, w: 48, h: 46 },
    murcielago: {
      nombre: 'Murciélago', hp: 10, speed: 168, r: 10, dmg: 5, xp: 1, mass: 0.5, accel: 12,
      zigAmp: 0.95, zigFreq: 5.5, w: 42, h: 34,
    },
    nahual: {
      nombre: 'Nahual', hp: 130, speed: 58, r: 22, dmg: 13, xp: 5, mass: 4, accel: 5,
      push: 900, pushCd: 1.2, w: 68, h: 64,
    },
    llorona: {
      nombre: 'La Llorona', hp: 560, hpGrow: 1.7, speed: 64, r: 34, dmg: 18, xp: 60, mass: 40, accel: 3.5,
      w: 112, h: 128, distance: 250,
      ringEvery: 6.5, ringShots: 14, ringSpeed: 150, ringDmg: 11, ringLife: 3.6, telegraph: 0.8,
      summonEvery: 10, summonCount: 6, firstRing: 3, firstSummon: 6,
    },
  },
  // Escalado por oleada (n = oleada - 1) y por jugadores en cooperativo.
  scaling: { hpPerWave: 0.1, dmgPerWave: 0.04, spdPerWave: 0.008, spdCap: 1.25 },
  coop: { scale: 0.6 },

  // Oleadas (GDD §1.7).
  waves: {
    duration: 30, rest: 3, firstRest: 2.5, spawnWindow: 0.8, bossEvery: 5,
    maxAlive: 300,
    quotaBase: 14, quotaLin: 6, quotaQuad: 0.6, bossQuotaMul: 0.5,
    batFrom: 2, nahualFrom: 3,
    swarmMin: 5, swarmMax: 14,
    nahualCost: 4,
    openingBurst: 6,
    healOnClear: 12,
  },
  // Zona de aparición: justo fuera de la cámara (margen sobre el borde de la vista + empuje de hasta `band`).
  spawn: { margin: 50, band: 150, minPlayerDist: 280 },

  // Tiempos de las superarmas (GDD §1.9); main.js los copia a SUPER_BALANCE.
  supers: { spawnMin: 40, spawnMax: 60, despawn: 25 },

  // Cartas de level-up (GDD §1.10).
  cards: { dmg: 0.15, speed: 0.1, hp: 20, heal: 40, magnet: 0.35, bell: 0.15 },

  // Juice (GDD §1.14).
  juice: {
    shakeHurt: [7, 170], shakeBoss: [10, 420], shakeBossDeath: [16, 520],
    hitstopBossEnrage: 90, hitstopBossDeath: 130, hitstopMax: 150,
    numMin: 0.14, flashEnemy: 0.09, vignetteHp: 0.3,
  },

  stress: { max: 600, minDist: 150, maxDist: 760 },

  records: { key: 'angel.scores', keep: 20, show: 5 },
};

/** XP necesaria para subir desde el nivel `lvl`. */
export function xpNeed(lvl) {
  const n = Math.max(0, (lvl | 0) - 1);
  const X = CONFIG.xp;
  return Math.round(X.base + X.lin * n + X.quad * n * n);
}

export const config = CONFIG;
export default CONFIG;
