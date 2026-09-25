import { hashCanonical, type Sha256 } from '../protocol/canonical';
import type { TreatmentV1 } from './treatment';

/**
 * Teslim profilleri (`treatment-profile-v1`): aynı kaynaktan türeyen
 * uzaklık, engel, ortam ve cihaz varyantlarının ADLI, sürümlü işleme
 * tarifleri. Profil yalnız düğüm zinciri üretir; program ona kaynak
 * programın `treatment` alanı olarak girer ve işleme katmanı onu kaynağın
 * bitmiş çıktısına uygular. Sayılar tasarım değeridir, gerekçesi yanında:
 * fiziksel modeli olan yerde (hava soğurması, mesafe) model uygulanır,
 * olmayan yerde (yansıma oranı, iletim kaybı eğimi) seçim adıyla yazılır ve
 * yönü ölçülür (`tests/program/treatment.test.ts`).
 *
 * Mesafe profilleri seviyeyi 1/r ile düşürmez: oyun motoru mesafe
 * zayıflamasını çalışma zamanında kendisi uygular, pişmiş varyant onu ikinci
 * kez uygularsa ses iki kez söner. Profil yalnız mesafenin KARAKTERİNİ
 * (tiz soğurması, atak yumuşaması, yansıma payı, dar görüntü) ve küçük bir
 * seviye farkını pişirir; 1/r değeri tüketiciye `model.inverseSquareDb`
 * olarak bildirilir.
 */
export const TREATMENT_PROFILE_SCHEME = 'treatment-profile-v1';

export type TreatmentKind = 'distance' | 'occlusion' | 'medium' | 'device';
/** Görüntü: kaynak kanal sayısı korunur, daraltılır ya da mono'ya katlanır (yerleşim izin verirse). */
export type TreatmentImage = 'keep' | 'mono';

export interface TreatmentProfileV1 {
  readonly id: string;
  readonly version: number;
  readonly kind: TreatmentKind;
  readonly description: string;
  readonly image: TreatmentImage;
  /** Tüketiciye bilgi; render'a girmez. */
  readonly model: Readonly<Record<string, number>>;
  /** Kuyruk payı (sn); loop kaynağında dairesel işlendiği için yok sayılır. */
  readonly tailSeconds: number;
  /** Kaynağa göre seviye (LU, en yüksek momentary). */
  readonly levelLu: number;
  readonly chain: TreatmentV1['chain'];
}

const node = (primitive: string, params: Record<string, number | string>) => ({
  primitive,
  version: 1,
  params,
});
const REFERENCE_METERS = 5;
const inverseSquareDb = (meters: number) =>
  Number((20 * Math.log10(REFERENCE_METERS / meters)).toFixed(2));

function distance(
  id: string,
  meters: number,
  shape: {
    readonly attackDb: number;
    readonly reverb: number;
    readonly preDelay: number;
    readonly width: number;
    readonly levelLu: number;
    readonly tail: number;
  },
): TreatmentProfileV1 {
  return {
    id,
    version: 1,
    kind: 'distance',
    description:
      `${meters} m: ISO 9613-1 hava soğurması, atak ${shape.attackDb} dB, yansıma payı ` +
      `${shape.reverb}, görüntü ×${shape.width}. 1/r zayıflaması çalışma zamanınındır.`,
    image: 'keep',
    model: {
      distanceM: meters,
      referenceM: REFERENCE_METERS,
      inverseSquareDb: inverseSquareDb(meters),
    },
    tailSeconds: shape.tail,
    levelLu: shape.levelLu,
    // Yansımalar da aynı yolu gider: soğurma yankıdan SONRA hem doğrudan
    // yola hem yankıya uygulanır.
    chain: [
      ...(shape.attackDb < 0
        ? [node('effect.transient-shaper', { attackDb: shape.attackDb, sustainDb: 0 })]
        : []),
      node('effect.reverb', {
        decay: 1.6,
        roomSize: 0.8,
        damp: 0.6,
        preDelay: shape.preDelay,
        amount: shape.reverb,
      }),
      node('effect.air-absorption', { distance: meters, humidity: 0.5 }),
      node('effect.width', { width: shape.width }),
    ],
  };
}

export const TREATMENT_PROFILES: readonly TreatmentProfileV1[] = [
  distance('distance-near', 5, {
    attackDb: 0,
    reverb: 0.06,
    preDelay: 0.005,
    width: 1,
    levelLu: 0,
    tail: 0.6,
  }),
  distance('distance-mid', 30, {
    attackDb: -6,
    reverb: 0.3,
    preDelay: 0.03,
    width: 0.6,
    levelLu: -3,
    tail: 1.4,
  }),
  distance('distance-far', 150, {
    attackDb: -15,
    reverb: 0.55,
    preDelay: 0.07,
    width: 0.25,
    levelLu: -6,
    tail: 2,
  }),
  {
    id: 'occluded',
    version: 1,
    kind: 'occlusion',
    description:
      'Engel ardında (kırınım): doğrudan yolun tizi kırılır (1.8 kHz alçak geçiren, 12 dB/oktav), ' +
      'atak yumuşar, çevreden dolaşan yansıma payı artar.',
    image: 'keep',
    model: { cutoffHz: 1800 },
    tailSeconds: 0.9,
    levelLu: -5,
    chain: [
      node('effect.eq-pass', { response: 'lowpass', frequency: 1800, order: 1 }),
      node('effect.transient-shaper', { attackDb: -6, sustainDb: 0 }),
      node('effect.reverb', { decay: 1, roomSize: 0.6, damp: 0.6, preDelay: 0.02, amount: 0.25 }),
    ],
  },
  {
    id: 'behind-wall',
    version: 1,
    kind: 'occlusion',
    description:
      'Duvarın ardı (iletim): kütle yasası tizi oktav başına ≈6 dB daha çok keser; 350 Hz, ' +
      '24 dB/oktav alçak geçiren + atak kaybı; öteki odanın kısa yankısı, dar görüntü.',
    image: 'mono',
    model: { cutoffHz: 350 },
    tailSeconds: 0.7,
    levelLu: -9,
    chain: [
      node('effect.eq-pass', { response: 'lowpass', frequency: 350, order: 2 }),
      node('effect.transient-shaper', { attackDb: -12, sustainDb: 0 }),
      node('effect.reverb', { decay: 0.6, roomSize: 0.3, damp: 0.7, preDelay: 0.01, amount: 0.25 }),
      node('effect.width', { width: 0 }),
    ],
  },
  {
    id: 'underwater',
    version: 1,
    kind: 'medium',
    description:
      'Su altı: 600 Hz, 24 dB/oktav alçak geçiren; 220 Hz’te gövde rezonansı (+5 dB); yoğun, kısa, ' +
      'koyu yankı; atak kaybı.',
    image: 'keep',
    model: { cutoffHz: 600 },
    tailSeconds: 0.9,
    levelLu: -5,
    chain: [
      node('effect.eq-pass', { response: 'lowpass', frequency: 600, order: 2 }),
      node('effect.eq-bell', { frequency: 220, gainDb: 5, q: 1.2 }),
      node('effect.transient-shaper', { attackDb: -10, sustainDb: 0 }),
      node('effect.reverb', {
        decay: 0.9,
        roomSize: 0.25,
        damp: 0.85,
        preDelay: 0.005,
        amount: 0.35,
      }),
      node('effect.width', { width: 0.3 }),
    ],
  },
  {
    id: 'radio',
    version: 1,
    kind: 'device',
    description:
      'Telsiz: 350–3200 Hz bant (24 dB/oktav), 1.8 kHz varlık tepesi, tanh sürüş ve ağır ' +
      'sıkıştırma; mono.',
    image: 'mono',
    model: { lowHz: 350, highHz: 3200 },
    tailSeconds: 0,
    levelLu: 0,
    chain: [
      node('effect.eq-pass', { response: 'highpass', frequency: 350, order: 2 }),
      node('effect.eq-pass', { response: 'lowpass', frequency: 3200, order: 2 }),
      node('effect.eq-bell', { frequency: 1800, gainDb: 4, q: 1 }),
      node('effect.saturation', { driveDb: 12, character: 'tanh', mix: 1, outputDb: -6 }),
      node('effect.compressor', {
        thresholdDb: -24,
        ratio: 6,
        attackSeconds: 0.002,
        releaseSeconds: 0.12,
      }),
      node('effect.width', { width: 0 }),
    ],
  },
];

export function treatmentProfile(id: string): TreatmentProfileV1 | undefined {
  return TREATMENT_PROFILES.find((p) => p.id === id);
}

/** Profilin kimlik özeti: sürüm + render'a giren her şey (açıklama ve model bilgisi hariç). */
export function treatmentProfileHash(profile: TreatmentProfileV1): Sha256 {
  const { description: _text, model: _model, ...render } = profile;
  return hashCanonical({ scheme: TREATMENT_PROFILE_SCHEME, ...render });
}

/**
 * Profili kaynağa göre `treatment` belgesine genişletir. `mono` görüntü
 * yerleşim mono'ya izin veriyorsa kanalı katlar; vermiyorsa (müzik zemini)
 * kanal sayısı korunur ve görüntü zincirdeki genişlik düğümüyle daralır.
 */
export function expandTreatment(
  profile: TreatmentProfileV1,
  source: { readonly channels: 1 | 2; readonly loop: boolean; readonly monoAllowed: boolean },
  ceilingDbtp: number,
): TreatmentV1 {
  const channels = profile.image === 'mono' && source.monoAllowed ? 1 : source.channels;
  return {
    chain: profile.chain,
    channels,
    ...(source.loop || profile.tailSeconds === 0 ? {} : { tailSeconds: profile.tailSeconds }),
    ...(profile.levelLu === 0 ? {} : { levelLu: profile.levelLu }),
    limiter: { ceilingDbtp },
  };
}
