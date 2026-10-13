import { VEHICLES, type TankId, type TankSpec } from './vehicles';

/** Palet bandı dokusunun ortak adımı: yol, kare sayısı ve sayfa sütunu. */
export const TREAD_FRAMES = { period: 8, frames: 32, columns: 8 } as const;

/**
 * Palet geometrisi fizikten türer: palet merkezi `trackOffset`te, eni gövde ayak izinin dış
 * kenarına kadar, uçlar ayak izinin boyunda yarım daire.
 */
export interface TreadView {
  /** Bandın boyu ve eni (uçlar hariç). */
  readonly width: number;
  readonly height: number;
  readonly offset: number;
  readonly period: number;
  readonly frames: number;
  readonly columns: number;
}

export function treadView(spec: TankSpec): TreadView {
  const height = 2 * (spec.tank.halfWidth - spec.tank.trackOffset);
  return {
    width: 2 * spec.tank.halfLength - height,
    height,
    offset: spec.tank.trackOffset,
    ...TREAD_FRAMES,
  };
}

export const TANK_LIGHTS = {
  depth: 11,
  flashMs: 70,
} as const;

/** Bir tankın parçalarının sanat ölçüleri (SVG piksel birimi = dünya birimi). */
export interface TankArt {
  readonly hull: { readonly width: number; readonly height: number };
  /** Taret resmi ve milinin resim içindeki yeri (milin dikey konumu hep ortadır). */
  readonly turret: { readonly width: number; readonly height: number; readonly pivotX: number };
  /** Duyargalar gövdenin iki yanına arkadan bağlanır; `rest` dinlenme açısıdır (radyan). */
  readonly feeler: {
    readonly width: number;
    readonly height: number;
    readonly anchorX: number;
    readonly anchorY: number;
    readonly rest: number;
  };
  /** Çekirdek ışığının ölçeği (turret milinin altındaki nabız). */
  readonly coreScale: number;
  /** Ağız parlamasının ölçeği. */
  readonly flashScale: number;
  /** Namlunun (taret resminin) geri tepme yayı: vuruş, sertlik, sönüm ve azami geri kayma. */
  readonly barrel: {
    readonly kick: number;
    readonly stiffness: number;
    readonly damping: number;
    readonly max: number;
  };
}

export const TANK_ART: Readonly<Record<TankId, TankArt>> = {
  striker: {
    hull: { width: 48, height: 36 },
    turret: { width: 44, height: 24, pivotX: 12 },
    feeler: { width: 18, height: 6, anchorX: -17, anchorY: 6.5, rest: 0.35 },
    coreScale: 0.75,
    flashScale: 1,
    barrel: { kick: -210, stiffness: 420, damping: 22, max: 5 },
  },
  bulwark: {
    hull: { width: 60, height: 50 },
    turret: { width: 62, height: 40, pivotX: 18 },
    feeler: { width: 14, height: 7, anchorX: -24, anchorY: 9, rest: 0.28 },
    coreScale: 0.95,
    flashScale: 1.6,
    barrel: { kick: -320, stiffness: 360, damping: 24, max: 8 },
  },
  dart: {
    hull: { width: 44, height: 30 },
    turret: { width: 50, height: 22, pivotX: 11 },
    feeler: { width: 26, height: 6, anchorX: -14, anchorY: 4.5, rest: 0.42 },
    coreScale: 0.62,
    flashScale: 0.8,
    barrel: { kick: -150, stiffness: 520, damping: 20, max: 3.5 },
  },
};

/** Görünümü olan paletli araçlar. */
export function tankSpecs(): readonly TankSpec[] {
  return Object.values(VEHICLES).filter((spec): spec is TankSpec => spec.kind === 'tank');
}
