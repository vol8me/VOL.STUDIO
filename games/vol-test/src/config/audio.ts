import type { WeaponStyle } from './tank';
import type { VehicleId } from './vehicles';

/** Aracın sesi: motor perdesi, motor gücü ve palet temposu çarpanları. Striker referanstır. */
export interface VehicleVoice {
  readonly engine: number;
  readonly engineGain: number;
  readonly tracks: number;
}

/** Silahın sesi: top teslimine uygulanan perde (oynatma hızı) ve güç çarpanı. */
export interface WeaponVoice {
  readonly rate: number;
  readonly gain: number;
}

export const AUDIO = {
  loopAssetRoot: 'public/assets/audio/sfx/steel',
  uiAssetRoot: 'public/assets/audio/ui/steel',
  seed: 20261003,
  masterGain: 0.65,
  nearRadius: 160,
  panRadius: 640,
  audibleRadius: 3200,
  blastMid: 400,
  blastFar: 900,
  hardCrashSpeed: 75,
  fullCrashSpeed: 160,
  brakeMinSpeed: 40,
  loopMinGain: 0.001,
  maxLoopVehicles: 4,
  maxVoices: 24,
  maxVoicesPerSound: 3,
  engineLayers: [
    { at: 0, pitch: 780, name: 'engine-idle' },
    { at: 0.5, pitch: 1500, name: 'engine-drive' },
    { at: 1, pitch: 2700, name: 'engine-surge' },
  ],
  engine: {
    idleRpm: 780,
    maxRpm: 2700,
    gain: 0.34,
    motionFloor: 0.015,
    speedWeight: 0.75,
    loadWeight: 0.25,
    boostLoad: 0.15,
  },
  tracks: { gain: 0.3, rateMin: 0.55, rateMax: 1.6 },
  /** Yürüyücünün bacak adımı döngüsü; palet gümbürtüsünün yerine çalar. */
  legs: { gain: 0.3, rateMin: 0.7, rateMax: 1.5 },
  /** Mech'in ağır ayak basışı döngüsü; palet gümbürtüsünün yerine çalar. */
  steps: { gain: 0.34, rateMin: 0.7, rateMax: 1.45 },
  /** Sıçrayıcının dört pençeli sekme döngüsü; palet gümbürtüsünün yerine çalar. */
  bounds: { gain: 0.32, rateMin: 0.7, rateMax: 1.5 },
  /** Süzülen aracın kaldırma pervanesi uğultusu; palet gümbürtüsünün yerine çalar. */
  fans: { gain: 0.34, rateMin: 0.8, rateMax: 1.6 },
  skid: { gain: 0.32, fullSlide: 120, rateMin: 0.8, rateMax: 1.2 },
  servo: { gain: 0.17, rateMin: 0.8, rateMax: 1.1 },
  boost: { gain: 0.28 },
  shotGain: { cannon: 0.75, blast: 0.85, hit: 0.8, crash: 0.7, brake: 0.45, ui: 0.5 },
  /**
   * Araç kimliği sesten de okunur: ağır araç derin ve kalın, hafif araç ince ve tiz, yürüyücü
   * motoru arkada kalır (bacaklar paletten çok gürültü yapmaz). Aynı teslimler perdeyle işlenir.
   */
  vehicleVoice: {
    striker: { engine: 1, engineGain: 1, tracks: 1 },
    bulwark: { engine: 0.66, engineGain: 1.25, tracks: 0.78 },
    dart: { engine: 1.38, engineGain: 0.85, tracks: 1.3 },
    arachnid: { engine: 0.88, engineGain: 0.7, tracks: 0.9 },
    widow: { engine: 1.2, engineGain: 0.55, tracks: 1.3 },
    goliath: { engine: 0.5, engineGain: 1.1, tracks: 0.6 },
    manta: { engine: 1.5, engineGain: 0.5, tracks: 1 },
    barracuda: { engine: 1.4, engineGain: 0.55, tracks: 1.15 },
    leviathan: { engine: 0.55, engineGain: 1.2, tracks: 0.7 },
    warhound: { engine: 1.15, engineGain: 0.7, tracks: 1.25 },
    templar: { engine: 0.9, engineGain: 0.9, tracks: 0.95 },
    juggernaut: { engine: 0.5, engineGain: 1.2, tracks: 0.62 },
    jackal: { engine: 1.3, engineGain: 0.6, tracks: 1.2 },
    panther: { engine: 1.05, engineGain: 0.75, tracks: 1 },
    rhino: { engine: 0.55, engineGain: 1.15, tracks: 0.66 },
  } satisfies Record<VehicleId, VehicleVoice>,
  /**
   * Kabuk top ailesinden, ağır mermi aynı aileden alçak perdeyle çalar; diğer her stilin kendi atış teslimi vardır
   * (`shotAsset`) ve perdesi 1'dir.
   */
  weaponVoice: {
    shell: { rate: 1, gain: 1 },
    slug: { rate: 0.68, gain: 1.2 },
    rail: { rate: 1, gain: 0.95 },
    plasma: { rate: 1, gain: 1 },
    needle: { rate: 1, gain: 0.9 },
    arc: { rate: 1, gain: 0.85 },
    autocannon: { rate: 1, gain: 1 },
    gatling: { rate: 1, gain: 1.1 },
    flak: { rate: 1, gain: 1 },
    lance: { rate: 1, gain: 1 },
    howitzer: { rate: 1, gain: 1.1 },
  } satisfies Record<WeaponStyle, WeaponVoice>,
  /**
   * Tek atımlık araç sesleri (`loopAssetRoot` altında): atılım başlangıcı, parça kopması, boğulma ve
   * sıçrayıcının sıçrayışı ile inişi.
   */
  eventAsset: { dash: 'dash', snap: 'snap', sink: 'sink', leap: 'leap', land: 'land' },
  /** Olay seslerinin kazancı. */
  eventGain: { dash: 0.6, snap: 0.75, sink: 0.8, leap: 0.65, land: 0.8 },
  /** Kendi atış teslimi olan silah stilleri (`loopAssetRoot` altında); olmayan top ailesinden çalar. */
  shotAsset: {
    rail: 'shot-rail',
    plasma: 'shot-plasma',
    needle: 'shot-needle',
    arc: 'shot-arc',
    autocannon: 'shot-autocannon',
    gatling: 'shot-gatling',
    flak: 'shot-flak',
    lance: 'shot-lance',
    howitzer: 'shot-howitzer',
  } as Partial<Record<WeaponStyle, string>>,
} as const;
