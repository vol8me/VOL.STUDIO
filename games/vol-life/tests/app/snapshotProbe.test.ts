import { describe, expect, it } from 'vitest';
import { installSnapshotProbe, type SnapshotProbeHost } from '@/app/snapshotProbe';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { substrateConfig } from '@/config/substrate';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';

describe('installSnapshotProbe (Z2)', () => {
  it('host üzerinde ölçüm kancasını kurar, ölçer ve temizler', async () => {
    const world = new LifeWorld(
      {
        ...substrateConfig,
        particles: { ...substrateConfig.particles, capacity: 16 },
      },
      createExplicitWorldMetadata(42),
    );

    const host: SnapshotProbeHost = {};
    const cleanup = installSnapshotProbe(world, 'fp-probe', host);

    expect(host.__volLifeStorage).toBeDefined();
    expect(typeof host.__volLifeStorage?.measure).toBe('function');

    const measurement = await host.__volLifeStorage!.measure();
    expect(measurement.rawBytes).toBeGreaterThan(0);
    expect(measurement.encodedChars).toBeGreaterThan(0);
    expect(measurement.encodeMs).toBeGreaterThanOrEqual(0);
    expect(measurement.encoding).toBe('gzip-base64');

    cleanup();
    expect(host.__volLifeStorage).toBeUndefined();
  });
});
