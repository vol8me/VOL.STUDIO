import { describe, expect, it } from 'vitest';
import { loadAuditionGenome } from '@/app/auditionGenome';
import { defaultPhysicsGenome, serializePhysicsGenome } from '@/config/genome';
import { particleConfig } from '@/config/particles';

describe('loadAuditionGenome', () => {
  it('üretim ortamında DEV false ise null döner', () => {
    expect(loadAuditionGenome({ DEV: false })).toBeNull();
  });

  it('dev ortamında girdi yoksa null döner', () => {
    expect(loadAuditionGenome({ DEV: true })).toBeNull();
    expect(loadAuditionGenome({ DEV: true, VITE_LIFE_AUDITION_GENOME: '   ' })).toBeNull();
  });

  it('dev ortamında geçerli genomu parse eder ve digest döner', () => {
    const serialized = serializePhysicsGenome(defaultPhysicsGenome);
    const result = loadAuditionGenome({ DEV: true, VITE_LIFE_AUDITION_GENOME: serialized });
    expect(result).not.toBeNull();
    expect(result?.genome).toEqual(defaultPhysicsGenome);
    expect(result?.digest).toBeTypeOf('string');
  });

  it('dev ortamında bozuk genom istisna fırlatır', () => {
    expect(() => loadAuditionGenome({ DEV: true, VITE_LIFE_AUDITION_GENOME: 'bozuk' })).toThrow();
  });

  it('varsayılan çevre import.meta.env kullanır', () => {
    const result = loadAuditionGenome(undefined, particleConfig.radiusUnits);
    expect(result).toBeNull();
  });
});
