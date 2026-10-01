import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VehicleAudio } from '@/audio/VehicleAudio';
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
    subject.groundLeft = 230;
    subject.groundRight = 230;
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
