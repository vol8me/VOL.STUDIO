import { format, resolveConfig } from 'prettier';
import { writeFileSync } from 'node:fs';
import {
  canonicalSubstrateCandidate,
  digestSubstrateCandidate,
  type SubstrateCandidate,
} from '@/config/candidate';
import { substrateConfig, validateSubstrateConfig } from '@/config/substrate';
import type { QualificationArtefact } from './qualification';
import { isQualified, readArtefactCandidate } from './qualification';

/**
 * Promotion hedefi (K9): kalifiye aday `src/config/substrateCandidate.ts`
 * dosyasına YALNIZ VERİ olarak yazılır.
 *
 * Dosya deterministik üretilir, deponun prettier yapılandırmasından geçer ve
 * yazılmadan önce `validateSubstrateConfig` ile doğrulanır: geçersiz bir aday
 * üretim yapılandırmasına giremez. Provenance alanları adayın nereden geldiğini
 * taşır; kaynağı bilinmeyen bir aday production'a giremez.
 */
export interface PromotionProvenance {
  readonly artefactDigest: string;
  readonly sourceRevision: string;
  readonly corpusId: string;
  readonly acceptedBy: string;
  readonly acceptedAt: string;
}

/** Promotion ÖNKOŞULLARI; her biri ayrı ayrı reddedilir ve gerekçesi görünür. */
export function assertPromotable(artefact: QualificationArtefact): void {
  if (!artefact.eligibleForPromotion || artefact.sourceDirty) {
    throw new RangeError('Kirli kaynaktan çıkan artefakt promotion üretemez.');
  }
  if (artefact.humanPreselection !== 'accepted') {
    throw new RangeError('İnsan ön-elemesi (P2) kayıtlı değil.');
  }
  if (artefact.humanAcceptance !== 'accepted') {
    throw new RangeError('Final kabul (P3) kayıtlı değil.');
  }
  if (!isQualified(artefact)) {
    throw new RangeError('Aday §8.4 kalifikasyonunu geçmiyor.');
  }
}

export async function writePromotedCandidate(
  path: string,
  artefact: QualificationArtefact,
  provenance: PromotionProvenance,
): Promise<string> {
  assertPromotable(artefact);
  const candidate = readArtefactCandidate(artefact);
  // Aday ÜRETİM yapılandırmasında doğrulanır; geçersizse dosya hiç yazılmaz.
  validateSubstrateConfig({ ...substrateConfig, candidate });
  const source = await formatModule(renderCandidateModule(candidate, provenance));
  writeFileSync(path, source, 'utf8');
  return digestSubstrateCandidate(candidate);
}

async function formatModule(source: string): Promise<string> {
  return format(source, {
    ...(await resolveConfig('src/config/substrateCandidate.ts')),
    parser: 'typescript',
  });
}

/**
 * Modül KANONİK nesneden üretilir, elle yazılmış bir alan listesinden değil.
 *
 * Kanonik serileştirme anahtar SIRASINA duyarlıdır (`seeding` ve `void` spread
 * ile kopyalanır): elle yazılan bir sıra digest'i sessizce değiştiriyordu ve
 * üretilen dosya aynı adaya geri dönmüyordu. Sıra artık kurulumdan doğru.
 */
export function renderCandidateModule(
  candidate: SubstrateCandidate,
  provenance: PromotionProvenance,
): string {
  const canonical = canonicalSubstrateCandidate(candidate);
  return `// ÜRETİLMİŞ DOSYA — elle düzenlenmez; kaynak: \`pnpm research:promote\` (K9).
import type { SubstrateCandidate } from '@/config/candidate';

/** Adayın nereden geldiği; kaynağı bilinmeyen aday production'a giremez. */
export const promotedCandidateProvenance = {
  artefactDigest: '${provenance.artefactDigest}',
  sourceRevision: '${provenance.sourceRevision}',
  corpusId: '${provenance.corpusId}',
  acceptedBy: '${provenance.acceptedBy}',
  acceptedAt: '${provenance.acceptedAt}',
} as const;

export const promotedSubstrateCandidate: SubstrateCandidate = ${emit(canonical, '')};
`;
}

/** Tipli diziler kaynağındaki tipe GERİ döner; düz dizi aday tipini bozardı. */
const TYPED_ARRAY_FIELDS: Readonly<Record<string, string>> = {
  'physics.roleByType': 'Uint8Array',
  'physics.strength': 'Float32Array',
  'physics.rangeScale': 'Float32Array',
};

function emit(value: unknown, path: string): string {
  if (Array.isArray(value)) {
    const constructor = TYPED_ARRAY_FIELDS[path];
    const items = value.map((item) => emit(item, `${path}[]`)).join(', ');
    return constructor ? `new ${constructor}([${items}])` : `[${items}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, item]) => `${key}: ${emit(item, path ? `${path}.${key}` : key)}`,
    );
    return `{ ${entries.join(', ')} }`;
  }
  if (typeof value === 'string') return `'${value.replace(/'/gu, "\\'")}'`;
  // Sayı KAYNAĞINDAKİ kesinlikle yazılır; yuvarlama adayı değiştirir.
  return String(value);
}
