import { describe, expect, it } from 'vitest';
import { substrateConfig, type SubstrateConfig } from '@/config/substrate';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import type { TransientPresentationEvent } from '@/runtime/sim/WorldEvents';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';
import { CollectingWorldEventSink } from '../../support/worldEvents';

const MAX_TICKS = 600;

/** 128 kapasite ölçümle seçildi: bu pencerede sınanan her seed gerçekten kaybediyor. */
function lossyConfig(): SubstrateConfig {
  return {
    ...substrateConfig,
    world: { ...substrateConfig.world, fieldResolution: 8 },
    particles: { ...substrateConfig.particles, capacity: 128 },
  };
}

function createWorld(seed = 19, sink?: CollectingWorldEventSink): LifeWorld {
  return new LifeWorld(
    lossyConfig(),
    createExplicitWorldMetadata(seed),
    sink ? { worldEvents: sink } : {},
  );
}

function stepUntilDeath(world: LifeWorld): readonly TransientPresentationEvent[] {
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    world.step();
    const events = world.drainTransientPresentationEvents();
    if (events.length > 0) return events;
  }
  return [];
}

describe('Void ölümü — sunum ve dünya kanalları', () => {
  it('sunum olayı ölümün gerçekleştiği adımın tickini taşır', () => {
    const world = createWorld();
    const events = stepUntilDeath(world);

    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.kind).toBe('void-death');
      expect(event.tick).toBe(world.tick);
      expect(event.stableId).toBeGreaterThan(0);
      expect(Number.isFinite(event.vx) && Number.isFinite(event.vy)).toBe(true);
      expect(Object.isFrozen(event)).toBe(true);
    }
  });

  it('olay store’un kopyasıdır: ölen slot kanonik boşalırken olay değişmez', () => {
    const world = createWorld();
    const [event] = stepUntilDeath(world);
    const before = { ...event };

    for (let tick = 0; tick < 30; tick++) world.step();

    expect({ ...event }).toEqual(before);
    expect([...world.particles.stableId]).not.toContain(event.stableId);
    expect(event.x === 0 && event.y === 0).toBe(false);
  });

  it('sunum kanalını boşaltmak dünya kanalını TÜKETMEZ', () => {
    const sink = new CollectingWorldEventSink();
    const world = createWorld(19, sink);
    let drained = 0;

    for (let tick = 0; tick < MAX_TICKS; tick++) {
      world.step();
      drained += world.drainTransientPresentationEvents().length;
    }

    expect(drained).toBeGreaterThan(0);
    expect(sink.events).toHaveLength(drained);
    expect(sink.events).toHaveLength(world.reservoir.voidLossTotal);
    expect(world.drainTransientPresentationEvents()).toHaveLength(0);
    expect(sink.events).toHaveLength(world.reservoir.voidLossTotal);
  });

  it('boşaltılmayan sunum tamponu aktif slot başına tek ölümle sınırlı kalır', () => {
    const world = createWorld();

    for (let tick = 0; tick < MAX_TICKS; tick++) world.step();
    const events = world.drainTransientPresentationEvents();

    expect(events.length).toBe(world.reservoir.voidLossTotal);
    expect(events.length).toBeLessThanOrEqual(world.particles.capacity);
    expect(world.drainTransientPresentationEvents()).toHaveLength(0);
  });

  it('restore sunum tamponunu temizler', () => {
    const world = createWorld();
    const snapshot = world.snapshot();
    for (let tick = 0; tick < MAX_TICKS; tick++) world.step();
    expect(world.reservoir.voidLossTotal).toBeGreaterThan(0);

    world.restore(snapshot);

    expect(world.drainTransientPresentationEvents()).toHaveLength(0);
  });

  it('sink verilmese de sunum kanalı çalışır', () => {
    const world = createWorld();
    expect(stepUntilDeath(world).length).toBeGreaterThan(0);
  });
});
