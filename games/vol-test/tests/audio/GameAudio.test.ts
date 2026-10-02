import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameAudio } from '@/audio/GameAudio';
import { Simulation } from '@/sim/Simulation';
import { command, STEP_MS } from '../support/sim';
import { World } from '@/sim/world/World';
import { TANK, SUSPENSION, WEAPON } from '@/config/tank';
import type { FakeAudioGain } from '../support/fakeAudio';
import { FakeAudioContext } from '../support/fakeAudio';

describe('GameAudio', () => {
  let context: FakeAudioContext;
  let audio: GameAudio;
  const listener = { x: 0, y: 0 };
  beforeEach(async () => {
    context = new FakeAudioContext();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          new Response(new TextEncoder().encode(url), { headers: { 'content-type': 'audio/ogg' } }),
        ),
      ),
    );
    audio = new GameAudio(
      context as unknown as AudioContext,
      context.destination as unknown as AudioNode,
    );
    await audio.load();
  });
  afterEach(() => {
    audio.dispose();
    vi.unstubAllGlobals();
  });

  it('uyanışta ortak ses bağlamını açar; çalışır, kapalı ve sökülmüş bağlama dokunmaz', async () => {
    const resume = vi.fn(() => {
      context.state = 'running';
      return Promise.resolve();
    });
    Object.assign(context, { resume });
    context.state = 'suspended';
    await audio.resumeAfterWake();
    expect(resume).toHaveBeenCalledOnce();
    await audio.resumeAfterWake();
    context.state = 'closed';
    await audio.resumeAfterWake();
    audio.dispose();
    context.state = 'interrupted';
    await audio.resumeAfterWake();
    expect(resume).toHaveBeenCalledOnce();
  });

  it('ses tercihini master kazancına yumuşatır ve susturur', () => {
    audio.setVolume(0.5);
    const bus = context.gains[0];
    expect(bus.gain.value).toBeCloseTo(0.325);
    audio.setVolume(0);
    expect(bus.gain.value).toBe(0);
  });
  it('olayları aileye, mesafeye ve çarpma şiddetine eşler; pan ile 1/r uygular', () => {
    audio.route(
      [
        { kind: 'fired', source: 1, x: 0, y: 0, angle: 0 },
        { kind: 'impact', owner: 1, surface: 'ground', x: 600, y: 0, angle: 0 },
        { kind: 'impact', owner: 1, surface: 'wall', x: -1500, y: 0, angle: 0 },
        { kind: 'hit', owner: 1, target: 2, x: 0, y: 0, angle: 0 },
        { kind: 'wallHit', source: 1, x: 0, y: 0, normalX: 1, normalY: 0, speed: 50 },
        { kind: 'collision', a: 1, b: 2, x: 0, y: 0, normalX: 1, normalY: 0, speed: 160 },
      ],
      listener,
    );
    const urls = context.sources.map((s) => s.buffer?.url);
    expect(urls[0]).toContain('/cannon/');
    expect(urls[1]).toContain('/blast-mid-');
    expect(urls[2]).toContain('/blast-far-');
    expect(urls[3]).toContain('/hit/');
    expect(urls[4]).toContain('/crash/soft-');
    expect(urls[5]).toContain('/crash/hard-');
    const midGain = context.sources[1]?.connections[0] as FakeAudioGain;
    expect(midGain.gain.value).toBeCloseTo((0.85 * 160) / 600);
    expect(context.panners.map((n) => n.pan.value)).toEqual([600 / 640, -1]);
  });

  it('duraklatma döngüleri keser, UI geçişi tek kez çalar ve söküm sonrası olay yok sayılır', async () => {
    const sim = new Simulation({
      world: new World(1000, 1000, 32),
      tank: TANK,
      suspension: SUSPENSION,
      weapon: WEAPON,
    });
    sim.step(command({ moveX: 1 }), STEP_MS);
    await audio.sync(sim.vehicles, sim.player.tank);
    expect(context.sources.filter((s) => s.loop).length).toBeGreaterThan(0);
    audio.setPaused(true);
    audio.setPaused(true);
    expect(context.sources.filter((s) => s.loop).every((s) => s.stopped)).toBe(true);
    expect(context.sources.filter((s) => !s.loop).map((s) => s.buffer?.url)).toEqual([
      '/assets/audio/ui/steel/pause.ogg',
    ]);
    audio.setPaused(false);
    expect(context.sources.filter((s) => !s.loop).at(-1)?.buffer?.url).toBe(
      '/assets/audio/ui/steel/resume.ogg',
    );
    await audio.sync([], listener);
    expect(context.sources.filter((s) => s.loop).every((s) => s.stopped)).toBe(true);
    audio.dispose();
    const count = context.sources.length;
    audio.route([{ kind: 'fired', source: 1, x: 0, y: 0, angle: 0 }], listener);
    audio.setPaused(true);
    expect(context.sources).toHaveLength(count);
    expect(context.gains.every((n) => n.disconnected)).toBe(true);
  });

  it('fren kenarını ses ailesine bağlar; duraklatılmış ve işitme dışında kalan olaylar susar', async () => {
    const sim = new Simulation({
      world: new World(1000, 1000, 32),
      tank: TANK,
      suspension: SUSPENSION,
      weapon: WEAPON,
    });
    const subject = sim.player.tank;
    subject.vx = 100;
    sim.step(command({ brake: true }), STEP_MS);
    await audio.sync(sim.vehicles, subject);
    await audio.sync(sim.vehicles, subject);
    expect(context.sources.filter((s) => !s.loop).map((s) => s.buffer?.url)).toHaveLength(1);
    expect(context.sources.find((s) => !s.loop)?.buffer?.url).toContain('/brake/');
    audio.route([{ kind: 'fired', source: 1, x: 4000, y: 0, angle: 0 }], listener);
    audio.setPaused(true);
    const count = context.sources.length;
    audio.route([{ kind: 'fired', source: 1, x: 0, y: 0, angle: 0 }], listener);
    expect(context.sources).toHaveLength(count);
    await audio.sync(sim.vehicles, subject);
    expect(context.sources.filter((s) => s.loop).every((s) => s.stopped)).toBe(true);
    audio.dispose();
    await audio.sync(sim.vehicles, subject);
    expect(context.sources).toHaveLength(count);
  });

  it('aynı tohum ve olay sırası aynı varyantı seçer', async () => {
    const otherContext = new FakeAudioContext();
    const other = new GameAudio(
      otherContext as unknown as AudioContext,
      otherContext.destination as unknown as AudioNode,
    );
    await other.load();
    const event = { kind: 'fired' as const, source: 1, x: 0, y: 0, angle: 0 };
    for (let n = 0; n < 6; n++) {
      audio.route([event], listener);
      other.route([event], listener);
    }
    expect(context.sources.map((s) => s.buffer?.url)).toEqual(
      otherContext.sources.map((s) => s.buffer?.url),
    );
    other.dispose();
  });
});
