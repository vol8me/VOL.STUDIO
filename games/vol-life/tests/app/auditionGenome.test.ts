import { describe, expect, it } from 'vitest';
import { loadAuditionCandidate } from '@/app/auditionGenome';
import { defaultSubstrateCandidate, serializeSubstrateCandidate } from '@/config/candidate';
import { particleConfig } from '@/config/particles';

describe('loadAuditionCandidate', () => {
  it('üretim ortamında DEV false ise null döner', () => {
    expect(loadAuditionCandidate({ DEV: false })).toBeNull();
  });

  it('dev ortamında girdi yoksa null döner', () => {
    expect(loadAuditionCandidate({ DEV: true })).toBeNull();
    expect(loadAuditionCandidate({ DEV: true, VITE_LIFE_AUDITION_GENOME: '   ' })).toBeNull();
  });

  it('dev ortamında geçerli genomu parse eder ve digest döner', () => {
    const serialized = serializeSubstrateCandidate(defaultSubstrateCandidate);
    const result = loadAuditionCandidate({ DEV: true, VITE_LIFE_AUDITION_GENOME: serialized });
    expect(result).not.toBeNull();
    expect(result?.candidate).toEqual(defaultSubstrateCandidate);
    expect(result?.digest).toBeTypeOf('string');
  });

  it('dev ortamında bozuk genom istisna fırlatır', () => {
    expect(() =>
      loadAuditionCandidate({ DEV: true, VITE_LIFE_AUDITION_GENOME: 'bozuk' }),
    ).toThrow();
  });

  it('varsayılan çevre import.meta.env kullanır', () => {
    const result = loadAuditionCandidate(undefined, particleConfig.radiusUnits);
    expect(result).toBeNull();
  });
});
