import {
  digestSubstrateCandidate,
  parseSubstrateCandidate,
  type SubstrateCandidate,
} from '@/config/candidate';
import { particleConfig } from '@/config/particles';

export interface AuditionCandidate {
  readonly candidate: SubstrateCandidate;
  readonly digest: string;
}

export interface AuditionEnvironment {
  readonly DEV: boolean;
  readonly VITE_LIFE_AUDITION_GENOME?: string;
}

/**
 * Development audition girişi (DESIGN.md §8). Yalnız dev sunucusunda ve açık
 * bir build girdisiyle çalışır; üretim bundle'ında `DEV` sabit `false`
 * olduğu için URL/env ile sessiz production override yolu yoktur.
 * Bozuk aday sessizce yutulmaz — açılış hata yüzeyine düşer.
 */
export function loadAuditionCandidate(
  env: AuditionEnvironment = import.meta.env,
  particleRadiusUnits = particleConfig.radiusUnits,
): AuditionCandidate | null {
  if (!env.DEV) return null;
  const serialized = env.VITE_LIFE_AUDITION_GENOME?.trim();
  if (!serialized) return null;
  const candidate = parseSubstrateCandidate(serialized, particleRadiusUnits);
  return { candidate, digest: digestSubstrateCandidate(candidate) };
}
