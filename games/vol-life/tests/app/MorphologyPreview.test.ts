import { describe, expect, it, vi } from 'vitest';
import { loadMorphologyPreview } from '@/app/MorphologyPreview';
import { particleConfig } from '@/config/particles';
import { worldConfig } from '@/config/world';

function catalog() {
  return {
    schemaVersion: 1,
    sourceRevision: 'abc',
    configDigest: 'digest',
    candidates: [
      {
        id: 'candidate-a',
        worldConfig,
        particleConfig: {
          ...particleConfig,
          roleByType: Array.from(particleConfig.roleByType),
          interactionRadiusByRolePair: Array.from(particleConfig.interactionRadiusByRolePair),
          interactionMatrix: Array.from(particleConfig.interactionMatrix),
        },
      },
    ],
  };
}

describe('MorphologyPreview', () => {
  it('query yoksa ağa dokunmadan production configte kalır', async () => {
    const load = vi.fn();
    await expect(loadMorphologyPreview('', load)).resolves.toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('finalist tam configini typed arraylerle runtimea taşır', async () => {
    const load = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(catalog()) });
    const preview = await loadMorphologyPreview('?morphologyCandidate=candidate-a', load);

    expect(preview?.id).toBe('candidate-a');
    expect(preview?.particleConfig.interactionMatrix).toBeInstanceOf(Float32Array);
    expect(preview?.particleConfig.count).toBe(particleConfig.count);
  });

  it('olmayan aday veya bozuk katalogda sessizce productiona düşmez', async () => {
    const valid = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(catalog()) });
    await expect(loadMorphologyPreview('?morphologyCandidate=missing', valid)).rejects.toThrow(
      RangeError,
    );
    const invalid = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    await expect(loadMorphologyPreview('?morphologyCandidate=a', invalid)).rejects.toThrow(
      RangeError,
    );
    const malformed = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          schemaVersion: 1,
          sourceRevision: 'abc',
          configDigest: 'def',
          candidates: [null],
        }),
    });
    await expect(loadMorphologyPreview('?morphologyCandidate=a', malformed)).rejects.toThrow(
      RangeError,
    );
  });

  it('ağ hatasında veya fetch başarısızlığında Error fırlatır ve varsayılan fetch çalışabilir', async () => {
    const failedLoad = vi.fn().mockResolvedValue({ ok: false });
    await expect(loadMorphologyPreview('?morphologyCandidate=a', failedLoad)).rejects.toThrow(
      /yüklenemedi/,
    );

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(catalog()),
      } as Response);
      const preview = await loadMorphologyPreview('?morphologyCandidate=candidate-a');
      expect(preview?.id).toBe('candidate-a');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
