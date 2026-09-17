import {
  AUDITION_CATALOG_SCHEMA_VERSION,
  type AuditionCatalog,
  type AuditionCatalogEntry,
} from '@/config/auditionCatalog';
import {
  defaultSubstrateCandidate,
  digestSubstrateCandidate,
  serializeSubstrateCandidate,
  type SubstrateCandidate,
} from '@/config/candidate';

/** Katalog testlerinin ortak fixture'ı; genom ve digest GERÇEKTEN eşleşir. */
export function catalogEntry(
  candidate: SubstrateCandidate,
  family = 'core-like',
): AuditionCatalogEntry {
  return {
    digest: digestSubstrateCandidate(candidate),
    genome: serializeSubstrateCandidate(candidate),
    family,
    primaryReason: 'DYNAMIC_STRUCTURED',
    phaseDistribution: { DYNAMIC_STRUCTURED: 3 },
    metrics: { clusteredFraction: 0.7 },
    risks: [],
  };
}

export function candidateVariant(dampingPerReferenceTick: number): SubstrateCandidate {
  const dynamics = {
    ...defaultSubstrateCandidate.physics.dynamics,
    dampingPerReferenceTick,
  };
  return {
    ...defaultSubstrateCandidate,
    physics: { ...defaultSubstrateCandidate.physics, dynamics },
  };
}

export function sampleCatalog(): AuditionCatalog {
  return {
    schemaVersion: AUDITION_CATALOG_SCHEMA_VERSION,
    corpusId: 'corpus-v1',
    seeds: [11, 22, 33],
    sourceRevision: '0'.repeat(40),
    sourceDirty: false,
    entries: [
      catalogEntry(candidateVariant(0.9)),
      catalogEntry(candidateVariant(0.92)),
      catalogEntry(candidateVariant(0.94)),
    ],
  };
}
