import type { FmParams, Waveform } from '../types';
import { OVERSAMPLE_FACTOR } from '../engine/constants';

export type FmAliasLevel = 'safe' | 'caution' | 'risky';

export type FmModulatorClass =
  | 'sine'
  | 'sine-light-feedback'
  | 'sine-heavy-feedback'
  | 'triangle'
  | 'triangle-feedback'
  | 'edge'
  | 'edge-feedback'
  | 'carrier-edge'
  | 'carrier-edge-feedback'
  | 'carrier-triangle'
  | 'carrier-triangle-feedback';

/**
 * Ölçülmüş FM alias sınırları — makine-okunur.
 *
 * Kaynak: `scripts/research/fm-alias-report.ts` ızgarası (taşıyıcı
 * sine/triangle/sawtooth/square × 110–5000 Hz; modülatör
 * sine/triangle/sawtooth/square/pulse; index 0.5–20; oran 0.5–3.5; feedback
 * 0/0.1/0.3; 44.1 kHz; 4800 nokta). Ölçü: işitilir
 * bantta (≤ 0.4535·fs) `fc + k·fm` kafesi dışındaki güç / kafes gücü.
 * Eşik, o sınıfta seviyeyi ilk bozan ölçülmüş tepe sapmasıdır (Δf = I·fm);
 * altında kalan her ızgara noktası o seviyede ölçüldü; `null` sınırsız
 * demektir. Başka örnek oranlarında sapma eşiği oranla ölçeklenir.
 * Korumada Δf=0'a sıkışan noktalar FM'siz taşıyıcı tabanını ölçer;
 * değerlendirmenin kapsamı dışındadır, sınır türetmede kullanılmaz.
 *
 * `carrier-*` sınıfları PM'in taşıyıcı kenarına etkisini taşır: BLEP
 * rezidüeli kenar-zamanlamasını sabit faz adımıyla hesaplar, faz modülasyonu
 * kenarı kaydırınca rezidüel katkısı birkaç dB hatayla yerleşir — kenarlı
 * taşıyıcı, kenarlı modülatörden daha sıkı sınırlara sahiptir (F6a
 * kalibrasyonu).
 */
export const FM_ALIAS_LIMITS = {
  version: 2,
  referenceSampleRate: 44100,
  levels: { safeMaxDb: -60, cautionMaxDb: -30 },
  classes: {
    sine: { safeBelowHz: null, cautionBelowHz: null },
    'sine-light-feedback': { safeBelowHz: 10000, cautionBelowHz: 24690 },
    'sine-heavy-feedback': { safeBelowHz: 27.5, cautionBelowHz: 275 },
    // BLAMP'li üçgen modülatör: güvenli bölge tüm ızgarayı kaplar.
    triangle: { safeBelowHz: 24690, cautionBelowHz: null },
    'triangle-feedback': { safeBelowHz: 27.5, cautionBelowHz: 110 },
    edge: { safeBelowHz: 110, cautionBelowHz: 550 },
    'edge-feedback': { safeBelowHz: 27.5, cautionBelowHz: 27.5 },
    // Kenarlı taşıyıcı (sawtooth/square/pulse): güvenli kırılım Δf=55.
    // Dikkat bandı engebeli: ızgarada ilk >−30 kırılımı 550'de görülür ama
    // ızgara dışı bir nokta (sawtooth fc=220, I=2 → Δf=440) −30'u aşar;
    // sınır son grid-doğrulanmış bölgede tutulur.
    'carrier-edge': { safeBelowHz: 55, cautionBelowHz: 275 },
    'carrier-edge-feedback': { safeBelowHz: 27.5, cautionBelowHz: 27.5 },
    // Üçgen taşıyıcı: BLAMP düzeltmesi kenar zamanlamasını sabit faz
    // adımıyla hesaplar, PM kenarı kaydırınca katkı birkaç dB hatayla
    // yerleşir. Ölçülen ilk kırılım güvenli için Δf=1760, dikkat için
    // Δf=17600; kenarlı modülatör ya da feedback birleşiminde ızgaranın
    // en küçük sapması (27.5) zaten −30'u aşar.
    'carrier-triangle': { safeBelowHz: 1760, cautionBelowHz: 17600 },
    'carrier-triangle-feedback': { safeBelowHz: 27.5, cautionBelowHz: 27.5 },
  } satisfies Record<
    FmModulatorClass,
    { safeBelowHz: number | null; cautionBelowHz: number | null }
  >,
} as const;

/** Feedback bu değeri (döngü) aşınca modülatör belirgin harmonik kazanır. */
const LIGHT_FEEDBACK = 0.1;

export interface FmAliasAssessment {
  readonly level: FmAliasLevel;
  readonly modulatorClass: FmModulatorClass;
  /** Motorun index korumasından sonra kalan etkin index. */
  readonly effectiveIndex: number;
  /** Tepe frekans sapması Δf = etkin index × modülatör frekansı (Hz). */
  readonly peakDeviationHz: number;
}

function classify(fm: FmParams, carrierWave: Waveform): FmModulatorClass {
  const feedback = Math.abs(fm.feedback ?? 0);
  const wave = fm.modulatorWave ?? 'sine';
  const modEdge = wave === 'sawtooth' || wave === 'square' || wave === 'pulse';
  // Kenarlı ya da periyodik olmayan taşıyıcı PM altında BLEP'in sabit faz
  // adımı varsayımını bozar; ölçüm sinüs taşıyıcılı kenarlı modülatörden
  // daha kötüdür, kendi sınıfı vardır. Kenarlı modülatör ya da feedback
  // birleşimi en kötü duruma sayılır.
  if (carrierWave !== 'sine' && carrierWave !== 'triangle') {
    return feedback > 0 || modEdge ? 'carrier-edge-feedback' : 'carrier-edge';
  }
  // Üçgen taşıyıcının BLAMP köşe düzeltmesi PM altında kendi ölçülmüş
  // sınırlarını verir; kenarlı modülatör birleşimi feedback'e denk sayılır.
  if (carrierWave === 'triangle') {
    return feedback > 0 || modEdge ? 'carrier-triangle-feedback' : 'carrier-triangle';
  }
  if (modEdge) return feedback > 0 ? 'edge-feedback' : 'edge';
  if (wave === 'triangle') return feedback > 0 ? 'triangle-feedback' : 'triangle';
  if (feedback === 0) return 'sine';
  return feedback <= LIGHT_FEEDBACK ? 'sine-light-feedback' : 'sine-heavy-feedback';
}

/**
 * Bir FM ayarının alias riskini ÖLÇÜLMÜŞ sınırlardan tahmin eder; render
 * etmez. Yalnız FM'in yol açtığı katlanmayı değerlendirir: FM'siz kenarlı
 * bir taşıyıcının kendi (PolyBLEP) alias'ı ayrı ölçülmüştür (DESIGN).
 * Motorun index koruması (yan bantlar iç Nyquist'in altında) burada da
 * uygulanır, yani değerlendirilen sapma motorun gerçekten çalacağıdır.
 * Zarf ve `modulatorLevel` tepe değeriyle sayılır (en kötü an).
 */
export function assessFmAlias(input: {
  readonly frequency: number;
  readonly fm: FmParams;
  readonly sampleRate?: number;
  readonly wave?: Waveform;
}): FmAliasAssessment {
  const sampleRate = input.sampleRate ?? FM_ALIAS_LIMITS.referenceSampleRate;
  const modulatorFrequency = input.frequency * (input.fm.ratio ?? 1);
  const requested = (input.fm.index ?? 0) * (input.fm.modulatorLevel ?? 1);
  const internalNyquist = 0.45 * sampleRate * OVERSAMPLE_FACTOR;
  const guard =
    modulatorFrequency > 0 ? (internalNyquist - input.frequency) / modulatorFrequency - 2 : 0;
  const effectiveIndex = Math.max(0, Math.min(requested, guard));
  const peakDeviationHz = effectiveIndex * modulatorFrequency;
  const modulatorClass = classify(input.fm, input.wave ?? 'sine');
  const limits = FM_ALIAS_LIMITS.classes[modulatorClass];
  const scale = sampleRate / FM_ALIAS_LIMITS.referenceSampleRate;
  const below = (limit: number | null): boolean =>
    limit === null || peakDeviationHz < limit * scale;
  let level: FmAliasLevel = 'risky';
  if (peakDeviationHz === 0 || below(limits.safeBelowHz)) level = 'safe';
  else if (below(limits.cautionBelowHz)) level = 'caution';
  return { level, modulatorClass, effectiveIndex, peakDeviationHz };
}
