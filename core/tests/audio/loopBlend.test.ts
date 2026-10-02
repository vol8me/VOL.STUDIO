import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoopBlend, loopBlendWeights, type LoopBlendLayer } from '../../src/audio/sfx/LoopBlend';

class FakeParam {
  value = 1;
  readonly targets: Array<[number, number, number]> = [];
  setTargetAtTime(value: number, time: number, constant: number): void {
    this.targets.push([value, time, constant]);
    this.value = value;
  }
}

class FakeNode {
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakePanner extends FakeNode {
  readonly pan = new FakeParam();
}

class FakeSource extends FakeNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  readonly playbackRate = new FakeParam();
  readonly start = vi.fn();
  readonly stop = vi.fn();
}

class FakeContext {
  currentTime = 2;
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];
  readonly panners: FakePanner[] = [];

  createGain(): GainNode {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  createStereoPanner(): StereoPannerNode {
    const panner = new FakePanner();
    this.panners.push(panner);
    return panner as unknown as StereoPannerNode;
  }

  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
    return Promise.resolve({ duration: 1, length: data.byteLength } as unknown as AudioBuffer);
  }
}

describe('loopBlendWeights', () => {
  it('komşu iki katmanı eşit güçle paylaşır; uçların ötesi uç katmandır', () => {
    const at = [0, 0.5, 1];
    expect(loopBlendWeights(at, -1)).toEqual([1, 0, 0]);
    expect(loopBlendWeights(at, 2)).toEqual([0, 0, 1]);
    expect(loopBlendWeights(at, 0.5)).toEqual([expect.closeTo(0), 1, 0]);
    const middle = loopBlendWeights(at, 0.25);
    expect(middle[0]).toBeCloseTo(Math.SQRT1_2);
    expect(middle[1]).toBeCloseTo(Math.SQRT1_2);
    for (const level of [0.1, 0.33, 0.61, 0.9]) {
      const power = loopBlendWeights(at, level).reduce((sum, weight) => sum + weight * weight, 0);
      expect(power).toBeCloseTo(1);
    }
    expect(loopBlendWeights([], 0.5)).toEqual([]);
    expect(loopBlendWeights([0.3], Number.NaN)).toEqual([1]);
  });
});

describe('LoopBlend', () => {
  let context: FakeContext;
  const destination = new FakeNode();

  beforeEach(() => {
    context = new FakeContext();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('broken')
          ? Promise.resolve(new Response('x', { status: 404 }))
          : Promise.resolve(
              new Response(new Uint8Array([1, 2, 3]), {
                status: 200,
                headers: { 'content-type': 'audio/ogg' },
              }),
            ),
      ),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  function make(
    layers: LoopBlendLayer[] = [
      { url: '/high.ogg', at: 1 },
      { url: '/idle.ogg', at: 0 },
    ],
  ) {
    return new LoopBlend(
      context as unknown as AudioContext,
      destination as unknown as AudioNode,
      layers,
      { smoothingSeconds: 0.05 },
    );
  }

  it('sökümden sonra biten decode tamponu ve düğümü geri kurmaz', async () => {
    let finish: (buffer: AudioBuffer) => void = () => undefined;
    let started: () => void = () => undefined;
    const decoding = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.spyOn(context, 'decodeAudioData').mockImplementation(
      () =>
        new Promise<AudioBuffer>((resolve) => {
          finish = resolve;
          started();
        }),
    );
    const blend = make();
    const pending = blend.load();
    await decoding;
    blend.dispose();
    finish({} as AudioBuffer);
    await pending;
    expect(blend.loaded).toBe(false);
    expect(context.gains).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('söküm bekleyen indirmeyi iptal eder; sonraki varyantı istemez', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options: RequestInit) => {
        signal = options.signal as AbortSignal;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('iptal')));
        });
      }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const blend = make();
    const pending = blend.load();
    blend.dispose();
    expect(signal?.aborted).toBe(true);
    await pending;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(blend.loaded).toBe(false);
    expect(context.gains).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('yüklenen katmanlar döngüde başlar; eksen sırasına dizilir, karışım yumuşar', async () => {
    const blend = make();
    await blend.load();
    expect(blend.loaded).toBe(true);
    blend.start();
    expect(blend.isPlaying).toBe(true);
    expect(context.sources).toHaveLength(2);
    for (const source of context.sources) {
      expect(source.loop).toBe(true);
      expect(source.start).toHaveBeenCalledTimes(1);
    }
    // İlk katman kazancı (0'daki rölanti) başlangıçta tam, ikinci sessiz.
    const [, idleGain, highGain] = context.gains;
    expect(idleGain?.gain.value).toBe(1);
    expect(highGain?.gain.value).toBe(0);
    blend.setLevel(1);
    expect(idleGain?.gain.targets.at(-1)).toEqual([expect.closeTo(0), 2, 0.05]);
    expect(highGain?.gain.targets.at(-1)).toEqual([1, 2, 0.05]);
  });

  it('kazanç, hız ve pan kelepçelenir ve yumuşar; ikinci start kaynak çoğaltmaz', async () => {
    const blend = make();
    await blend.load();
    blend.start();
    blend.start();
    expect(context.sources).toHaveLength(2);
    blend.setGain(3);
    blend.setRate(10);
    blend.setPan(-5);
    const output = context.gains[0];
    expect(output.gain.targets.at(-1)?.[0]).toBe(1);
    for (const source of context.sources) expect(source.playbackRate.value).toBe(4);
    expect(context.panners[0]?.pan.targets.at(-1)?.[0]).toBe(-1);
  });

  it('yükleme bitmeden start çağrılırsa yükleme bitince başlar; stop yeniden başlatılabilir', async () => {
    const blend = make();
    blend.setRate(1.5);
    blend.start();
    expect(context.sources).toHaveLength(0);
    await blend.load();
    expect(context.sources).toHaveLength(2);
    expect(context.sources[0]?.playbackRate.value).toBe(1.5);
    blend.stop();
    expect(context.sources.every((source) => source.stop.mock.calls.length === 1)).toBe(true);
    blend.start();
    expect(context.sources).toHaveLength(4);
  });

  it('düşen katman atlanır, kalanla sürer; söküm sonrası yükleme ve parametre yok sayılır', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const blend = make([
      { url: '/broken.ogg', at: 0 },
      { url: '/drive.ogg', at: 0.5 },
    ]);
    await blend.load();
    expect(warn).toHaveBeenCalled();
    blend.start();
    expect(context.sources).toHaveLength(1);
    blend.dispose();
    expect(context.sources[0]?.stop).toHaveBeenCalled();
    blend.setGain(1);
    blend.start();
    expect(context.sources).toHaveLength(1);
    warn.mockRestore();
  });

  it('hedef perdeyi katmanın üretim perdesine böler, sınırlar ve yeniden başlatmada korur', async () => {
    const blend = make([
      { url: '/idle.ogg', at: 0, pitch: 780 },
      { url: '/drive.ogg', at: 0.5, pitch: 1500 },
      { url: '/surge.ogg', at: 1, pitch: 2700 },
      { url: '/unpitched.ogg', at: 1 },
    ]);
    blend.setPitch(1500);
    await blend.load();
    blend.start();
    expect(context.sources.map((source) => source.playbackRate.value)).toEqual([
      1500 / 780,
      1,
      1500 / 2700,
      1,
    ]);
    blend.setPitch(5400);
    expect(context.sources.map((source) => source.playbackRate.value)).toEqual([2, 2, 2, 1]);
    expect(context.sources[0]?.playbackRate.targets.at(-1)).toEqual([2, 2, 0.05]);
    blend.setPitch(100);
    expect(context.sources.map((source) => source.playbackRate.value)).toEqual([0.5, 0.5, 0.5, 1]);
    blend.setRate(1.5);
    expect(context.sources.every((source) => source.playbackRate.value === 1.5)).toBe(true);
    blend.setPitch(1500);
    blend.stop();
    blend.start();
    expect(context.sources[4]?.playbackRate.value).toBeCloseTo(1500 / 780);
    blend.dispose();
    blend.setPitch(2700);
    expect(context.sources).toHaveLength(8);
  });

  it('geçersiz üretim perdesi reddedilir; geçersiz hedef mevcut perdeyi bozmaz', async () => {
    for (const pitch of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => make([{ url: '/idle.ogg', at: 0, pitch }])).toThrow(/pitch/);
    }
    const blend = make([{ url: '/drive.ogg', at: 0, pitch: 1500 }]);
    await blend.load();
    blend.start();
    blend.setPitch(1500);
    for (const pitch of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) blend.setPitch(pitch);
    expect(context.sources[0]?.playbackRate.value).toBe(1);
  });

  it('boş katman listesi kurulmaz', () => {
    expect(() => make([])).toThrow(/LoopBlend/);
  });
});
