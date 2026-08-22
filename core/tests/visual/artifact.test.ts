import { describe, expect, it } from 'vitest';
import { createVisualPreset } from '../../src/visual/catalog';
import { createForgeArtifact } from '../../src/visual/encode/artifact';
import { decodePng } from '../../src/visual/encode/png';

describe('Forge ortak çıktı hattı', () => {
  it('tek çağrıda render, QA ve piksel-özdeş PNG üretir', () => {
    const doc = createVisualPreset('cutMineral', { size: [48, 32], seed: 42 });
    const artifact = createForgeArtifact(doc);
    const decoded = decodePng(artifact.png);

    expect([artifact.result.width, artifact.result.height]).toEqual([48, 32]);
    expect(artifact.report.width).toBe(48);
    expect(artifact.report.metrics.length).toBeGreaterThan(2);
    expect(Array.from(decoded.rgba)).toEqual(Array.from(artifact.result.rgba));
  });

  it('CLI boyut/tohum ezmelerini aynı girişte uygular', () => {
    const doc = createVisualPreset('softGlow', { size: 32, seed: 1 });
    const artifact = createForgeArtifact(doc, { size: [24, 16], seed: 99 });
    expect([artifact.result.width, artifact.result.height]).toEqual([24, 16]);
    expect(artifact.result.doc.seed).toBe(99);
  });

  it('geçersiz belgeyi PNG üretmeden reddeder', () => {
    expect(() => createForgeArtifact({ schemaVersion: 1, layers: [] })).toThrow(/geçersiz/i);
  });
});
