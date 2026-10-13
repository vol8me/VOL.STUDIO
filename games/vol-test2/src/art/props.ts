import type { AnimSpec } from './anim';
import type { AssetId } from './manifest';
import type { Vec } from './parts';

/** Karo tabanlı bir yapının bir katmanı. Konumlar tasarım biriminde, bağlantı noktası (pivot) esaslıdır. */
export interface LayerDef {
  readonly id: string;
  readonly asset: AssetId;
  /**
   * Katmanın bağlantı noktasının konumu. Kök katmanda prop sol-üstünden; `parent` varsa ebeveynin
   * bağlantı noktasından ve ebeveynin dönüşüne göre ölçülür (taretin namlu ucu gibi).
   */
  readonly at: Vec;
  /** Bağlantı noktasının varlık içindeki konumu; döndürme ve yerleştirme buradan olur. Varsayılan sol-üst. */
  readonly pivot?: Vec;
  readonly parent?: string;
  readonly blend?: 'add';
  /** Derece olarak dönme; prop dönüşüne eklenir. */
  readonly rotate?: AnimSpec;
  readonly alpha?: AnimSpec;
  /** Katmanın kendi +x yönünde kayma (tasarım birimi): geri tepme. */
  readonly slide?: AnimSpec;
  /** Dokunun kendi +x yönünde kaydırılması (tasarım birimi): konveyör bandı. Katman bir `TilePort` olur. */
  readonly scroll?: AnimSpec;
}

export type PropKind =
  | 'conveyor'
  | 'drill'
  | 'smelter'
  | 'turret'
  | 'wall'
  | 'core'
  | 'nest'
  | 'ore-a'
  | 'ore-b'
  | 'ore-c';

export interface PropDef {
  readonly kind: PropKind;
  /** Kapladığı karo (genişlik, yükseklik). */
  readonly tiles: readonly [number, number];
  readonly layers: readonly LayerDef[];
}

export const TURRET_PERIOD_MS = 1400;

/**
 * Yapı tarifleri. Her biri durağan tabandan ve animasyonlu parçalardan oluşur: bant kayar, matkap ve
 * fan döner, dökümhane parlar, taret süpürür ve ateş eder, çekirdeğin halkası döner ve nabız atar.
 * Bağlantı noktaları ilgili SVG'nin içindeki gerçek eksenlerdir (`tests/lab/props.test.ts` doğrular).
 */
export const PROPS: Readonly<Record<PropKind, PropDef>> = {
  conveyor: {
    kind: 'conveyor',
    tiles: [1, 1],
    layers: [
      { id: 'base', asset: 'conveyor-base', at: [0, 0] },
      {
        id: 'belt',
        asset: 'conveyor-belt',
        at: [8, 16],
        scroll: { kind: 'scroll', unitsPerSecond: 48, period: 48 },
      },
      { id: 'rails', asset: 'conveyor-rails', at: [0, 0] },
    ],
  },
  drill: {
    kind: 'drill',
    tiles: [1, 1],
    layers: [
      { id: 'base', asset: 'drill-base', at: [0, 0] },
      {
        id: 'rotor',
        asset: 'drill-rotor',
        at: [32, 32],
        pivot: [24, 24],
        rotate: { kind: 'spin', rpm: 45 },
      },
    ],
  },
  smelter: {
    kind: 'smelter',
    tiles: [1, 1],
    layers: [
      { id: 'base', asset: 'smelter-base', at: [0, 0] },
      {
        id: 'glow',
        asset: 'smelter-glow',
        at: [0, 0],
        blend: 'add',
        alpha: { kind: 'pulse', min: 0.45, max: 1, hz: 1.4 },
      },
      {
        id: 'fan',
        asset: 'smelter-fan',
        at: [55, 20],
        pivot: [10, 10],
        rotate: { kind: 'spin', rpm: 160 },
      },
    ],
  },
  turret: {
    kind: 'turret',
    tiles: [1, 1],
    layers: [
      { id: 'base', asset: 'turret-base', at: [0, 0] },
      {
        id: 'head',
        asset: 'turret-head',
        at: [32, 32],
        pivot: [20, 20],
        rotate: { kind: 'sweep', centerDeg: 0, amplitudeDeg: 55, hz: 0.22 },
        slide: { kind: 'kick', units: 3.5, periodMs: TURRET_PERIOD_MS, decayMs: 120 },
      },
      {
        id: 'flash',
        asset: 'turret-flash',
        parent: 'head',
        at: [40, 0],
        pivot: [24, 24],
        blend: 'add',
        alpha: { kind: 'flash', periodMs: TURRET_PERIOD_MS, decayMs: 180 },
      },
    ],
  },
  wall: { kind: 'wall', tiles: [1, 1], layers: [{ id: 'base', asset: 'wall', at: [0, 0] }] },
  core: {
    kind: 'core',
    tiles: [3, 3],
    layers: [
      { id: 'base', asset: 'core-base', at: [0, 0] },
      {
        id: 'ring',
        asset: 'core-ring',
        at: [96, 96],
        pivot: [96, 96],
        rotate: { kind: 'spin', rpm: 5 },
      },
      {
        id: 'glow',
        asset: 'core-glow',
        at: [96, 96],
        pivot: [96, 96],
        blend: 'add',
        alpha: { kind: 'pulse', min: 0.55, max: 1, hz: 0.5 },
      },
    ],
  },
  nest: {
    kind: 'nest',
    tiles: [3, 3],
    layers: [
      { id: 'base', asset: 'nest-base', at: [0, 0] },
      {
        id: 'glow',
        asset: 'nest-glow',
        at: [96, 96],
        pivot: [96, 96],
        blend: 'add',
        alpha: { kind: 'pulse', min: 0.4, max: 1, hz: 0.7 },
      },
    ],
  },
  'ore-a': { kind: 'ore-a', tiles: [1, 1], layers: [{ id: 'base', asset: 'ore-a', at: [0, 0] }] },
  'ore-b': { kind: 'ore-b', tiles: [1, 1], layers: [{ id: 'base', asset: 'ore-b', at: [0, 0] }] },
  'ore-c': { kind: 'ore-c', tiles: [1, 1], layers: [{ id: 'base', asset: 'ore-c', at: [0, 0] }] },
};

export const PROP_KINDS = Object.keys(PROPS) as PropKind[];

/** Bir yapıdaki hareketli (animasyonlu ya da animasyonlu ebeveyne bağlı) katman sayısı. */
export function dynamicLayerCount(def: PropDef): number {
  const dynamic = new Set<string>();
  for (const layer of def.layers) {
    const own =
      layer.rotate !== undefined ||
      layer.alpha !== undefined ||
      layer.slide !== undefined ||
      layer.scroll !== undefined;
    if (own || (layer.parent !== undefined && dynamic.has(layer.parent))) dynamic.add(layer.id);
  }
  return dynamic.size;
}
