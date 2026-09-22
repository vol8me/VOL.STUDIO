import { AudioParamError } from '../guard/errors';
import { checkNumber, checkObject } from '../guard/read';
import type { DescriptorSummaryV1 } from './summary';

export const FAMILY_QUALITY_SCHEMA = 'SoundFamilyQualityReportV1';

/**
 * Ses AİLESİ kalitesi: tek asset QA'sının üstünde, üyelerin birbirine göre
 * durumu. İki soru AYRI raporlanır ve tek bir skorda birleştirilmez:
 *
 * - Çeşitlilik: exact duplicate PCM (her zaman sert hata), aile çökmesi
 *   (medyan çift uzaklığı eşik altı), yakın-özdeş çiftler.
 * - Tutarlılık: süre/centroid/seviye/perde dağılımında sağlam z-skoru
 *   (medyan + MAD) aykırıları ve beyan edilmiş oran sınırları.
 *
 * Uzaklık `family-descriptors-v1` uzayındadır: log-frekans (oktav), log-süre,
 * seviye/6 dB, düzlük×4. Bu bir ölçüm sözleşmesidir, algısal benzerlik
 * iddiası değildir; ağırlıklar sürümle birlikte değişir. Perde yalnız YIN
 * güvenilir ölçtüğünde (güven ≥ 0.5) kullanılır; spektral tepe perde sayılmaz.
 */
export const FAMILY_DESCRIPTOR_SPACE = 'family-descriptors-v1';

export interface FamilyQualityPolicyV1 {
  readonly minMembers: number;
  readonly diversity: {
    /** Bu uzaklığın altındaki çift yakın-özdeştir. */
    readonly minNearestDistance: number;
    /** Medyan çift uzaklığı bunun altındaysa aile çökmüştür. */
    readonly minMedianDistance: number;
    readonly nearIdentical: 'fail' | 'report';
  };
  readonly coherence: {
    readonly maxRobustZ: number;
    readonly outliers: 'fail' | 'report';
    /** Üye değerlerinin en büyük/en küçük oranı (beyan edilmişse sınanır). */
    readonly maxActiveRatio?: number;
    readonly maxCentroidRatio?: number;
    readonly maxPitchRatio?: number;
    readonly maxLoudnessSpreadDb?: number;
  };
}

export const DEFAULT_FAMILY_QUALITY_POLICY: FamilyQualityPolicyV1 = {
  minMembers: 2,
  diversity: { minNearestDistance: 0.02, minMedianDistance: 0.05, nearIdentical: 'fail' },
  coherence: { maxRobustZ: 4, outliers: 'fail' },
};

export interface FamilyMemberInput {
  readonly key: string;
  readonly pcmHash: string;
  readonly descriptors: DescriptorSummaryV1;
}

type CoherenceDescriptor = 'activeSeconds' | 'centroidHz' | 'maxMomentaryLufs' | 'pitchHz';

export interface DistributionV1 {
  readonly measured: number;
  readonly median: number | null;
  readonly scale: number | null;
  readonly min: number | null;
  readonly max: number | null;
}

export type FamilyFailure =
  | 'too-few-members'
  | 'duplicate-pcm'
  | 'collapsed'
  | 'near-identical'
  | 'outlier'
  | 'ratio';

export interface SoundFamilyQualityReportV1 {
  readonly schema: typeof FAMILY_QUALITY_SCHEMA;
  readonly descriptorSpace: typeof FAMILY_DESCRIPTOR_SPACE;
  readonly policy: FamilyQualityPolicyV1;
  readonly members: readonly {
    readonly key: string;
    readonly pcmHash: string;
    readonly nearest: { readonly key: string; readonly distance: number } | null;
  }[];
  readonly duplicates: readonly { readonly pcmHash: string; readonly keys: readonly string[] }[];
  readonly diversity: {
    readonly pairs: number;
    readonly minDistance: number | null;
    readonly medianDistance: number | null;
    readonly maxDistance: number | null;
    readonly nearIdentical: readonly {
      readonly a: string;
      readonly b: string;
      readonly distance: number;
    }[];
    readonly collapsed: boolean;
  };
  readonly coherence: {
    readonly distributions: Readonly<Record<CoherenceDescriptor, DistributionV1>>;
    readonly outliers: readonly {
      readonly key: string;
      readonly descriptor: CoherenceDescriptor;
      readonly value: number;
      readonly robustZ: number;
    }[];
    readonly ratioViolations: readonly {
      readonly descriptor: CoherenceDescriptor;
      readonly ratio: number;
      readonly limit: number;
    }[];
  };
  readonly verdict: { readonly pass: boolean; readonly failures: readonly FamilyFailure[] };
}

const round = (x: number) => Number(x.toPrecision(6));
const log2 = (x: number | null, floor: number) =>
  x === null ? null : Math.log2(Math.max(x, floor));

/** Bir üyenin uzaklık uzayındaki koordinatları (null bileşen uzaklığa katılmaz). */
function coordinates(d: DescriptorSummaryV1): (number | null)[] {
  return [
    log2(d.centroidHz, 20),
    log2(d.rolloff85Hz, 20),
    d.flatness === null ? null : d.flatness * 4,
    log2(d.activeSeconds, 0.01),
    log2(d.attackSeconds, 0.001) === null ? null : (log2(d.attackSeconds, 0.001) as number) / 2,
    log2(d.decay40Seconds, 0.01),
    d.maxMomentaryLufs === null ? null : d.maxMomentaryLufs / 6,
    d.crestFactorDb === null ? null : d.crestFactorDb / 6,
    Math.log2(1 + d.onsetsPerSecond) / 2,
  ];
}

export function familyDistance(a: DescriptorSummaryV1, b: DescriptorSummaryV1): number {
  const x = coordinates(a);
  const y = coordinates(b);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < x.length; i++) {
    const p = x[i];
    const q = y[i];
    if (p === null || q === null) continue;
    sum += (p - q) ** 2;
    n++;
  }
  return n === 0 ? 0 : Math.sqrt(sum / n);
}

const median = (values: readonly number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Tutarlılık için dönüşüm (log uzayında oranlar simetrik) ve MAD tabanı. */
const COHERENCE: Readonly<
  Record<
    CoherenceDescriptor,
    { read: (d: DescriptorSummaryV1) => number | null; log: boolean; floor: number }
  >
> = {
  activeSeconds: { read: (d) => d.activeSeconds, log: true, floor: 0.1 },
  centroidHz: { read: (d) => d.centroidHz, log: true, floor: 0.1 },
  maxMomentaryLufs: { read: (d) => d.maxMomentaryLufs, log: false, floor: 1 },
  pitchHz: {
    read: (d) => (d.pitchHz !== null && d.pitchConfidence >= 0.5 ? d.pitchHz : null),
    log: true,
    floor: 0.05,
  },
};

export function validateFamilyQualityPolicy(value: unknown, path: string): FamilyQualityPolicyV1 {
  const o = checkObject(value, path, ['minMembers', 'diversity', 'coherence']);
  const d = checkObject(o.diversity, `${path}.diversity`, [
    'minNearestDistance',
    'minMedianDistance',
    'nearIdentical',
  ]);
  const c = checkObject(o.coherence, `${path}.coherence`, [
    'maxRobustZ',
    'outliers',
    'maxActiveRatio',
    'maxCentroidRatio',
    'maxPitchRatio',
    'maxLoudnessSpreadDb',
  ]);
  const mode = (v: unknown, at: string) => {
    if (v !== 'fail' && v !== 'report')
      throw new AudioParamError(at, 'type', "'fail' | 'report'", v);
    return v;
  };
  const optional = (key: string, rule: { min: number }) =>
    c[key] === undefined ? {} : { [key]: checkNumber(c[key], `${path}.coherence.${key}`, rule) };
  return {
    minMembers: checkNumber(o.minMembers, `${path}.minMembers`, {
      min: 2,
      max: 256,
      integer: true,
    }),
    diversity: {
      minNearestDistance: checkNumber(
        d.minNearestDistance,
        `${path}.diversity.minNearestDistance`,
        { min: 0, max: 10 },
      ),
      minMedianDistance: checkNumber(d.minMedianDistance, `${path}.diversity.minMedianDistance`, {
        min: 0,
        max: 10,
      }),
      nearIdentical: mode(d.nearIdentical, `${path}.diversity.nearIdentical`),
    },
    coherence: {
      maxRobustZ: checkNumber(c.maxRobustZ, `${path}.coherence.maxRobustZ`, { min: 1, max: 100 }),
      outliers: mode(c.outliers, `${path}.coherence.outliers`),
      ...optional('maxActiveRatio', { min: 1 }),
      ...optional('maxCentroidRatio', { min: 1 }),
      ...optional('maxPitchRatio', { min: 1 }),
      ...optional('maxLoudnessSpreadDb', { min: 0 }),
    },
  };
}

export function assessFamily(
  members: readonly FamilyMemberInput[],
  policy: FamilyQualityPolicyV1 = DEFAULT_FAMILY_QUALITY_POLICY,
): SoundFamilyQualityReportV1 {
  const failures = new Set<FamilyFailure>();
  if (members.length < policy.minMembers) failures.add('too-few-members');

  const byHash = new Map<string, string[]>();
  for (const m of members) byHash.set(m.pcmHash, [...(byHash.get(m.pcmHash) ?? []), m.key]);
  const duplicates = [...byHash.entries()]
    .filter(([, keys]) => keys.length > 1)
    .map(([pcmHash, keys]) => ({ pcmHash, keys: [...keys].sort() }))
    .sort((a, b) => (a.pcmHash < b.pcmHash ? -1 : 1));
  if (duplicates.length > 0) failures.add('duplicate-pcm');

  const distances: number[] = [];
  const nearIdentical: { a: string; b: string; distance: number }[] = [];
  const nearest = members.map(() => ({ key: '', distance: Infinity }));
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const distance = familyDistance(members[i].descriptors, members[j].descriptors);
      distances.push(distance);
      if (distance < nearest[i].distance) nearest[i] = { key: members[j].key, distance };
      if (distance < nearest[j].distance) nearest[j] = { key: members[i].key, distance };
      if (
        distance < policy.diversity.minNearestDistance &&
        members[i].pcmHash !== members[j].pcmHash
      ) {
        const [a, b] = [members[i].key, members[j].key].sort();
        nearIdentical.push({ a, b, distance: round(distance) });
      }
    }
  }
  const medianDistance = distances.length ? median(distances) : null;
  const collapsed = medianDistance !== null && medianDistance < policy.diversity.minMedianDistance;
  if (collapsed) failures.add('collapsed');
  if (nearIdentical.length > 0 && policy.diversity.nearIdentical === 'fail')
    failures.add('near-identical');

  const outliers: SoundFamilyQualityReportV1['coherence']['outliers'][number][] = [];
  const ratioViolations: SoundFamilyQualityReportV1['coherence']['ratioViolations'][number][] = [];
  const distributions = {} as Record<CoherenceDescriptor, DistributionV1>;
  const limits: Readonly<Record<CoherenceDescriptor, number | undefined>> = {
    activeSeconds: policy.coherence.maxActiveRatio,
    centroidHz: policy.coherence.maxCentroidRatio,
    pitchHz: policy.coherence.maxPitchRatio,
    maxMomentaryLufs: policy.coherence.maxLoudnessSpreadDb,
  };
  for (const name of Object.keys(COHERENCE).sort() as CoherenceDescriptor[]) {
    const rule = COHERENCE[name];
    const values = members
      .map((m) => ({ key: m.key, raw: rule.read(m.descriptors) }))
      .filter((v): v is { key: string; raw: number } => v.raw !== null);
    const t = values.map((v) => (rule.log ? Math.log2(Math.max(v.raw, 1e-6)) : v.raw));
    if (values.length < 3) {
      distributions[name] = {
        measured: values.length,
        median: null,
        scale: null,
        min: null,
        max: null,
      };
      continue;
    }
    const m = median(t);
    const scale = Math.max(rule.floor, 1.4826 * median(t.map((x) => Math.abs(x - m))));
    const raws = values.map((v) => v.raw);
    distributions[name] = {
      measured: values.length,
      median: round(rule.log ? 2 ** m : m),
      scale: round(scale),
      min: round(Math.min(...raws)),
      max: round(Math.max(...raws)),
    };
    values.forEach((v, i) => {
      const z = (t[i] - m) / scale;
      if (Math.abs(z) > policy.coherence.maxRobustZ)
        outliers.push({ key: v.key, descriptor: name, value: round(v.raw), robustZ: round(z) });
    });
    const limit = limits[name];
    if (limit !== undefined) {
      const spread = rule.log
        ? Math.max(...raws) / Math.min(...raws)
        : Math.max(...raws) - Math.min(...raws);
      if (spread > limit) ratioViolations.push({ descriptor: name, ratio: round(spread), limit });
    }
  }
  if (outliers.length > 0 && policy.coherence.outliers === 'fail') failures.add('outlier');
  if (ratioViolations.length > 0) failures.add('ratio');

  const order: FamilyFailure[] = [
    'too-few-members',
    'duplicate-pcm',
    'collapsed',
    'near-identical',
    'outlier',
    'ratio',
  ];
  return {
    schema: FAMILY_QUALITY_SCHEMA,
    descriptorSpace: FAMILY_DESCRIPTOR_SPACE,
    policy,
    members: members.map((m, i) => ({
      key: m.key,
      pcmHash: m.pcmHash,
      nearest: Number.isFinite(nearest[i].distance)
        ? { key: nearest[i].key, distance: round(nearest[i].distance) }
        : null,
    })),
    duplicates,
    diversity: {
      pairs: distances.length,
      minDistance: distances.length ? round(Math.min(...distances)) : null,
      medianDistance: medianDistance === null ? null : round(medianDistance),
      maxDistance: distances.length ? round(Math.max(...distances)) : null,
      nearIdentical,
      collapsed,
    },
    coherence: { distributions, outliers, ratioViolations },
    verdict: { pass: failures.size === 0, failures: order.filter((f) => failures.has(f)) },
  };
}
