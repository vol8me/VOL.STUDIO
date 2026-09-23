import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROGRAM_REGISTRY } from '../../src/program/catalog';
import {
  compareSurface,
  nodeSurface,
  programNodeIds,
  registryRenderHash,
  renderProjection,
  surfaceOf,
} from '../../src/program/surface';
import { RENDER_SURFACE_LOCK_PATH, type RenderSurfaceLockV1 } from '../../src/program/surfaceLock';
import { resolveProgram } from '../../src/program/schema';

/**
 * Registry render yüzeyi kilidi. Bir düğümün parametre alanı, varsayılanı
 * ya da yönlendirmesi SÜRÜM ARTMADAN değişirse bu test düşer: aynı program
 * + tohum + sürüm artık başka PCM verir ve manifest'lerin "aynı sürüm"
 * iddiası yalan olur. Kilidi `pnpm audio:surface-lock` yazar ve aynı sürümde
 * değişen bir sözleşmeyi yazmayı reddeder.
 */
const lock = JSON.parse(
  readFileSync(new URL(`../../${RENDER_SURFACE_LOCK_PATH}`, import.meta.url), 'utf8'),
) as RenderSurfaceLockV1;

const PROBE = {
  schema: 'AcousticProgramV1',
  sampleRate: 48000,
  channels: 1,
  durationSeconds: 0.05,
  seed: 1,
  layers: [
    {
      name: 'tone',
      source: { primitive: 'source.oscillator', version: 1, params: { frequency: 220 } },
      resonators: [{ primitive: 'resonator.modal', version: 1 }],
    },
  ],
};

describe('render yüzeyi kilidi', () => {
  it('kilit bugünkü registry ile birebir aynı; aynı sürümde sözleşme değişmemiş', () => {
    const problems: string[] = [];
    for (const entry of PROGRAM_REGISTRY.entries()) {
      const locked = lock.nodes[entry.id];
      const current = nodeSurface(entry.id);
      if (!locked) {
        problems.push(`${entry.id}: kilitte yok (pnpm audio:surface-lock)`);
      } else if (locked.version !== current.version) {
        problems.push(`${entry.id}: sürüm ${locked.version} → ${current.version} (kilidi yenile)`);
      } else if (locked.hash !== current.hash) {
        problems.push(`${entry.id}@${current.version}: sözleşme değişti ama sürüm artmadı`);
      }
    }
    for (const id of Object.keys(lock.nodes)) {
      if (!PROGRAM_REGISTRY.has(id)) problems.push(`${id}: registry’de yok (kilidi yenile)`);
    }
    expect(problems).toEqual([]);
  });

  it('belge alanları izdüşüme girmez: açıklama değişince özet değişmez', () => {
    const entry = PROGRAM_REGISTRY.get('source.oscillator');
    const renamed = {
      ...entry,
      description: 'başka bir açıklama',
      probe: { channels: 2 as const },
    };
    expect(renderProjection(renamed)).toEqual(renderProjection(entry));
    const shifted = {
      ...entry,
      params: {
        ...entry.params,
        frequency: { ...entry.params.frequency, default: 111 },
      },
    } as typeof entry;
    expect(renderProjection(shifted)).not.toEqual(renderProjection(entry));
  });

  it('program yalnız KULLANDIĞI düğümleri kaydeder', () => {
    const program = resolveProgram(PROBE);
    const surface = surfaceOf(programNodeIds(program, PROBE));
    expect(surface.nodes.map((n) => n.id)).toEqual(['resonator.modal', 'source.oscillator']);
    expect(surface.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(surfaceOf(programNodeIds(program, PROBE)).hash).toBe(surface.hash);
  });

  it('karşılaştırma sürüm, silinme ve aynı-sürüm kaymasını adıyla ayırır', () => {
    const surface = surfaceOf(['source.oscillator', 'resonator.modal']);
    expect(compareSurface(surface)).toEqual([]);
    const tampered = {
      ...surface,
      nodes: [
        { ...surface.nodes[0], hash: `sha256:${'0'.repeat(64)}` as const },
        { ...surface.nodes[1], version: 99 },
        { id: 'source.yok', version: 1, hash: surface.nodes[0].hash },
      ],
    };
    const changes = compareSurface(tampered).map((c) => `${c.id}:${c.change}`);
    expect(changes).toEqual([
      'resonator.modal:changed',
      'source.oscillator:version',
      'source.yok:removed',
    ]);
  });

  it('enstrüman beyanları ayrı izlenir', () => {
    const surface = surfaceOf([], [{ id: 'preset:subBass', hash: `sha256:${'1'.repeat(64)}` }]);
    expect(compareSurface(surface, []).map((c) => c.change)).toEqual(['removed']);
    expect(
      compareSurface(surface, [{ id: 'preset:subBass', hash: `sha256:${'2'.repeat(64)}` }]).map(
        (c) => c.change,
      ),
    ).toEqual(['changed']);
  });

  it('motor yüzeyi özeti kararlı ve belge metninden bağımsız', () => {
    expect(registryRenderHash()).toBe(registryRenderHash());
  });
});
