import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject, type ParamObject } from '../guard/read';
import { ASSET_CLASS_POLICIES, evaluateAssetPolicy, type AssetClass } from './assetQa';
import { countOnsets, estimatePitch, estimatePulseRate } from './descriptors';
import { measurementOf, type AudioAnalysisReportV1, type SpectralBand } from './report';

/**
 * Mekanik denetim sözlüğü — arama filtreleri ve canary beklentileri AYNI
 * bildirimsel dili konuşur. Bir denetim ölçtüğü değeri ve eşiğini raporlar;
 * hiçbir denetim "iyi ses" ya da "organik" hükmü vermez, birleşik bir kalite
 * puanı da üretilmez.
 */
export const CHECKS_VERSION = 1;

/** Rapordan okunan sayısal betimleyiciler. `spectralPeakHz` perde DEĞİLDİR. */
export const DESCRIPTORS = {
  durationSeconds: (r: AudioAnalysisReportV1) => r.format.durationSeconds,
  activeSeconds: (r: AudioAnalysisReportV1) => r.temporal.activeSeconds,
  attackSeconds: (r: AudioAnalysisReportV1) => r.temporal.attackSeconds,
  decay40Seconds: (r: AudioAnalysisReportV1) => r.temporal.decay40Seconds,
  maxMomentaryLufs: (r: AudioAnalysisReportV1) => r.level.maxMomentaryLufs,
  integratedLufs: (r: AudioAnalysisReportV1) => r.level.integratedLufs,
  truePeakDbtp: (r: AudioAnalysisReportV1) => r.level.truePeakDbtp,
  crestFactorDb: (r: AudioAnalysisReportV1) => r.level.crestFactorDb,
  centroidHz: (r: AudioAnalysisReportV1) => r.spectral.centroidHz,
  rolloff85Hz: (r: AudioAnalysisReportV1) => r.spectral.rolloff85Hz,
  flatness: (r: AudioAnalysisReportV1) => r.spectral.flatness,
  spectralPeakHz: (r: AudioAnalysisReportV1) => r.spectral.peakHz,
} as const;
export type DescriptorName = keyof typeof DESCRIPTORS;

export type MechanicalCheckV1 =
  | { readonly kind: 'asset-policy'; readonly assetClass: AssetClass }
  | { readonly kind: 'clipping' }
  | { readonly kind: 'clicks'; readonly max: number }
  | {
      readonly kind: 'descriptor';
      readonly descriptor: DescriptorName;
      readonly min?: number;
      readonly max?: number;
    }
  | { readonly kind: 'onset-rate'; readonly min?: number; readonly max?: number }
  | { readonly kind: 'pulse-rate'; readonly min?: number; readonly max?: number }
  | {
      readonly kind: 'pitch';
      readonly min?: number;
      readonly max?: number;
      readonly minConfidence?: number;
      readonly window?: readonly [number, number];
    }
  | {
      readonly kind: 'pitch-contour';
      readonly shape: 'rise-fall' | 'rising' | 'falling';
      readonly minRatio: number;
    }
  /** Güvenilir perde ÖLÇÜLEMEZ (nefes, gürültü, kabarcık bulutu): YIN `null` ya da güven < eşik. */
  | { readonly kind: 'aperiodic'; readonly maxConfidence: number }
  | {
      readonly kind: 'band-dominance';
      readonly dominant: SpectralBand;
      readonly over: SpectralBand;
    };

export interface CheckResult {
  readonly check: MechanicalCheckV1;
  readonly pass: boolean;
  /** Ölçülen değer(ler); ölçülemediyse `null`. */
  readonly measured: number | readonly (number | null)[] | null;
  readonly reason: string | null;
}

const BANDS: readonly SpectralBand[] = ['sub', 'low', 'mid', 'high', 'air'];
export const CHECK_KINDS = [
  'asset-policy',
  'clipping',
  'clicks',
  'descriptor',
  'onset-rate',
  'pulse-rate',
  'pitch',
  'pitch-contour',
  'aperiodic',
  'band-dominance',
] as const;

function optionalRange(o: ParamObject, path: string): { min?: number; max?: number } {
  const min = o.min === undefined ? undefined : checkNumber(o.min, `${path}.min`);
  const max = o.max === undefined ? undefined : checkNumber(o.max, `${path}.max`);
  if (min === undefined && max === undefined) {
    throw new AudioParamError(path, 'required', 'en az min ya da max gerekir', o);
  }
  if (min !== undefined && max !== undefined && min > max) {
    throw new AudioParamError(`${path}.max`, 'range', 'min ≤ max olmalı', max);
  }
  return { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) };
}

/** Bildirimi doğrular; bilinmeyen tür/alan render'dan önce reddedilir. */
export function validateCheck(value: unknown, path: string): MechanicalCheckV1 {
  const head = checkObject(value, path, Object.keys((value as object) ?? {}));
  const kind = checkChoice(head.kind, `${path}.kind`, CHECK_KINDS);
  switch (kind) {
    case 'asset-policy': {
      const o = checkObject(value, path, ['kind', 'assetClass']);
      const classes = Object.keys(ASSET_CLASS_POLICIES.classes) as AssetClass[];
      return { kind, assetClass: checkChoice(o.assetClass, `${path}.assetClass`, classes) };
    }
    case 'clipping':
      checkObject(value, path, ['kind']);
      return { kind };
    case 'clicks': {
      const o = checkObject(value, path, ['kind', 'max']);
      return { kind, max: checkNumber(o.max, `${path}.max`, { min: 0, integer: true }) };
    }
    case 'descriptor': {
      const o = checkObject(value, path, ['kind', 'descriptor', 'min', 'max']);
      const names = Object.keys(DESCRIPTORS) as DescriptorName[];
      return {
        kind,
        descriptor: checkChoice(o.descriptor, `${path}.descriptor`, names),
        ...optionalRange(o, path),
      };
    }
    case 'onset-rate':
    case 'pulse-rate': {
      const o = checkObject(value, path, ['kind', 'min', 'max']);
      return { kind, ...optionalRange(o, path) };
    }
    case 'pitch': {
      const o = checkObject(value, path, ['kind', 'min', 'max', 'minConfidence', 'window']);
      const window =
        o.window === undefined
          ? undefined
          : (() => {
              const pair = checkArray(o.window, `${path}.window`);
              if (pair.length !== 2)
                throw new AudioParamError(
                  `${path}.window`,
                  'type',
                  '[başlangıç, bitiş] saniye',
                  pair,
                );
              const from = checkNumber(pair[0], `${path}.window[0]`, { min: 0 });
              return [from, checkNumber(pair[1], `${path}.window[1]`, { above: from })] as const;
            })();
      return {
        kind,
        ...optionalRange(o, path),
        ...(o.minConfidence === undefined
          ? {}
          : {
              minConfidence: checkNumber(o.minConfidence, `${path}.minConfidence`, {
                min: 0,
                max: 1,
              }),
            }),
        ...(window ? { window } : {}),
      };
    }
    case 'pitch-contour': {
      const o = checkObject(value, path, ['kind', 'shape', 'minRatio']);
      return {
        kind,
        shape: checkChoice(o.shape, `${path}.shape`, ['rise-fall', 'rising', 'falling'] as const),
        minRatio: checkNumber(o.minRatio, `${path}.minRatio`, { min: 1, max: 8 }),
      };
    }
    case 'aperiodic': {
      const o = checkObject(value, path, ['kind', 'maxConfidence']);
      return {
        kind,
        maxConfidence: checkNumber(o.maxConfidence, `${path}.maxConfidence`, { min: 0, max: 1 }),
      };
    }
    case 'band-dominance': {
      const o = checkObject(value, path, ['kind', 'dominant', 'over']);
      const dominant = checkChoice(o.dominant, `${path}.dominant`, BANDS);
      const over = checkChoice(o.over, `${path}.over`, BANDS);
      if (dominant === over)
        throw new AudioParamError(`${path}.over`, 'combination', 'farklı bant olmalı', over);
      return { kind, dominant, over };
    }
  }
}

export interface CheckAudio {
  readonly channels: readonly Float32Array[];
  readonly sampleRate: number;
}

const inRange = (value: number, min?: number, max?: number) =>
  (min === undefined || value >= min) && (max === undefined || value <= max);
const describeRange = (min?: number, max?: number) => `[${min ?? '−∞'}, ${max ?? '∞'}]`;

function rangeResult(
  check: MechanicalCheckV1 & { min?: number; max?: number },
  value: number | null,
  label: string,
): CheckResult {
  if (value === null) return { check, pass: false, measured: null, reason: `${label} ölçülemedi` };
  const pass = inRange(value, check.min, check.max);
  return {
    check,
    pass,
    measured: value,
    reason: pass
      ? null
      : `${label} ${Number(value.toPrecision(5))} ∉ ${describeRange(check.min, check.max)}`,
  };
}

function pitchIn(audio: CheckAudio, from: number, to: number): number | null {
  const frames = audio.channels[0]?.length ?? 0;
  const estimate = estimatePitch(audio.channels, audio.sampleRate, {
    from: Math.max(0, Math.floor(from * frames)),
    to: Math.min(frames, Math.ceil(to * frames)),
  });
  return estimate.hz;
}

export function evaluateCheck(
  check: MechanicalCheckV1,
  audio: CheckAudio,
  report: AudioAnalysisReportV1,
): CheckResult {
  switch (check.kind) {
    case 'asset-policy': {
      const verdict = evaluateAssetPolicy(measurementOf(report), check.assetClass);
      const pass = verdict.violations.length === 0;
      return {
        check,
        pass,
        measured: report.level.maxMomentaryLufs,
        reason: pass ? null : `kaynak PCM ${check.assetClass}: ${verdict.violations.join('; ')}`,
      };
    }
    case 'clipping': {
      const n = report.defects.clips.channelSamples;
      return {
        check,
        pass: n === 0,
        measured: n,
        reason: n === 0 ? null : `${n} kırpılmış kanal örneği`,
      };
    }
    case 'clicks': {
      const n = report.defects.clicks.count;
      return {
        check,
        pass: n <= check.max,
        measured: n,
        reason: n <= check.max ? null : `${n} tık adayı > ${check.max}`,
      };
    }
    case 'descriptor':
      return rangeResult(check, DESCRIPTORS[check.descriptor](report), check.descriptor);
    case 'onset-rate':
      return rangeResult(
        check,
        countOnsets(audio.channels, audio.sampleRate).perSecond,
        'başlangıç/sn',
      );
    case 'pulse-rate':
      return rangeResult(
        check,
        estimatePulseRate(audio.channels, audio.sampleRate).hz,
        'darbe hızı (Hz)',
      );
    case 'pitch': {
      const frames = audio.channels[0]?.length ?? 0;
      const [from, to] = check.window ?? [0, frames / audio.sampleRate];
      const estimate = estimatePitch(audio.channels, audio.sampleRate, {
        from: Math.floor(from * audio.sampleRate),
        to: Math.min(frames, Math.ceil(to * audio.sampleRate)),
      });
      if (
        estimate.hz !== null &&
        check.minConfidence !== undefined &&
        estimate.confidence < check.minConfidence
      ) {
        return {
          check,
          pass: false,
          measured: estimate.hz,
          reason: `perde güveni ${estimate.confidence.toFixed(2)} < ${check.minConfidence}`,
        };
      }
      return rangeResult(check, estimate.hz, 'perde (Hz)');
    }
    case 'pitch-contour': {
      const values = [
        pitchIn(audio, 0.05, 0.3),
        pitchIn(audio, 0.35, 0.65),
        pitchIn(audio, 0.7, 0.95),
      ];
      if (values.some((v) => v === null)) {
        return {
          check,
          pass: false,
          measured: values,
          reason: 'perde konturu ölçülemedi (sesli olmayan pencere)',
        };
      }
      const [a, b, c] = values as number[];
      const r = check.minRatio;
      const pass =
        check.shape === 'rise-fall'
          ? b >= a * r && b >= c * r
          : check.shape === 'rising'
          ? c >= a * r
          : a >= c * r;
      return {
        check,
        pass,
        measured: values,
        reason: pass
          ? null
          : `kontur ${check.shape} değil (${values
              .map((v) => (v as number).toFixed(0))
              .join(' → ')} Hz)`,
      };
    }
    case 'aperiodic': {
      const estimate = estimatePitch(audio.channels, audio.sampleRate);
      const pass = estimate.hz === null || estimate.confidence < check.maxConfidence;
      return {
        check,
        pass,
        measured: estimate.confidence,
        reason: pass
          ? null
          : `perde ${estimate.hz?.toFixed(0)} Hz güven ${estimate.confidence.toFixed(2)} ≥ ${
              check.maxConfidence
            }`,
      };
    }
    case 'band-dominance': {
      const dominant = report.spectral.bandsDb[check.dominant];
      const over = report.spectral.bandsDb[check.over];
      const pass = dominant !== null && (over === null || dominant > over);
      return {
        check,
        pass,
        measured: [dominant, over],
        reason: pass ? null : `${check.dominant} bandı ${check.over} bandından güçlü değil`,
      };
    }
  }
}

export function evaluateChecks(
  checks: readonly MechanicalCheckV1[],
  audio: CheckAudio,
  report: AudioAnalysisReportV1,
): CheckResult[] {
  return checks.map((check) => evaluateCheck(check, audio, report));
}
