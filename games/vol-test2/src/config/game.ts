import { KIND } from './factory';

export const GAME = { maxDpr: 2, backgroundColor: '#0d1218' } as const;

/** Çizim ve kamera ayarları. Oynanış sayıları `factory.ts`tedir; burada yalnız sunum vardır. */
export const VIEW = {
  /** Tile kenarı piksel: chunk dokusu 16×16 tile = 256×256 px. */
  tilePx: 16,
  /** Başlangıç yakınlığı: dünyayı sığdıran en uzak zoom'un katı. */
  initialZoomFactor: 3,
  maxZoom: 4,
  /** Aynı anda bellekte tutulan chunk dokusu üst sınırı; fazlası kameradan en uzak olandan düşer. */
  chunkTextureLimit: 96,
  /** Dokunuş: bu kadar piksel ve milisaniyeden azı dokunma sayılır, fazlası kaydırmadır. */
  tapSlopPx: 10,
  tapMaxMs: 350,
  /** Dokunmatikte kımıldamadan bu süreye kadar basılı tutmak ikincil (silme) dokunuşudur. */
  longPressMs: 1200,
  /** Bant eşyaları ve birimler bu yakınlaştırmanın altında çizilmez: tüm dünya görünürken maliyet katlanır. */
  detailMinZoom: 0.45,
  /** Bir karede en çok yeniden çizilen chunk dokusu: ilk yükleme ve toplu değişim takılma yapmaz. */
  chunkRedrawBudget: 8,
  /** Atış çizgisinin ekranda kaldığı süre. */
  shotMs: 90,
  /** Bekleyen komutun hayalet olarak gösterildiği en uzun süre. */
  ghostMs: 1500,
} as const;

/** Kare hızından bağımsız simülasyon hızlandırma ayarı. */
export const PACE = {
  /** Sunucunun gönderdiği adımların arkasında tutulan hedef tampon (adım): ağ titreşimini emer. */
  targetLagTicks: 4,
  /** Tek karede en çok koşturulan simülasyon adımı. */
  maxStepsPerFrame: 8,
} as const;

/**
 * Hareket niyetinin gönderimi: yön değişince en az `minIntervalMs` arayla, yön sürüyorsa `refreshMs`
 * arayla yenilenir (sunucu niyeti `PLAYER.moveTtlTicks` sonra söndürür). Komut hız sınırının altında kalır.
 */
export const STEER = { minIntervalMs: 90, refreshMs: 900 } as const;

/** HUD ve cihaz ölçümü için kayan pencere: son bu kadar kare ve simülasyon adımı. */
export const STATS = { windowSamples: 240 } as const;

export const PALETTE = {
  ground: '#17202a',
  groundAlt: '#1a2430',
  ore: '#5b4b27',
  oreAlt: '#665430',
  conveyor: '#7d8a97',
  conveyorEdge: '#4b5560',
  arrow: '#d5dde5',
  drill: '#a5642f',
  drillCore: '#4a2c12',
  smelter: '#c4562d',
  smelterGlow: '#ffb27a',
  core: '#2f7fd1',
  coreRim: '#8ec5ff',
  turret: '#3f9b5a',
  turretBarrel: '#d1f0da',
  wall: '#6b7480',
  wallEdge: '#939ca8',
  damage: 'rgba(210, 45, 45, 0.45)',
  itemOre: 0xe0b34a,
  itemPlate: 0xdfe6ec,
  crawler: 0xe05555,
  brute: 0xe58a2a,
  shot: 0xfff2a8,
  ghostOk: 0x7ee08a,
  ghostBad: 0xe06a6a,
  healthBack: 0x20262d,
  health: 0x7ee08a,
} as const;

/** Araç çubuğu: sıra, kısayol tuşu ve oyuncunun yerleştirebildiği tür. `remove` komutu tile'ı siler. */
export const TOOLS = [
  { id: 'conveyor', kind: KIND.conveyor, hotkey: '1' },
  { id: 'drill', kind: KIND.drill, hotkey: '2' },
  { id: 'smelter', kind: KIND.smelter, hotkey: '3' },
  { id: 'turret', kind: KIND.turret, hotkey: '4' },
  { id: 'wall', kind: KIND.wall, hotkey: '5' },
  { id: 'remove', kind: null, hotkey: '6' },
] as const;
export type ToolId = (typeof TOOLS)[number]['id'];
