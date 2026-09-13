import { validateParticleConfig, type ParticleConfig } from '@/config/particles';
import type { WorldConfig } from '@/config/world';

interface SerializedParticleConfig
  extends Omit<ParticleConfig, 'roleByType' | 'interactionRadiusByRolePair' | 'interactionMatrix'> {
  readonly roleByType: readonly number[];
  readonly interactionRadiusByRolePair: readonly number[];
  readonly interactionMatrix: readonly number[];
}

interface PreviewCandidate {
  readonly id: string;
  readonly worldConfig: WorldConfig;
  readonly particleConfig: SerializedParticleConfig;
}

interface PreviewCatalog {
  readonly schemaVersion: 1;
  readonly sourceRevision: string;
  readonly configDigest: string;
  readonly candidates: readonly PreviewCandidate[];
}

export interface MorphologyPreview {
  readonly id: string;
  readonly worldConfig: WorldConfig;
  readonly particleConfig: ParticleConfig;
}

export async function loadMorphologyPreview(
  search: string,
  load: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }> = (url) => fetch(url),
): Promise<MorphologyPreview | null> {
  const id = new URLSearchParams(search).get('morphologyCandidate');
  if (!id) return null;
  const response = await load('/generated/morphology-candidates-v3.json');
  if (!response.ok) throw new Error('Morfoloji aday kataloğu yüklenemedi.');
  const value = await response.json();
  if (!isCatalog(value)) throw new RangeError('Morfoloji aday kataloğu geçersiz.');
  const candidate = value.candidates.find((entry) => entry.id === id);
  if (!candidate) throw new RangeError(`Morfoloji adayı bulunamadı: ${id}`);
  const config: ParticleConfig = {
    ...candidate.particleConfig,
    roleByType: new Uint8Array(candidate.particleConfig.roleByType),
    interactionRadiusByRolePair: new Float32Array(
      candidate.particleConfig.interactionRadiusByRolePair,
    ),
    interactionMatrix: new Float32Array(candidate.particleConfig.interactionMatrix),
  };
  validateParticleConfig(config);
  return { id, worldConfig: candidate.worldConfig, particleConfig: config };
}

function isCatalog(value: unknown): value is PreviewCatalog {
  if (!value || typeof value !== 'object') return false;
  const catalog = value as Partial<PreviewCatalog>;
  return (
    catalog.schemaVersion === 1 &&
    typeof catalog.sourceRevision === 'string' &&
    typeof catalog.configDigest === 'string' &&
    Array.isArray(catalog.candidates) &&
    catalog.candidates.every(isCandidate)
  );
}

function isCandidate(value: unknown): value is PreviewCandidate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PreviewCandidate>;
  return (
    typeof candidate.id === 'string' &&
    !!candidate.worldConfig &&
    !!candidate.particleConfig &&
    Array.isArray(candidate.particleConfig.roleByType) &&
    Array.isArray(candidate.particleConfig.interactionRadiusByRolePair) &&
    Array.isArray(candidate.particleConfig.interactionMatrix)
  );
}
