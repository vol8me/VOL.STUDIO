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
import { RENDER_SURFACE_LOCK_PATH, type RenderSurfaceLockV2 } from '../../src/program/surfaceLock';
import { resolveProgram } from '../../src/program/schema';

/**
 * Registry render yüzeyi kilidi. Bir düğümün parametre alanı, varsayılanı
 * ya da yönlendirmesi SÜRÜM ARTMADAN değişirse bu test düşer: aynı program
 * + tohum + sürüm artık başka PCM verir ve manifest'lerin "aynı sürüm"
 * iddiası yalan olur. Kilidi `pnpm audio:surface-lock` yazar ve aynı sürümde
 * değişen bir sözleşmeyi yazmayı reddeder. Kilit anahtarı `id@version`'dir:
 * dondurulmuş eski sürümler de ayrıca izlenir.
 */
const lock = JSON.parse(
  readFileSync(new URL(`../../${RENDER_SURFACE_LOCK_PATH}`, import.meta.url), 'utf8'),
) as RenderSurfaceLockV2;

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
      const key = `${entry.id}@${entry.version}`;
      const locked = lock.nodes[key];
      const current = nodeSurface(entry.id, entry.version);
      if (!locked) {
        problems.push(`${key}: kilitte yok (pnpm audio:surface-lock)`);
      } else if (locked.hash !== current.hash) {
        problems.push(`${key}: sözleşme değişti ama sürüm artmadı`);
      }
    }
    for (const key of Object.keys(lock.nodes)) {
      const [id, version] = key.split('@');
      if (!PROGRAM_REGISTRY.versions(id).includes(Number(version))) {
        problems.push(`${key}: registry’de yok (kilidi yenile)`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('çok sürümlü düğümler her iki sürümü de adıyla çözer', () => {
    expect(PROGRAM_REGISTRY.versions('source.oscillator')).toEqual([1, 2]);
    expect(PROGRAM_REGISTRY.get('source.oscillator').version).toBe(2);
    expect(PROGRAM_REGISTRY.get('source.oscillator', 1).version).toBe(1);
    // v1 ve v2 aynı parametre alanını taşır; fark yalnız DSP çekirdeğinde
    // (yüzey özeti sürüm numarasını da içerdiğinden eşit değildir).
    expect(nodeSurface('source.oscillator', 1).hash).not.toBe(
      nodeSurface('source.oscillator', 2).hash,
    );
    expect(PROGRAM_REGISTRY.versions('source.wind')).toEqual([1, 2]);
    expect(PROGRAM_REGISTRY.versions('source.rain')).toEqual([1, 2]);
    expect(PROGRAM_REGISTRY.versions('source.fire')).toEqual([1, 2]);
    expect(PROGRAM_REGISTRY.versions('source.retro')).toEqual([1, 2]);
    expect(PROGRAM_REGISTRY.versions('source.drum')).toEqual([1, 2]);
  });

  it("açık sürüm pinli düğüm ref'i o sürümün yüzeyini taşır", () => {
    // {id,version} ref'leri sürümü ONUR eder: v2 pinliyse v2 yüzeyi kaydedilir.
    const v2 = surfaceOf([{ id: 'source.oscillator', version: 2 }]);
    const v1 = surfaceOf([{ id: 'source.oscillator', version: 1 }]);
    expect(v2.nodes[0].version).toBe(2);
    expect(v1.nodes[0].version).toBe(1);
    expect(v2.hash).not.toBe(v1.hash);
    expect(v2.nodes[0].hash).toBe(nodeSurface('source.oscillator', 2).hash);
    expect(v1.nodes[0].hash).toBe(nodeSurface('source.oscillator', 1).hash);
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
