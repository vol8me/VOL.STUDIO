import type { LayerRole } from './roles';

/**
 * Hazır stil profilleri — VERİ. Her profil bir estetik adını kontrol
 * alanlarına çözer; render yalnız alanları okur, adı hiçbir DSP kararında
 * kullanılmaz. Oyun/sanatçı adıyla profil yazılmaz: adlandırılmış bir
 * referans ayırt edici niteliklerine (`controls`) çözülüp isimsiz özel
 * stil olarak verilir (bkz. `StyleRefV1`).
 */
export interface StyleControlsV1 {
  /** −1 yumuşak … +1 sert atak (transient şekillendirici; gövde ters yönde). */
  readonly transient: number;
  /** Alçak kesim (Hz); 20 → kesim yok. */
  readonly lowCutHz: number;
  /** Yüksek kesim (Hz); 20000 → kesim yok. */
  readonly highCutHz: number;
  /** 0 temiz … 1 yoğun doygunluk (4× aşırı örnekli tanh). */
  readonly saturation: number;
  /** 0 → yok … 1 → 6 bit + 6× örnek tutma (retro/lo-fi indirgeme). */
  readonly digital: number;
  /** 1 doğal dinamik … 0 yoğun sıkıştırma. */
  readonly dynamics: number;
  /** Stereo genişlik (M/S yan kazancı); 1 → dokunma. Mono programda uygulanmaz. */
  readonly width: number;
  /** Perde dili: kaynak/rezonatör frekans ve uzunluk parametrelerine oktav kayması. */
  readonly pitchOctaves: number;
  /** Bütün send seviyelerine eklenen dB (alan/kuyruk eğilimi). */
  readonly spaceDb: number;
  /** Rol başına katman kazancı eki (dB). */
  readonly roleBalanceDb: Readonly<Partial<Record<LayerRole, number>>>;
}

export interface StyleProfileV1 {
  readonly id: string;
  readonly version: number;
  readonly description: string;
  readonly controls: StyleControlsV1;
}

export const NEUTRAL_STYLE: StyleControlsV1 = {
  transient: 0,
  lowCutHz: 20,
  highCutHz: 20000,
  saturation: 0,
  digital: 0,
  dynamics: 1,
  width: 1,
  pitchOctaves: 0,
  spaceDb: 0,
  roleBalanceDb: {},
};

const profile = (
  id: string,
  description: string,
  controls: Partial<StyleControlsV1>,
): StyleProfileV1 => ({ id, version: 1, description, controls: { ...NEUTRAL_STYLE, ...controls } });

export const STYLE_PROFILES: readonly StyleProfileV1[] = [
  profile('arcade', 'Parlak, kısa, sıkıştırılmış; hafif dijital basamak, kuru alan.', {
    transient: 0.5,
    lowCutHz: 100,
    highCutHz: 10000,
    saturation: 0.3,
    digital: 0.6,
    dynamics: 0.35,
    pitchOctaves: 0.3,
    spaceDb: -12,
  }),
  profile('arcade-industrial', 'Sert atak, doygun mekanizma, dar bant, kuru ve yoğun.', {
    transient: 0.6,
    lowCutHz: 90,
    highCutHz: 9000,
    saturation: 0.65,
    digital: 0.45,
    dynamics: 0.3,
    pitchOctaves: 0.15,
    spaceDb: -9,
    roleBalanceDb: { mechanism: 4, transient: 3, tail: -6 },
  }),
  profile('brutal', 'Aşırı sert atak, ağır doygunluk, pes ve ezici gövde.', {
    transient: 0.8,
    lowCutHz: 25,
    highCutHz: 12000,
    saturation: 0.85,
    digital: 0.15,
    dynamics: 0.2,
    pitchOctaves: -0.35,
    spaceDb: 2,
    roleBalanceDb: { body: 5, transient: 4 },
  }),
  profile('cinematic', 'Geniş bant, derin gövde ve uzun alan; dinamik korunur.', {
    transient: 0.3,
    saturation: 0.15,
    dynamics: 0.75,
    width: 1.4,
    pitchOctaves: -0.2,
    spaceDb: 6,
    roleBalanceDb: { body: 2, tail: 4, space: 4 },
  }),
  profile('clean-sci-fi', 'Temiz, parlak, geniş; doygunluksuz ve hafif tiz perde.', {
    transient: 0.1,
    lowCutHz: 60,
    highCutHz: 18000,
    saturation: 0.05,
    dynamics: 0.6,
    width: 1.3,
    pitchOctaves: 0.2,
    spaceDb: 2,
  }),
  profile('industrial', 'Metalik mekanizma vurgusu, orta doygunluk, sıkı dinamik.', {
    transient: 0.4,
    lowCutHz: 40,
    highCutHz: 14000,
    saturation: 0.55,
    digital: 0.1,
    dynamics: 0.4,
    pitchOctaves: -0.1,
    roleBalanceDb: { mechanism: 5 },
  }),
  profile('lo-fi', 'Dar bant, yumuşak atak, kuantizasyon ve hafif doygunluk.', {
    transient: -0.3,
    lowCutHz: 180,
    highCutHz: 5000,
    saturation: 0.35,
    digital: 0.5,
    dynamics: 0.4,
    spaceDb: -3,
  }),
  profile('minimal', 'Az katman, temiz bant, kısa alan; ayrıntı ve doku kısılır.', {
    lowCutHz: 120,
    highCutHz: 8000,
    dynamics: 0.8,
    spaceDb: -15,
    roleBalanceDb: { detail: -8, texture: -10 },
  }),
  profile('minimal-synthetic', 'Dar bant, doygunluksuz, tiz perde; ayrıntı ve kuyruk atılır.', {
    transient: -0.2,
    lowCutHz: 150,
    highCutHz: 7000,
    dynamics: 0.7,
    pitchOctaves: 0.35,
    spaceDb: -18,
    roleBalanceDb: { detail: -9, tail: -12, texture: -12 },
  }),
  profile('organic', 'Doğal dinamik, geniş bant, doku vurgusu; işleme izi az.', {
    transient: -0.1,
    lowCutHz: 30,
    highCutHz: 16000,
    saturation: 0.05,
    dynamics: 0.95,
    width: 1.1,
    spaceDb: 1,
    roleBalanceDb: { texture: 2 },
  }),
  profile('realistic-heavy', 'Tam bant, ağır ve pes gövde, doğal dinamik, belirgin kuyruk.', {
    transient: 0.2,
    saturation: 0.1,
    dynamics: 0.9,
    pitchOctaves: -0.25,
    spaceDb: 3,
    roleBalanceDb: { body: 3, tail: 2 },
  }),
  profile('retro-digital', 'Yoğun bit/örnek indirgeme, orta sıkıştırma, kuru.', {
    transient: 0.3,
    lowCutHz: 80,
    highCutHz: 12000,
    saturation: 0.2,
    digital: 0.85,
    dynamics: 0.5,
    pitchOctaves: 0.2,
    spaceDb: -12,
  }),
  profile('soft', 'Yumuşak atak, pürüzsüz tiz, geniş dinamik.', {
    transient: -0.6,
    lowCutHz: 60,
    highCutHz: 9000,
    dynamics: 0.85,
    spaceDb: 2,
    roleBalanceDb: { transient: -6 },
  }),
  profile('toy-like', 'Küçük gövde: tiz perde, ince alt bant, kısa alan.', {
    transient: 0.2,
    lowCutHz: 250,
    highCutHz: 11000,
    saturation: 0.1,
    digital: 0.1,
    dynamics: 0.6,
    pitchOctaves: 0.6,
    spaceDb: -10,
    roleBalanceDb: { body: -4 },
  }),
];
