import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameAudio } from '@/audio/GameAudio';
import { Simulation } from '@/sim/Simulation';
import { command, STEP_MS } from '../support/sim';
import { World } from '@/sim/world/World';
import type { FakeAudioGain } from '../support/fakeAudio';
import { FakeAudioContext } from '../support/fakeAudio';
import { Button, uiIntentBusFor } from '@volstudio/core/ui';
import { AUDIO } from '@/config/audio';
import {
  ARACHNID,
  BULWARK,
  DART,
  MANTA,
  STRIKER,
  WIDOW,
  type VehicleSpec,
} from '@/config/vehicles';

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
        { kind: 'fired', mount: 0, source: 1, x: 0, y: 0, angle: 0, vx: 0, vy: 0 },
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
      vehicle: STRIKER,
    });
    sim.step(command({ moveX: 1 }), STEP_MS);
    await audio.sync(sim.vehicles, sim.player.chassis);
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
    audio.route(
      [{ kind: 'fired', mount: 0, source: 1, x: 0, y: 0, angle: 0, vx: 0, vy: 0 }],
      listener,
    );
    audio.setPaused(true);
    expect(context.sources).toHaveLength(count);
    expect(context.gains.every((n) => n.disconnected)).toBe(true);
  });

  it('atış sesi silah stiline göredir: kabuk ve ağır mermi topu perdeyle, ray, plazma ve iğne kendi teslimiyle çalar', async () => {
    const shotOf = async (vehicle: VehicleSpec) => {
      const sim = new Simulation({ world: new World(1000, 1000, 32), vehicle });
      await audio.sync(sim.vehicles, sim.player.chassis);
      const before = context.sources.length;
      audio.route(
        [{ kind: 'fired', mount: 0, source: sim.player.id, x: 0, y: 0, angle: 0, vx: 0, vy: 0 }],
        listener,
      );
      const source = context.sources
        .slice(before)
        .find((s) => /\/(cannon|shot-[a-z]+)/.test(s.buffer?.url ?? ''));
      return {
        url: source!.buffer!.url!,
        rate: source!.playbackRate.value,
        gain: (source!.connections[0] as FakeAudioGain).gain.value,
      };
    };
    const shell = await shotOf(STRIKER);
    const slug = await shotOf(BULWARK);
    const rail = await shotOf(DART);
    const plasma = await shotOf(ARACHNID);
    const needle = await shotOf(WIDOW);
    const arc = await shotOf(MANTA);
    expect(shell.url).toContain('/cannon/');
    expect(slug.url).toContain('/cannon/');
    expect(shell.rate).toBe(AUDIO.weaponVoice.shell.rate);
    expect(slug.rate).toBe(AUDIO.weaponVoice.slug.rate);
    expect(slug.rate).toBeLessThan(shell.rate);
    expect(slug.gain).toBeGreaterThan(shell.gain);
    expect(rail.url).toMatch(/shot-rail\.ogg$/);
    expect(plasma.url).toMatch(/shot-plasma\.ogg$/);
    expect(needle.url).toMatch(/shot-needle\.ogg$/);
    expect(arc.url).toMatch(/shot-arc\.ogg$/);
    for (const own of [rail, plasma, needle, arc]) expect(own.rate).toBe(1);
  });

  it('parça kopması yakında snap sesini çalar, uzakta ve duraklatılmışken susar', () => {
    const count = (): number =>
      context.sources.filter((s) => s.buffer?.url?.endsWith('/snap.ogg')).length;
    audio.route([{ kind: 'broke', target: 1, part: 0, x: 40, y: 0 }], listener);
    expect(count()).toBe(1);
    audio.route([{ kind: 'broke', target: 1, part: 1, x: 99999, y: 0 }], listener);
    expect(count()).toBe(1);
    audio.setPaused(true);
    audio.route([{ kind: 'broke', target: 1, part: 1, x: 40, y: 0 }], listener);
    expect(count()).toBe(1);
  });

  it('boğulma batış sesini çalar; başka ölüm, uzak araç ve duraklatma susar', async () => {
    const count = (): number =>
      context.sources.filter((s) => s.buffer?.url?.endsWith('/sink.ogg')).length;
    const sim = new Simulation({ world: new World(1000, 1000, 32), vehicle: STRIKER });
    const id = sim.player.id;
    // Konum son eşlenen şasiden gelir: eşlenmeden önce yeri bilinmez ve çalmaz.
    audio.route([{ kind: 'died', target: id, cause: 'drown' }], listener);
    expect(count()).toBe(0);
    await audio.sync(sim.vehicles, sim.player.chassis);
    audio.route([{ kind: 'died', target: id, cause: 'projectile' }], listener);
    expect(count()).toBe(0);
    audio.route([{ kind: 'died', target: id, cause: 'drown' }], sim.player.chassis);
    expect(count()).toBe(1);
    audio.route([{ kind: 'died', target: id, cause: 'drown' }], { x: 99999, y: 0 });
    expect(count()).toBe(1);
    audio.setPaused(true);
    audio.route([{ kind: 'died', target: id, cause: 'drown' }], sim.player.chassis);
    expect(count()).toBe(1);
  });

  it('yürüyücü ve süzülenin atılımı başlarken dash sesi çalar; tankın hızlanması çalmaz ve atılım sürerken tekrarlanmaz', async () => {
    const dashes = (): number =>
      context.sources.filter((s) => s.buffer?.url?.endsWith('/dash.ogg')).length;
    for (const vehicle of [ARACHNID, MANTA]) {
      const sim = new Simulation({ world: new World(1000, 1000, 32), vehicle });
      const subject = sim.player.chassis;
      const before = dashes();
      await audio.sync(sim.vehicles, subject);
      expect(dashes()).toBe(before);
      sim.step(command({ moveX: 1, brake: true }), STEP_MS);
      expect(subject.boosting).toBe(true);
      await audio.sync(sim.vehicles, subject);
      expect(dashes()).toBe(before + 1);
      sim.step(command({ moveX: 1, brake: true }), STEP_MS);
      await audio.sync(sim.vehicles, subject);
      expect(dashes()).toBe(before + 1);
    }
    const tankSim = new Simulation({ world: new World(1000, 1000, 32), vehicle: STRIKER });
    const before = dashes();
    tankSim.step(command({ moveX: 1, boost: true }), STEP_MS);
    await audio.sync(tankSim.vehicles, tankSim.player.chassis);
    expect(dashes()).toBe(before);
  });

  it('fren kenarını ses ailesine bağlar; duraklatılmış ve işitme dışında kalan olaylar susar', async () => {
    const sim = new Simulation({
      world: new World(1000, 1000, 32),
      vehicle: STRIKER,
    });
    const subject = sim.player.chassis;
    subject.vx = 100;
    sim.step(command({ brake: true }), STEP_MS);
    await audio.sync(sim.vehicles, subject);
    await audio.sync(sim.vehicles, subject);
    expect(context.sources.filter((s) => !s.loop).map((s) => s.buffer?.url)).toHaveLength(1);
    expect(context.sources.find((s) => !s.loop)?.buffer?.url).toContain('/brake/');
    audio.route(
      [{ kind: 'fired', mount: 0, source: 1, x: 4000, y: 0, angle: 0, vx: 0, vy: 0 }],
      listener,
    );
    audio.setPaused(true);
    const count = context.sources.length;
    audio.route(
      [{ kind: 'fired', mount: 0, source: 1, x: 0, y: 0, angle: 0, vx: 0, vy: 0 }],
      listener,
    );
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
    const event = {
      kind: 'fired' as const,
      source: 1,
      mount: 0,
      x: 0,
      y: 0,
      angle: 0,
      vx: 0,
      vy: 0,
    };
    for (let n = 0; n < 6; n++) {
      audio.route([event], listener);
      other.route([event], listener);
    }
    expect(context.sources.map((s) => s.buffer?.url)).toEqual(
      otherContext.sources.map((s) => s.buffer?.url),
    );
    other.dispose();
  });

  it('arayüz sesi niyet veriyoluna bağlanır; duraklatma paneli onunla çalar ve eski sesle çift çalmaz', async () => {
    context.state = 'running';
    const root = document.createElement('div');
    document.body.append(root);
    const button = new Button('Tamam');
    root.append(button.element);
    const { bus, release } = uiIntentBusFor(root);
    audio.attachUi(bus, root);
    audio.attachUi(bus, root); // ikinci çağrı ikinci kit kurmaz
    // Örnekler yüklenene dek ses düşer; yükleme bitince düğme niyeti çalar.
    await vi.waitFor(() => {
      const before = context.sources.length;
      button.element.click();
      expect(context.sources.length).toBeGreaterThan(before);
    });
    expect(context.sources.at(-1)?.buffer?.url).toMatch(
      /\/assets\/audio\/ui\/steel\/press-[abc]\.ogg$/,
    );
    const before = context.sources.length;
    audio.setPaused(true);
    const urls = context.sources.slice(before).map((source) => source.buffer?.url);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/ui\/steel\/panel-open-[abc]\.ogg$/);
    expect(urls.some((url) => url?.endsWith('/pause.ogg'))).toBe(false);
    release();
    root.remove();
  });

  it('arayüz kiti oyunun ana otobüsüne bağlanır: ana ses tercihi arayüz sesini de belirler', () => {
    const gameBus = context.gains[0];
    const root = document.createElement('div');
    document.body.append(root);
    const { bus, release } = uiIntentBusFor(root);
    const feeders = (): number =>
      context.gains.filter((node) => node !== gameBus && node.connections.includes(gameBus)).length;
    const before = feeders();
    audio.attachUi(bus, root);
    expect(feeders()).toBeGreaterThan(before);
    audio.setVolume(0);
    expect(gameBus.gain.value).toBe(0);
    release();
    root.remove();
  });
});
