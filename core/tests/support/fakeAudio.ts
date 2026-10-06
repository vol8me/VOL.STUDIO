import { vi } from 'vitest';

/**
 * Web Audio sahtesi: `SoundBank`/`UiSoundKit` testleri için. Gerçek ses üretmez;
 * kaynak ve kazanç düğümlerini kaydeder, bağlam durumunu (`suspended`/`running`)
 * ve çözülen tamponun HANGİ URL'den geldiğini izlenebilir tutar.
 */
export class FakeParam {
  value = 1;
  setValueAtTime(value: number): void {
    this.value = value;
  }
}

export class FakeNode {
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

export class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

export class FakeSource extends FakeNode {
  buffer: { url: string } | null = null;
  readonly playbackRate = new FakeParam();
  onended: (() => void) | null = null;
  readonly start = vi.fn();
  readonly stop = vi.fn();
}

export class FakeContext {
  currentTime = 0;
  state: AudioContextState = 'suspended';
  readonly destination = new FakeNode();
  readonly sources: FakeSource[] = [];
  readonly gains: FakeGain[] = [];
  readonly resume = vi.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });
  readonly suspend = vi.fn(() => {
    this.state = 'suspended';
    return Promise.resolve();
  });
  readonly close = vi.fn(() => {
    this.state = 'closed';
    return Promise.resolve();
  });

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

  /** Gövde, `fetch` sahtesinin yazdığı URL metnidir: tampon onu taşır. */
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
    return Promise.resolve({
      duration: 0.1,
      url: new TextDecoder().decode(data),
    } as unknown as AudioBuffer);
  }

  /** Susturulmamış (durdurulmamış) kaynaklar. */
  get active(): FakeSource[] {
    return this.sources.filter((source) => source.stop.mock.calls.length === 0);
  }
}

/** `fetch`i URL → gövde olarak sahteler; `failing` içindeki URL'ler reddedilir. */
export function stubFetch(failing: readonly string[] = []): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (failing.includes(url)) return Promise.reject(new Error(`yüklenemedi: ${url}`));
      return Promise.resolve(
        new Response(new TextEncoder().encode(url), {
          status: 200,
          headers: { 'content-type': 'audio/ogg' },
        }),
      );
    }),
  );
}

/** Başlatılan kaynakların tampon URL'leri, başlatılma sırasıyla. */
export function playedUrls(context: FakeContext): string[] {
  return context.sources.map((source) => source.buffer?.url ?? '?');
}
