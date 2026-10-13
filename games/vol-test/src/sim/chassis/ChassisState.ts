/**
 * Tankın bir adımdan ötekine taşıdığı bütün skaler durum. Ağ uzlaştırması sunucudan gelen bu
 * kümeyi yerel tanka yazar ve bekleyen girdileri üstüne yeniden oynatır; kümeden bir alanın eksik
 * kalması yeniden oynatmada kalıcı sapma demektir. Anlık türevler (`plan` hedefleri, `contact`,
 * `previous` poz) her adımın başında yeniden hesaplandığı için durum değildir.
 */
export interface ChassisState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hull: number;
  angularVelocity: number;
  turret: number;
  trackLeft: number;
  trackRight: number;
  treadLeft: number;
  treadRight: number;
  groundLeft: number;
  groundRight: number;
  surfaceLeft: number;
  surfaceRight: number;
  slideLeft: number;
  slideRight: number;
  slip: number;
  boost: number;
  boosting: boolean;
  reversing: boolean;
  pitch: number;
  pitchVelocity: number;
  roll: number;
  rollVelocity: number;
}

export const CHASSIS_STATE_NUMBERS = [
  'x',
  'y',
  'vx',
  'vy',
  'hull',
  'angularVelocity',
  'turret',
  'trackLeft',
  'trackRight',
  'treadLeft',
  'treadRight',
  'groundLeft',
  'groundRight',
  'surfaceLeft',
  'surfaceRight',
  'slideLeft',
  'slideRight',
  'slip',
  'boost',
  'pitch',
  'pitchVelocity',
  'roll',
  'rollVelocity',
] as const satisfies readonly {
  [K in keyof ChassisState]: ChassisState[K] extends number ? K : never;
}[keyof ChassisState][];

export const CHASSIS_STATE_FLAGS = ['boosting', 'reversing'] as const satisfies readonly {
  [K in keyof ChassisState]: ChassisState[K] extends boolean ? K : never;
}[keyof ChassisState][];

export function createChassisState(): ChassisState {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hull: 0,
    angularVelocity: 0,
    turret: 0,
    trackLeft: 0,
    trackRight: 0,
    treadLeft: 0,
    treadRight: 0,
    groundLeft: 0,
    groundRight: 0,
    surfaceLeft: 0,
    surfaceRight: 0,
    slideLeft: 0,
    slideRight: 0,
    slip: 0,
    boost: 0,
    boosting: false,
    reversing: false,
    pitch: 0,
    pitchVelocity: 0,
    roll: 0,
    rollVelocity: 0,
  };
}
