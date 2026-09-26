import type { AssetClass } from '../analysis/assetQa';
import { FIDELITY_METHOD, type EncodeFidelityV1 } from '../analysis/encodeFidelity';
import { AudioParamError } from '../guard/errors';
import { checkArray, checkNumber, checkObject } from '../guard/read';
import { hashCanonical, type Sha256 } from './canonical';

/**
 * Sınıf bazlı kodlama profili. Vorbis kalitesi asset sınıfına göre seçilir;
 * seçim ölçülür, varsayılmaz. Kural:
 *
 * 1. Sınıf korpusundaki HER öğe ölçütü (`criteria`) geçmeli.
 * 2. Ölçütü geçen en düşük kalite seçilir, ama `minQuality`nin altına
 *    inilmez: ölçü algısal şeffaflığı kanıtlamaz, yalnız bozulmayı yakalar.
 *    Ölçüm kaliteyi YÜKSELTEBİLİR; daha önce yayımlanmış kalitenin altına
 *    inmek kayıtlı bir dinleme kararı ister.
 *
 * Tablo `encode-profiles.lock.json` taban çizgisine bağlıdır: kilit politika
 * özetini, korpusu, kalite taramasını (bayt + kodek sonrası sadakat) ve
 * kuralın seçtiği kaliteyi taşır. `tests/governance/encodeProfiles.test.ts`
 * tablo ile kilidin ayrışmasını düşürür; kilidi yalnız
 * `pnpm audio:encode-baseline` yeniden ÖLÇEREK yazar.
 */
export const ENCODE_POLICY = {
  scheme: 'encode-profile-v1',
  codec: 'libvorbis',
  criteria: {
    method: FIDELITY_METHOD,
    maxBandErrorMeanDb: 1.5,
    maxBandErrorP95Db: 1.5,
    maxLoudnessDeltaLu: 0.5,
    maxTruePeakDeltaDb: 0.5,
  },
  minQuality: 4,
  sweep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  classes: {
    ui: { quality: 6 },
    sfx: { quality: 7 },
    ambience: { quality: 6 },
    music: { quality: 4 },
    'music-stem': { quality: 4 },
  } satisfies Record<AssetClass, { readonly quality: number }>,
} as const;

export const ENCODE_BASELINE_SCHEMA = 'EncodeBaselineV1';
export const ENCODE_BASELINE_FILE = 'encode-profiles.lock.json';

export function encodePolicyHash(): Sha256 {
  return hashCanonical(ENCODE_POLICY);
}

export function encodeQualityOf(assetClass: AssetClass): number {
  return ENCODE_POLICY.classes[assetClass].quality;
}

/** Bir öğenin ölçütü geçemediği yerler (boşsa geçer). */
export function fidelityFailures(fidelity: EncodeFidelityV1): string[] {
  const c = ENCODE_POLICY.criteria;
  const out: string[] = [];
  if (fidelity.bandErrorMeanDb > c.maxBandErrorMeanDb) out.push('bandErrorMeanDb');
  if (fidelity.bandErrorP95Db > c.maxBandErrorP95Db) out.push('bandErrorP95Db');
  if (Math.abs(fidelity.loudnessDeltaLu ?? 0) > c.maxLoudnessDeltaLu) out.push('loudnessDeltaLu');
  if ((fidelity.truePeakDeltaDb ?? 0) > c.maxTruePeakDeltaDb) out.push('truePeakDeltaDb');
  return out;
}

export interface BaselineMeasurementV1 {
  readonly quality: number;
  readonly bytes: number;
  readonly fidelity: EncodeFidelityV1;
  readonly failures: readonly string[];
}

export interface BaselineItemV1 {
  readonly id: string;
  readonly origin: string;
  readonly pcmHash: Sha256;
  readonly channels: number;
  readonly sampleRate: number;
  readonly seconds: number;
  readonly sweep: readonly BaselineMeasurementV1[];
}

export interface BaselineClassV1 {
  readonly items: readonly BaselineItemV1[];
  /** Ölçütü bütün öğelerde geçen en düşük kalite (taramada yoksa `null`). */
  readonly lowestPassing: number | null;
  readonly selected: number;
  readonly totals: readonly {
    readonly quality: number;
    readonly bytes: number;
    readonly kbps: number;
  }[];
}

export interface EncodeBaselineV1 {
  readonly schema: typeof ENCODE_BASELINE_SCHEMA;
  readonly policyHash: Sha256;
  readonly policy: typeof ENCODE_POLICY;
  readonly toolchain: { readonly version: string; readonly fingerprint: Sha256 };
  /** Aynı araç zinciriyle 10 ms'lik sessizliğin baytları: kanal başına sabit başlık yükü. */
  readonly headerBytes: { readonly mono: number; readonly stereo: number };
  readonly classes: Readonly<Record<AssetClass, BaselineClassV1>>;
}

/** Kuralın seçimi: bütün öğelerde geçen en düşük kalite, tabandan aşağı değil. */
export function selectQuality(items: readonly BaselineItemV1[]): {
  readonly lowestPassing: number | null;
  readonly selected: number;
} {
  const passing = ENCODE_POLICY.sweep.filter((q) =>
    items.every((item) => item.sweep.find((m) => m.quality === q)?.failures.length === 0),
  );
  const lowestPassing = passing.length > 0 ? passing[0] : null;
  const atFloor = passing.filter((q) => q >= ENCODE_POLICY.minQuality);
  return {
    lowestPassing,
    selected: atFloor.length > 0 ? atFloor[0] : ENCODE_POLICY.sweep[ENCODE_POLICY.sweep.length - 1],
  };
}

/** Kilidin yapısını ve iç tutarlılığını doğrular (seçim kuralı taramadan yeniden hesaplanır). */
export function validateBaseline(value: unknown): EncodeBaselineV1 {
  const o = checkObject(value, '', [
    'schema',
    'policyHash',
    'policy',
    'toolchain',
    'headerBytes',
    'classes',
  ]);
  if (o.schema !== ENCODE_BASELINE_SCHEMA) {
    throw new AudioParamError('schema', 'type', ENCODE_BASELINE_SCHEMA, o.schema);
  }
  if (hashCanonical(o.policy) !== o.policyHash) {
    throw new AudioParamError('policyHash', 'combination', 'politika belgesinin özeti değil', 0);
  }
  const classes = checkObject(o.classes, 'classes', Object.keys(ENCODE_POLICY.classes));
  for (const [name, raw] of Object.entries(classes)) {
    const c = checkObject(raw, `classes.${name}`, ['items', 'lowestPassing', 'selected', 'totals']);
    const items = checkArray(c.items, `classes.${name}.items`) as BaselineItemV1[];
    for (const item of items) {
      for (const m of item.sweep) {
        if (fidelityFailures(m.fidelity).join() !== m.failures.join()) {
          throw new AudioParamError(
            `classes.${name}.items.${item.id}`,
            'combination',
            `q${m.quality} başarısızlık listesi ölçümden türemiyor`,
            m.failures,
          );
        }
      }
    }
    const expected = selectQuality(items);
    checkNumber(c.selected, `classes.${name}.selected`, { min: 0, max: 10, integer: true });
    if (expected.selected !== c.selected || expected.lowestPassing !== c.lowestPassing) {
      throw new AudioParamError(
        `classes.${name}.selected`,
        'combination',
        `kayıtlı seçim taramanın verdiği seçim değil (${expected.selected})`,
        c.selected,
      );
    }
  }
  return value as EncodeBaselineV1;
}
