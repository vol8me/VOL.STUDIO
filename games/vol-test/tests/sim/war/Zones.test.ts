import { describe, expect, it } from 'vitest';
import { STRIKER } from '@/config/vehicles';
import { WAR } from '@/config/war';
import type { WarEvent } from '@/sim/war/events';
import { NO_OWNER, ZoneField } from '@/sim/war/Zones';
import { arena, SIZE } from './support';

const STEP = 1000 / 60;

function setup() {
  const sim = arena();
  const field = new ZoneField(sim.world);
  const place = (team: number, x: number, y: number) => {
    const vehicle = sim.spawn(x, y, 0, team, undefined, STRIKER);
    vehicle.vitality.protectionRemainingMs = 0;
    return vehicle;
  };
  const run = (seconds: number): WarEvent[] => {
    const events: WarEvent[] = [];
    for (let step = 0; step < (seconds * 1000) / STEP; step++)
      field.step(STEP, sim.vehicles, events);
    return events;
  };
  return { sim, field, place, run, core: field.zones[0] };
}

describe('ZoneField', () => {
  it('geçersiz ve sıfır süre bölgenin durumunu değiştirmez', () => {
    const { field, place, core } = setup();
    place(0, core.x, core.y);
    const before = structuredClone(field.zones);
    const events: WarEvent[] = [];
    for (const step of [-1, NaN, Infinity])
      expect(() => field.step(step, [], events)).toThrow(RangeError);
    field.step(0, [], events);
    expect(field.zones).toEqual(before);
    expect(events).toEqual([]);
  });

  it('bölgeleri dünya ölçüsüne göre çözer ve hepsi dünyanın içindedir', () => {
    const { field } = setup();
    expect(field.zones).toHaveLength(WAR.zones.length);
    for (const zone of field.zones) {
      expect(zone.x - zone.radius).toBeGreaterThan(0);
      expect(zone.y - zone.radius).toBeGreaterThan(0);
      expect(zone.x + zone.radius).toBeLessThan(SIZE);
      expect(zone.y + zone.radius).toBeLessThan(SIZE);
      expect(zone.owner).toBe(NO_OWNER);
    }
    const core = field.zones[0];
    expect([core.x, core.y]).toEqual([SIZE / 2, SIZE / 2]);
  });

  it('bölgeler birbirine değmez ve üslerin içine girmez', () => {
    const { field } = setup();
    const { zones } = field;
    for (let a = 0; a < zones.length; a++) {
      for (let b = a + 1; b < zones.length; b++) {
        const gap = Math.hypot(zones[a].x - zones[b].x, zones[a].y - zones[b].y);
        expect(gap, `${zones[a].id}-${zones[b].id}`).toBeGreaterThan(
          zones[a].radius + zones[b].radius,
        );
      }
      for (const base of WAR.bases) {
        const gap = Math.hypot(zones[a].x - base.x * SIZE, zones[a].y - base.y * SIZE);
        expect(gap, zones[a].id).toBeGreaterThan(zones[a].radius + base.radius);
      }
    }
  });

  it('tek araç boş bölgeyi `soloSeconds` içinde ele geçirir ve olay bildirir', () => {
    const { place, run, core } = setup();
    place(0, core.x, core.y);
    const early = run(WAR.capture.soloSeconds * 0.8);
    expect(early).toEqual([]);
    expect(core.progress).toBeGreaterThan(0.7);
    expect(core.owner).toBe(NO_OWNER);
    const late = run(WAR.capture.soloSeconds * 0.3);
    expect(late).toEqual([{ kind: 'zone', zone: 0, owner: 0 }]);
    expect(core.owner).toBe(0);
    expect(core.progress).toBe(1);
  });

  it('daha çok araç daha hızlı ele geçirir; fark sayısı tavanla sınırlıdır', () => {
    const solo = setup();
    solo.place(0, solo.core.x, solo.core.y);
    solo.run(4);
    const crowd = setup();
    for (let index = 0; index < 8; index++) crowd.place(0, crowd.core.x + index * 3, crowd.core.y);
    crowd.run(4);
    expect(crowd.core.progress).toBeGreaterThan(solo.core.progress * 2);
    // Tavan: 8 araç 3 araçla aynı hızdadır.
    const three = setup();
    for (let index = 0; index < 3; index++) three.place(0, three.core.x + index * 3, three.core.y);
    three.run(4);
    expect(crowd.core.progress).toBeCloseTo(three.core.progress, 6);
  });

  it('iki cephe de içerideyse bölge tartışmalıdır ve eşitlikte ilerleme durur', () => {
    const { place, run, core } = setup();
    place(0, core.x, core.y);
    place(1, core.x + 40, core.y);
    run(6);
    expect(core.contested).toBe(true);
    expect(core.progress).toBe(0);
    // Sayı üstünlüğü tartışmayı sürdürür ama ilerletir.
    place(0, core.x - 40, core.y);
    run(3);
    expect(core.contested).toBe(true);
    expect(core.progress).toBeGreaterThan(0);
  });

  it('sahibini önce tarafsızlaştırır, sonra devralır', () => {
    const { sim, place, run, core } = setup();
    const mine = place(0, core.x, core.y);
    run(WAR.capture.soloSeconds + 1);
    expect(core.owner).toBe(0);
    sim.despawn(mine.id);
    place(1, core.x, core.y);
    const events = run(WAR.capture.soloSeconds * 2.2);
    expect(events.map((event) => (event.kind === 'zone' ? event.owner : null))).toEqual([
      NO_OWNER,
      1,
    ]);
    expect(core.owner).toBe(1);
    expect(core.progress).toBe(-1);
  });

  it('boş bölgede ilerleme sahibinin ucuna doğru söner, sahibi yoksa sıfıra', () => {
    const { sim, place, run, core } = setup();
    const unit = place(0, core.x, core.y);
    run(8);
    const half = core.progress;
    sim.despawn(unit.id);
    run(20);
    expect(core.owner).toBe(NO_OWNER);
    expect(core.progress).toBeLessThan(half);
    expect(core.progress).toBeGreaterThanOrEqual(0);
  });

  it('ele geçirilmiş bölge boşken ilerlemesini geri kazanır', () => {
    const { sim, place, run, core } = setup();
    const unit = place(0, core.x, core.y);
    run(WAR.capture.soloSeconds + 1);
    sim.despawn(unit.id);
    const enemy = place(1, core.x, core.y);
    run(3);
    sim.despawn(enemy.id);
    const eroded = core.progress;
    expect(eroded).toBeLessThan(1);
    run(60);
    expect(core.owner).toBe(0);
    expect(core.progress).toBeGreaterThan(eroded);
  });

  it('ölü araç, takımsız araç ve çemberin dışındaki araç sayılmaz', () => {
    const { sim, field, place, run, core } = setup();
    const dead = place(0, core.x, core.y);
    dead.vitality.health = 0;
    sim.spawn(core.x, core.y, 0, null, undefined, STRIKER);
    place(0, core.x + core.radius + 50, core.y);
    run(2);
    expect(core.presence).toEqual([0, 0]);
    expect(core.progress).toBe(0);
    expect(field.holdings()).toEqual([0, 0]);
  });

  it('reset tüm bölgeleri tarafsıza döndürür', () => {
    const { field, place, run, core } = setup();
    place(1, core.x, core.y);
    run(WAR.capture.soloSeconds + 1);
    expect(field.holdings()).toEqual([0, 1]);
    field.reset();
    expect(field.holdings()).toEqual([0, 0]);
    expect(core.progress).toBe(0);
    expect(core.owner).toBe(NO_OWNER);
  });
});
