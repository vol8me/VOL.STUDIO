import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicEngine, type MusicCue, type MusicTrack } from '../../../src/audio/music';
import { FakeAudioContext } from './mock-audio';

function setup() {
  const context = new FakeAudioContext();
  const engine = new MusicEngine({ audioContext: context as unknown as AudioContext });
  const buffer = context.createBuffer(1, 44100, 44100);
  const cue: MusicCue = { id: 'intro', bars: 1, src: '/intro.ogg' };
  const track: MusicTrack = {
    id: 'track',
    bpm: 120,
    stems: [{ id: 'main', src: '/main.ogg' }],
    intro: cue,
  };
  return { context, engine, buffer, cue, track };
}

afterEach(() => vi.restoreAllMocks());

describe('MusicEngine yükleme ömrü', () => {
  it('dispose bekleyen stem isteğini iptal eder; geç decode yeni cue yüklemez', async () => {
    const { engine, buffer, track } = setup();
    let resolve!: (buffer: AudioBuffer) => void;
    const loading = new Promise<AudioBuffer>((done) => {
      resolve = done;
    });
    const load = vi
      .spyOn(engine.loader, 'loadFromUrl')
      .mockImplementation((src) => (src === '/main.ogg' ? loading : Promise.resolve(buffer)));
    const pending = engine.loadTrack(track);
    const signal = load.mock.calls[0]?.[1]?.signal;
    engine.dispose();
    resolve(buffer);
    expect(await pending).toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(load.mock.calls.map(([src]) => src)).toEqual(['/main.ogg']);
    expect(engine.getCurrentState().playing).toBe(false);
    await expect(engine.play('track')).rejects.toThrow();
  });

  it('dispose bekleyen cue sonucunu önbelleğe geri koymaz', async () => {
    const { engine, buffer, cue } = setup();
    let resolve!: (buffer: AudioBuffer) => void;
    vi.spyOn(engine.loader, 'loadFromUrl').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = engine.cues.load('track', cue);
    engine.dispose();
    resolve(buffer);
    expect(await pending).toBe(false);
    expect(engine.cues.has('track', cue)).toBe(false);
  });

  it('dispose sonrasında hazır buffer veya URL yeni yükleme başlatmaz', async () => {
    const { engine, buffer, cue, track } = setup();
    const load = vi.spyOn(engine.loader, 'loadFromUrl').mockResolvedValue(buffer);
    engine.dispose();
    engine.dispose();
    expect(await engine.loadTrack(track)).toBe(false);
    expect(await engine.loadTrack({ ...track, stems: [{ id: 'main', buffer }] })).toBe(false);
    expect(await engine.cues.load('track', { ...cue, buffer })).toBe(false);
    expect(engine.cues.has('track', cue)).toBe(false);
    expect(load).not.toHaveBeenCalled();
    await expect(engine.play('track')).rejects.toThrow();
  });
});
