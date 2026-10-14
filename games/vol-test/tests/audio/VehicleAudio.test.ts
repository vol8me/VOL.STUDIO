import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VehicleAudio } from '@/audio/VehicleAudio';
import { AUDIO } from '@/config/audio';
import { WEAPON } from '@/config/tank';
import { ARACHNID, BULWARK, DART, STRIKER, topSpeedOf, type VehicleSpec } from '@/config/vehicles';
import { tank, world, command, DT } from '../support/sim';
import type { FakeAudioGain } from '../support/fakeAudio';
import { FakeAudioContext, type FakeAudioSource } from '../support/fakeAudio';

function output(source: FakeAudioSource): FakeAudioGain {
  return (source.connections[0] as FakeAudioGain).connections[0] as FakeAudioGain;
}

describe('araç döngüleri', () => {
  let context: FakeAudioContext;
  let voice: VehicleAudio;
  beforeEach(async () => {
    context = new FakeAudioContext();
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(
        new Response(new TextEncoder().encode(url), { headers: { 'content-type': 'audio/ogg' } }),
      ),
    );
    voice = new VehicleAudio(
      context as unknown as AudioContext,
      context.destination as unknown as AudioNode,
    );
    await voice.ready;
  });
  afterEach(() => {
    voice.dispose();
    vi.unstubAllGlobals();
  });
  it('boşta hiçbir sürekli ses başlatmaz; hareket bitince bütün döngüler durur', () => {
    const subject = tank();
    voice.update(subject, subject, false);
    expect(context.sources.filter((source) => source.started && !source.stopped)).toHaveLength(0);
    subject.trackLeft = subject.trackRight = 100;
    voice.update(subject, subject, false);
    expect(context.sources.some((source) => source.started && !source.stopped)).toBe(true);
    subject.trackLeft = subject.trackRight = 0;
    voice.update(subject, subject, false);
    expect(context.sources.filter((source) => source.started && !source.stopped)).toHaveLength(0);
  });
  it('hız ve yük motor devrini, paleti ve kaymayı modüle eder', () => {
    const subject = tank();
    subject.trackLeft = 230;
    subject.trackRight = 230;
    subject.surfaceLeft = 230;
    subject.surfaceRight = 230;
    subject.slideLeft = 120;
    voice.update(subject, subject, false);
    expect(context.sources).toHaveLength(5);
    const byName = (name: string) =>
      context.sources.find((s) => s.buffer?.url?.endsWith(`${name}.ogg`))!;
    expect(byName('engine-idle').playbackRate.value).toBe(2);
    expect(byName('engine-drive').playbackRate.value).toBeCloseTo(2220 / 1500);
    expect(byName('engine-surge').playbackRate.value).toBeCloseTo(2220 / 2700);
    expect(output(byName('tracks')).gain.value).toBe(0.3);
    expect(byName('tracks').playbackRate.value).toBe(1.6);
    expect(output(byName('skid')).gain.value).toBe(0.32);
    expect(context.sources.some((source) => source.buffer?.url?.endsWith('boost.ogg'))).toBe(false);
    subject.step(command({ moveX: 1, boost: true }), world(), DT);
    voice.update(subject, subject, false);
    expect(output(byName('boost')).gain.value).toBe(0.28);
    voice.stop();
    expect(context.sources.every((s) => s.stopped)).toBe(true);
  });
  it('yürüyücü palet gümbürtüsü yerine bacak adımı çalar ve adım temposu hızla artar', async () => {
    const own = new FakeAudioContext();
    const walker = new VehicleAudio(
      own as unknown as AudioContext,
      own.destination as unknown as AudioNode,
      ARACHNID,
    );
    await walker.ready;
    const subject = tank();
    subject.trackLeft = subject.trackRight = topSpeedOf(ARACHNID);
    walker.update(subject, subject, false);
    const urls = own.sources.map((s) => s.buffer?.url ?? '');
    expect(urls.some((url) => url.endsWith('/legs.ogg'))).toBe(true);
    expect(urls.some((url) => url.endsWith('/tracks.ogg'))).toBe(false);
    const legs = own.sources.find((s) => s.buffer?.url?.endsWith('/legs.ogg'))!;
    expect(legs.playbackRate.value).toBeCloseTo(
      AUDIO.legs.rateMax * AUDIO.vehicleVoice.arachnid.tracks,
    );
    expect(output(legs).gain.value).toBeCloseTo(AUDIO.legs.gain);
    walker.dispose();
  });
  it('motor perdesi araca göredir: ağır araç derin, hafif araç tiz; Striker referanstır', async () => {
    const idleRate = async (spec: VehicleSpec) => {
      const own = new FakeAudioContext();
      const engine = new VehicleAudio(
        own as unknown as AudioContext,
        own.destination as unknown as AudioNode,
        spec,
      );
      await engine.ready;
      const subject = tank();
      // Her araç kendi tavan hızının yarısında: devir aynı, fark yalnız aracın perde çarpanıdır.
      const half = topSpeedOf(spec) / 2;
      subject.trackLeft = subject.trackRight = subject.surfaceLeft = subject.surfaceRight = half;
      engine.update(subject, subject, false);
      const find = (name: string) => own.sources.find((s) => s.buffer?.url?.endsWith(name))!;
      const rate = find('engine-idle.ogg').playbackRate.value;
      const gain = output(find('engine-drive.ogg'));
      engine.dispose();
      return { rate, gain: gain.gain.value };
    };
    const striker = await idleRate(STRIKER);
    const bulwark = await idleRate(BULWARK);
    const dart = await idleRate(DART);
    expect(bulwark.rate).toBeLessThan(striker.rate);
    expect(dart.rate).toBeGreaterThan(striker.rate);
    expect(bulwark.rate / striker.rate).toBeCloseTo(
      AUDIO.vehicleVoice.bulwark.engine / AUDIO.vehicleVoice.striker.engine,
    );
    expect(bulwark.gain).toBeGreaterThan(dart.gain);
  });
  it('atış geri tepmesinden sonra da motor döngüsü kapanır', () => {
    // Geri tepme tankı kaydırır ve palet YOLU artığını (`groundLeft`) bırakır.
    // Yük hız-arası farktan ölçülürse bu artık "yük" sanılır ve döngüler
    // tank durduktan sonra da açık kalır.
    const subject = tank();
    const space = world();
    const aim = command({ aimX: Math.cos(subject.turret), aimY: Math.sin(subject.turret) });
    for (let i = 0; i < 30; i++) subject.step(aim, space, DT);
    subject.applyImpulse(
      -Math.cos(subject.turret) * WEAPON.recoilImpulse,
      -Math.sin(subject.turret) * WEAPON.recoilImpulse,
    );
    for (let frame = 0; frame < 600; frame++) {
      subject.step(aim, space, DT);
      voice.update(subject, subject, false);
    }
    expect(subject.groundLeft).toBeGreaterThan(0);
    expect(subject.speed).toBeCloseTo(0, 6);
    expect(context.sources.filter((source) => source.started && !source.stopped)).toHaveLength(0);
  });
  it('hareket hâlindeki fren kilidini yalnız başlangıçta bildirir', () => {
    const subject = tank();
    subject.vx = 100;
    subject.step(command({ brake: true }), world(), DT);
    expect(voice.update(subject, subject, false)).toBe(true);
    expect(voice.update(subject, subject, false)).toBe(false);
    subject.step(command(), world(), DT);
    voice.update(subject, subject, false);
    subject.step(command({ brake: true }), world(), DT);
    expect(voice.update(subject, subject, false)).toBe(true);
    voice.dispose();
    expect(voice.update(subject, subject, false)).toBe(false);
  });
});
