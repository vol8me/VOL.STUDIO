import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject } from '../guard/read';
import { isStateAxis, stateRank, STATE_AXES, type StateAxis } from '../family/vocabulary';
import type { DescriptorSummaryV1 } from './summary';
import { TIMBRE_METHOD, timbreDistance } from './timbre';

/**
 * Oyun durumu ailesinin iki kanıtı, yalnız aile beyan ederse:
 *
 * - Ortak tını kimliği (`identity`): her üye ailenin medoidine
 *   `timbre-envelope-v1` uzaklığında beyan edilen eşiğin içindedir. Medoid,
 *   diğerlerine uzaklık toplamı en küçük üyedir (eşitlikte anahtar sırası).
 * - Durum iddiaları (`states`): "enerji arttıkça centroid artar" gibi. İddia
 *   yalnız o eksende farklı, diğer bütün rollerde aynı olan üye çiftlerinde
 *   sınanır (kontrollü karşılaştırma); betimleyici sıra yönünde KESİN
 *   değişmelidir. Sınanabilir çifti olmayan iddia geçmez.
 */
export const STATE_DESCRIPTORS = [
  'maxMomentaryLufs',
  'centroidHz',
  'flatness',
  'pitchHz',
  'onsetsPerSecond',
  'activeSeconds',
  'crestFactorDb',
] as const;
export type StateDescriptor = (typeof STATE_DESCRIPTORS)[number];

export interface StateClaimV1 {
  readonly axis: StateAxis;
  readonly descriptor: StateDescriptor;
  readonly direction: 1 | -1;
}

export interface FamilyIdentityPolicyV1 {
  readonly maxTimbreDistance: number;
}

export interface StateMemberInput {
  readonly key: string;
  readonly roles: Readonly<Record<string, string>>;
  readonly descriptors: DescriptorSummaryV1;
  readonly timbre: readonly number[] | null;
}

export interface FamilyIdentityReportV1 {
  readonly method: typeof TIMBRE_METHOD;
  readonly medoid: string | null;
  readonly members: readonly {
    readonly key: string;
    readonly distance: number | null;
    readonly shiftOctaves: number | null;
  }[];
  readonly maxDistance: number | null;
  readonly limit: number;
  readonly pass: boolean;
}

export interface StateClaimReportV1 extends StateClaimV1 {
  readonly pairs: number;
  readonly violations: readonly {
    readonly lower: string;
    readonly higher: string;
    readonly values: readonly [number | null, number | null];
  }[];
  readonly pass: boolean;
}

function readDescriptor(d: DescriptorSummaryV1, name: StateDescriptor): number | null {
  if (name === 'pitchHz') return d.pitchConfidence >= 0.5 ? d.pitchHz : null;
  return d[name];
}

export function validateIdentityPolicy(value: unknown, path: string): FamilyIdentityPolicyV1 {
  const o = checkObject(value, path, ['maxTimbreDistance']);
  return {
    maxTimbreDistance: checkNumber(o.maxTimbreDistance, `${path}.maxTimbreDistance`, {
      above: 0,
      max: 60,
    }),
  };
}

export function validateStateClaims(value: unknown, path: string): StateClaimV1[] {
  const claims = checkArray(value, path).map((raw, i): StateClaimV1 => {
    const o = checkObject(raw, `${path}[${i}]`, ['axis', 'descriptor', 'direction']);
    const axis = checkChoice(o.axis, `${path}[${i}].axis`, Object.keys(STATE_AXES) as StateAxis[]);
    const descriptor = checkChoice(o.descriptor, `${path}[${i}].descriptor`, STATE_DESCRIPTORS);
    if (o.direction !== 1 && o.direction !== -1) {
      throw new AudioParamError(`${path}[${i}].direction`, 'type', '1 ya da -1', o.direction);
    }
    return { axis, descriptor, direction: o.direction };
  });
  if (claims.length === 0) throw new AudioParamError(path, 'range', 'en az bir iddia', 0);
  return claims;
}

export function assessIdentity(
  members: readonly StateMemberInput[],
  policy: FamilyIdentityPolicyV1,
): FamilyIdentityReportV1 {
  const measured = members.filter((m) => m.timbre !== null);
  const totals = new Map(
    measured.map((a) => [
      a.key,
      measured.reduce((sum, b) => sum + timbreDistance(a.timbre!, b.timbre!).distance, 0),
    ]),
  );
  const medoid = [...measured].sort(
    (a, b) => (totals.get(a.key) ?? 0) - (totals.get(b.key) ?? 0) || (a.key < b.key ? -1 : 1),
  )[0];
  const rows = members.map((m) => {
    if (!medoid || m.timbre === null) return { key: m.key, distance: null, shiftOctaves: null };
    return { key: m.key, ...timbreDistance(medoid.timbre!, m.timbre) };
  });
  const distances = rows.map((r) => r.distance).filter((d): d is number => d !== null);
  const maxDistance = distances.length ? Math.max(...distances) : null;
  return {
    method: TIMBRE_METHOD,
    medoid: medoid?.key ?? null,
    members: rows,
    maxDistance,
    limit: policy.maxTimbreDistance,
    pass:
      rows.every((r) => r.distance !== null) &&
      maxDistance !== null &&
      maxDistance <= policy.maxTimbreDistance,
  };
}

/** İki üyenin `axis` dışındaki bütün rolleri aynı mı. */
function onlyDiffersIn(a: StateMemberInput, b: StateMemberInput, axis: string): boolean {
  const keys = new Set([...Object.keys(a.roles), ...Object.keys(b.roles)]);
  for (const key of keys) {
    if (key !== axis && a.roles[key] !== b.roles[key]) return false;
  }
  return true;
}

export function assessStateClaims(
  members: readonly StateMemberInput[],
  claims: readonly StateClaimV1[],
): StateClaimReportV1[] {
  return claims.map((claim) => {
    let pairs = 0;
    const violations: StateClaimReportV1['violations'][number][] = [];
    for (const a of members) {
      for (const b of members) {
        const ra = stateRank(claim.axis, a.roles[claim.axis] ?? '');
        const rb = stateRank(claim.axis, b.roles[claim.axis] ?? '');
        if (ra < 0 || rb < 0 || ra >= rb || !onlyDiffersIn(a, b, claim.axis)) continue;
        pairs++;
        const low = readDescriptor(a.descriptors, claim.descriptor);
        const high = readDescriptor(b.descriptors, claim.descriptor);
        const ok = low !== null && high !== null && Math.sign(high - low) === claim.direction;
        if (!ok) violations.push({ lower: a.key, higher: b.key, values: [low, high] });
      }
    }
    return { ...claim, pairs, violations, pass: pairs > 0 && violations.length === 0 };
  });
}

/** Rollerin durum eksenleri (yapılandırılmış oyun durumu anlamı). */
export function stateOf(
  roles: Readonly<Record<string, string>>,
): Partial<Record<StateAxis, string>> {
  return Object.fromEntries(Object.entries(roles).filter(([axis]) => isStateAxis(axis)));
}
