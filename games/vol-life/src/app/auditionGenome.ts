import { digestPhysicsGenome, parsePhysicsGenome, type PhysicsGenome } from '@/config/genome';
import { particleConfig } from '@/config/particles';

export interface AuditionGenome {
  readonly genome: PhysicsGenome;
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
 * Bozuk genom sessizce yutulmaz — açılış hata yüzeyine düşer.
 */
export function loadAuditionGenome(
  env: AuditionEnvironment = import.meta.env,
  particleRadiusUnits = particleConfig.radiusUnits,
): AuditionGenome | null {
  if (!env.DEV) return null;
  const serialized = env.VITE_LIFE_AUDITION_GENOME?.trim();
  if (!serialized) return null;
  const genome = parsePhysicsGenome(serialized, particleRadiusUnits);
  return { genome, digest: digestPhysicsGenome(genome) };
}
