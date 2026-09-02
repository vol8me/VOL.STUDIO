import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundBank } from '../../src/audio/sfx/SoundBank';

class FakeParam {
  value = 1;
  setValueAtTime(value: number): void {
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

class FakeSource extends FakeNode {
  buffer: AudioBuffer | null = null;
  readonly playbackRate = new FakeParam();
  onended: (() => void) | null = null;
  readonly start = vi.fn();
  readonly stop = vi.fn();
}

class FakeContext {
  currentTime = 0;
  readonly sources: FakeSource[] = [];
  readonly gains: FakeGain[] = [];

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

  decodeAudioData(): Promise<AudioBuffer> {
    return Promise.resolve({ duration: 0.1 } as AudioBuffer);
  }
}

describe('SoundBank', () => {
  let context: FakeContext;
  let destination: FakeNode;

  beforeEach(() => {
    context = new FakeContext();
    destination = new FakeNode();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { 'content-type': 'audio/ogg' },
          }),
        ),
      ),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  function makeBank(options: ConstructorParameters<typeof SoundBank>[2] = {}): SoundBank {
    return new SoundBank(
      context as unknown as AudioContext,
      destination as unknown as AudioNode,
      options,
    );
  }

  it('kayıtlı varyantları yükler ve seçilen bufferı çalar', async () => {
    const bank = makeBank({ random: { next: () => 0.99, bipolar: () => 0.5 } });
    bank.register('step', ['/step-1.ogg', '/step-2.ogg']);

    await bank.loadAll();
    bank.play('step', { gain: 0.6, rate: 1.2, rateJitter: 0.1 });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(bank.isLoaded('step')).toBe(true);
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]?.start).toHaveBeenCalledTimes(1);
    expect(context.sources[0]?.playbackRate.value).toBeCloseTo(1.26);
    // İlk gain banka bus'ı, ikincisi sesin kendi gain'idir.
    expect(context.gains[1]?.gain.value).toBeCloseTo(0.6);
  });

  it('aynı kimliğin eşzamanlı bütçesinde en eski sesi düşürür', async () => {
    const bank = makeBank({ maxVoicesPerSound: 1 });
    bank.register('impact', ['/impact.ogg']);
    await bank.load('impact');

    bank.play('impact');
    bank.play('impact');

    expect(context.sources).toHaveLength(2);
    expect(context.sources[0]?.stop).toHaveBeenCalledTimes(1);
    expect(context.sources[0]?.disconnect).toHaveBeenCalledTimes(1);
    expect(context.sources[1]?.stop).not.toHaveBeenCalled();
  });

  it('yeniden tetikleme aralığında aynı sesi yutar', async () => {
    const bank = makeBank({ minRetriggerMs: 100 });
    bank.register('step', ['/step.ogg']);
    await bank.load('step');

    context.currentTime = 1;
    bank.play('step');
    context.currentTime = 1.05;
    bank.play('step');
    context.currentTime = 1.11;
    bank.play('step');

    expect(context.sources).toHaveLength(2);
  });

  it('yüklenmemiş/bilinmeyen sesi güvenle atlar ve volume değerini kelepçeler', () => {
    const bank = makeBank();
    bank.play('missing');
    bank.setBusVolume(3);

    expect(context.sources).toHaveLength(0);
    expect(context.gains[0]?.gain.value).toBe(1);
  });

  it('biten sesi emekliye ayırır; dispose aktif sesleri ve düğümleri temizler', async () => {
    const bank = makeBank();
    bank.register('step', ['/step.ogg']);
    await bank.load('step');
    bank.play('step');

    context.sources[0]?.onended?.();
    expect(context.sources[0]?.disconnect).toHaveBeenCalledTimes(1);

    bank.play('step');
    bank.dispose();
    bank.dispose();

    expect(context.sources[1]?.stop).toHaveBeenCalledTimes(1);
    expect(context.gains[0]?.disconnect).toHaveBeenCalledTimes(1);
    expect(bank.isLoaded('step')).toBe(false);
  });

  it('bozuk bir varyant kalanı susturmaz', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: { 'content-type': 'audio/ogg' },
        }),
      );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bank = makeBank();
    bank.register('step', ['/broken.ogg', '/working.ogg']);

    await bank.load('step');

    expect(bank.isLoaded('step')).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('kaynak başlatılamazsa düğümleri ve ses bütçesini temizler', async () => {
    const bank = makeBank({ maxVoicesPerSound: 1 });
    bank.register('impact', ['/impact.ogg']);
    await bank.load('impact');
    const startError = new Error('start failed');

    context.createBufferSource = (() => {
      const source = new FakeSource();
      source.start.mockImplementationOnce(() => {
        throw startError;
      });
      context.sources.push(source);
      return source as unknown as AudioBufferSourceNode;
    }) as typeof context.createBufferSource;

    expect(() => bank.play('impact')).toThrow(startError);
    expect(context.sources[0]?.disconnect).toHaveBeenCalledTimes(1);
    expect(context.gains[1]?.disconnect).toHaveBeenCalledTimes(1);
  });
});
