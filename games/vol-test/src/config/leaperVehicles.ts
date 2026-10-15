import { SUSPENSION } from './tank';
import { LEAPER } from './leaper';
import type { LeaperSpec } from './vehicles';

/**
 * Jackal: hafif sıçrayıcı avcı. En çevik ve en hızlı bacaklı araçtır, yönünü bir adımda çevirir; Space
 * ile kayanın ve sığ suyun üstünden uzun bir sıçrayışla atlar. Omuzlarındaki iki kısa saçma topu aynı
 * anda ateşler: yakında sert vurur, uzakta saçılır. Zırhı kâğıt gibidir ve bir bacağı kopunca neredeyse
 * koşamaz; sürüsel avcıdır, tek başına kalınca avlanır.
 */
export const JACKAL: LeaperSpec = {
  kind: 'leaper',
  id: 'jackal',
  health: 100,
  leaper: {
    ...LEAPER,
    mass: 1000,
    halfLength: 22,
    halfWidth: 14,
    trackOffset: 11,
    maxSpeed: 250,
    acceleration: 1700,
    braking: 2200,
    dashMultiplier: 2.2,
    dashAcceleration: 6500,
    maxTurnRate: 5,
    turnAcceleration: 30,
    steerGain: 8,
    turnSpeedFloor: 0.7,
    carve: 0.3,
    turnDip: 0.12,
    strideLength: 44,
    leapTurnRate: 1.4,
    boostCapacity: 66,
    boostDrain: 150,
    boostRegen: 30,
    boostRestart: 66,
    wallRestitution: 0.3,
    impactKick: 0.11,
    turretTurnRate: 6.4,
  },
  suspension: {
    ...SUSPENSION,
    frequency: 3.6,
    damping: 0.4,
    pitchPerAccel: 0.008,
    rollPerAccel: 0.008,
    maxOffset: 2.6,
    roughness: 0.2,
  },
  armament: {
    weapon: {
      // İki namlu aynı anda ateşler: birleşik tempo 560 ms, yakın mesafede sert, uzakta saçılır.
      intervalMs: 560,
      aimTolerance: 0.05,
      projectileSpeed: 1000,
      projectileLifeMs: 450,
      flight: { muzzleHeight: 16, launchSpeed: 40, gravity: 314, drag: 0.5, maxRange: 320 },
      recoilImpulse: 8000,
      hitImpulse: 13000,
      recoilKick: 10,
      damage: 14,
      style: 'flak',
    },
    mounts: [
      { x: 9, y: -8.5, reach: 17.4 },
      { x: 9, y: 8.5, reach: 17.4 },
    ],
    pivot: { x: 9, y: 0 },
    salvo: [[0, 1]],
    toeInRange: 180,
  },
};

/**
 * Panther: orta sınıf sıçrayıcı nişancı. Sırtındaki raylı top uzaktan tek isabetle vurur; yavaş ateşler
 * ama mermisi hızlı ve düzdür. Tehlike yaklaşınca sıçrayıp açılır ya da yan tarafa geçer. Gövdesi
 * alçak ve ince olduğundan ağır zırhlıya karşı isabet almadan kalmak zorundadır.
 */
export const PANTHER: LeaperSpec = {
  kind: 'leaper',
  id: 'panther',
  health: 100,
  leaper: {
    ...LEAPER,
    mass: 1900,
    halfLength: 28,
    halfWidth: 19,
    trackOffset: 14,
    maxSpeed: 190,
    acceleration: 1300,
    braking: 1800,
    dashMultiplier: 2.3,
    dashAcceleration: 5500,
    maxTurnRate: 3.8,
    turnAcceleration: 22,
    steerGain: 6.5,
    turnSpeedFloor: 0.6,
    carve: 0.42,
    turnDip: 0.18,
    strideLength: 58,
    leapTurnRate: 1,
    boostCapacity: 72,
    boostDrain: 150,
    boostRegen: 24,
    boostRestart: 72,
    wallRestitution: 0.24,
    impactKick: 0.08,
    turretTurnRate: 5.2,
  },
  suspension: {
    ...SUSPENSION,
    frequency: 3.2,
    damping: 0.45,
    pitchPerAccel: 0.007,
    rollPerAccel: 0.007,
    maxOffset: 2.4,
    roughness: 0.16,
  },
  armament: {
    weapon: {
      intervalMs: 1150,
      aimTolerance: 0.018,
      projectileSpeed: 1500,
      projectileLifeMs: 800,
      flight: { muzzleHeight: 22, launchSpeed: 70, gravity: 314, drag: 0.15, maxRange: 640 },
      recoilImpulse: 16000,
      hitImpulse: 30000,
      recoilKick: 24,
      damage: 24,
      style: 'rail',
    },
    mounts: [{ x: 6, y: 0, reach: 39 }],
    salvo: [[0]],
    toeInRange: 600,
  },
};

/**
 * Rhino: ağır sıçrayıcı ezici. Kalın zırhlı, yavaş ve geniştir; burnundaki siper mermiyi yutar. Sıçrayışı
 * kısa ve ağırdır ama kayanın ve suyun üstünden geçer. Omuzlarındaki iki kütle topu sırayla ateşler:
 * tempo orta, her mermi sert. Yan ve arkadan çevik avcılar onu oyalar; yakında tek başına bir hat tutar.
 */
export const RHINO: LeaperSpec = {
  kind: 'leaper',
  id: 'rhino',
  health: 200,
  leaper: {
    ...LEAPER,
    mass: 5200,
    halfLength: 36,
    halfWidth: 27,
    trackOffset: 25,
    maxSpeed: 128,
    acceleration: 900,
    braking: 1400,
    dashMultiplier: 2,
    dashAcceleration: 3600,
    gripSensitivity: 0.3,
    maxTurnRate: 2.4,
    turnAcceleration: 12,
    steerGain: 4.5,
    turnSpeedFloor: 0.5,
    carve: 0.5,
    turnDip: 0.24,
    strideLength: 70,
    strideDip: 0.18,
    leapTurnRate: 0.55,
    boostCapacity: 90,
    boostDrain: 150,
    boostRegen: 18,
    boostRestart: 90,
    wallRestitution: 0.16,
    impactKick: 0.04,
    turretTurnRate: 3.4,
  },
  suspension: {
    ...SUSPENSION,
    frequency: 2.4,
    damping: 0.6,
    pitchPerAccel: 0.004,
    rollPerAccel: 0.004,
    maxOffset: 1.8,
    roughness: 0.12,
  },
  armament: {
    weapon: {
      // İki top sırayla ateşler: her biri 1280 ms'de bir atar, birleşik tempo 640 ms.
      intervalMs: 640,
      aimTolerance: 0.035,
      projectileSpeed: 820,
      projectileLifeMs: 1400,
      flight: { muzzleHeight: 28, launchSpeed: 100, gravity: 314, drag: 0.4, maxRange: 600 },
      recoilImpulse: 110000,
      hitImpulse: 140000,
      recoilKick: 48,
      damage: 30,
      style: 'slug',
    },
    mounts: [
      { x: 12, y: -16, reach: 45 },
      { x: 12, y: 16, reach: 45 },
    ],
    pivot: { x: 12, y: 0 },
    salvo: [[0], [1]],
    toeInRange: 440,
  },
};
