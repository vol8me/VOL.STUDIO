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
  | 'edge-feedback';

/**
 * Ölçülmüş FM alias sınırları — makine-okunur.
 *
 * Kaynak: `scripts/fm-alias-report.ts` ızgarası (taşıyıcı sinüs; modülatör
 * sine/triangle/sawtooth/square/pulse; index 0.5–20; oran 0.5–3.5; feedback
 * 0/0.1/0.3; taşıyıcı 110–5000 Hz; 44.1 kHz; 1200 nokta). Ölçü: işitilir
 * bantta (≤ 0.4535·fs) `fc + k·fm` kafesi dışındaki güç / kafes gücü.
 * Eşik, o sınıfta seviyeyi ilk bozan ölçülmüş tepe sapmasıdır (Δf = I·fm);
 * altında kalan her ızgara noktası o seviyede ölçüldü; `null` sınırsız
 * demektir. Başka örnek oranlarında sapma eşiği oranla ölçeklenir.
 */
export const FM_ALIAS_LIMITS = {
  version: 1,
  referenceSampleRate: 44100,
  levels: { safeMaxDb: -60, cautionMaxDb: -30 },
  classes: {
    sine: { safeBelowHz: null, cautionBelowHz: null },
    'sine-light-feedback': { safeBelowHz: 10000, cautionBelowHz: 24690 },
    'sine-heavy-feedback': { safeBelowHz: 27.5, cautionBelowHz: 275 },
    triangle: { safeBelowHz: 1250, cautionBelowHz: 24690 },
    'triangle-feedback': { safeBelowHz: 27.5, cautionBelowHz: 440 },
    edge: { safeBelowHz: 110, cautionBelowHz: 550 },
    'edge-feedback': { safeBelowHz: 27.5, cautionBelowHz: 27.5 },
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
  // Sinüs olmayan taşıyıcı PM altında PolyBLEP varsayımını (sabit faz adımı)
  // bozar; kenarlı modülatör kadar riskli sayılır.
  if (carrierWave !== 'sine' || wave === 'sawtooth' || wave === 'square' || wave === 'pulse') {
    return feedback > 0 ? 'edge-feedback' : 'edge';
  }
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
