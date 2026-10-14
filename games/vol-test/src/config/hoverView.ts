import { PALETTE } from './palette';
import type { HoverId } from './vehicles';

/** Bir süzülen aracın parçalarının sanat ölçüleri (SVG piksel birimi = dünya birimi). */
export interface HoverArt {
  readonly hull: { readonly width: number; readonly height: number };
  /** Yan itici gövdesi; sol yan aynadır. `x` iticinin gövde merkezine göre boylamsal yeridir. */
  readonly pod: { readonly width: number; readonly height: number; readonly x: number };
  /** Kaldırma pervanesinin iticideki yeri (itici merkezine göre boylamsal). */
  readonly fan: { readonly x: number };
  /** Taret resmi ve milinin resim içindeki yeri (milin dikey konumu hep ortadır). */
  readonly turret: { readonly width: number; readonly height: number; readonly pivotX: number };
  /** Enerji kimliği: pervane göbeği, itici ışığı ve ağız parlaması bu tondadır. */
  readonly glow: number;
  /** Ağız parlamasının ölçeği ve namlu yayı (vuruş, sertlik, sönüm, azami geri kayma). */
  readonly flashScale: number;
  readonly barrel: {
    readonly kick: number;
    readonly stiffness: number;
    readonly damping: number;
    readonly max: number;
  };
  /** İticinin arka lüle ışığının gövde-yerel boylamsal konumu ve ölçeği. */
  readonly nozzle: { readonly x: number; readonly scale: number };
}

export const HOVER_ART: Readonly<Record<HoverId, HoverArt>> = {
  manta: {
    hull: { width: 60, height: 40 },
    pod: { width: 46, height: 14, x: -4 },
    fan: { x: -2 },
    turret: { width: 40, height: 18, pivotX: 9 },
    glow: 0xb15cff,
    flashScale: 0.9,
    barrel: { kick: -170, stiffness: 520, damping: 20, max: 3 },
    nozzle: { x: -25, scale: 0.55 },
  },
};

export const HOVER_VIEW = {
  depth: 10,
  /** Süzülen aracın gölgesini veren yükseklik (dünya birimi): tanktan çok yüksek, gölge belirgin ayrılır. */
  shadowHeight: 26,
  shadowAlpha: 0.26,
  /** Gövdenin süzülürkenki nefesi: yavaş dikey ölçek salınımı ve atılımda şişmesi. */
  bob: { periodMs: 1700, amount: 0.014, boost: 0.035 },
  /** İtici gövdesi sarsıntıya gövdeden daha az uyar (daha aşağıda ve ağırdır). */
  podFollow: 0.45,
  /** Pervane dönüşü (rad/s): boştaki, hızla artan ve atılımdaki. */
  fan: { idle: 14, perSpeed: 0.09, boost: 38 },
  flashMs: 70,
  dust: {
    emitter: {
      speed: { min: 8, max: 32 },
      lifespan: { min: 260, max: 520 },
      scale: { start: 0.26, end: 0.8 },
      alpha: { start: 0.18, end: 0 },
      tint: PALETTE.dust,
      emitting: false,
    },
    depth: 7,
    /** Bu hızın (birim/s) altında toz kalkmaz; üstünde hızla artar. */
    minSpeed: 40,
    countMax: 2,
  },
} as const;
