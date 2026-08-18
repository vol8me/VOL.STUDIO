import type { SynthesisResult } from '../../../src/audio/synth/types';

/**
 * Zamanlamayi kabaca modelleyen AudioParam sahtesi.
 *
 * `when` parametresi ARTIK yok sayilmiyor: gelecege zamanlanan bir degisiklik
 * `value`'yu aninda degistirmez. Onceki sahte, "simdi kis, 130 ms sonra ac"
 * gibi iki asamali bir zamanlamayi tek adima indirgeyip son cagriyi aninda
 * uyguluyordu — gercek Web Audio'da olmayan bir davranis.
 *
 * `ownerContext` currentTime'i okumak icin baglanir; verilmezse eski davranis
 * (aninda uygula) korunur.
 */
class FakeAudioParam {
  value = 0;
  private scheduled: { when: number; value: number }[] = [];
  private ownerContext?: { currentTime: number };

  attachContext(context: { currentTime: number }): void {
    this.ownerContext = context;
  }

  /** `when` simdiden sonraysa deger hemen degismez, yalnizca kuyruga girer. */
  private applyAt(value: number, when: number): void {
    this.scheduled.push({ when, value });
    const now = this.ownerContext?.currentTime;
    if (now === undefined || when <= now) {
      this.value = value;
    }
  }

  /** Test yardimcisi: saati ilerletip zamani gelen degisiklikleri uygular. */
  advanceTo(time: number): void {
    for (const entry of this.scheduled) {
      if (entry.when <= time) this.value = entry.value;
    }
  }

  setValueAtTime(value: number, when: number): this {
    this.applyAt(value, when);
    return this;
  }

  linearRampToValueAtTime(value: number, when: number): this {
    this.applyAt(value, when);
    return this;
  }

  setTargetAtTime(target: number, when: number): this {
    this.applyAt(target, when);
    return this;
  }

  /** Zamanlanan olaylari iptal eder ama o andaki degeri korur. */
  cancelAndHoldAtTime(when: number): this {
    this.scheduled = this.scheduled.filter((s) => s.when < when);
    return this;
  }

  cancelScheduledValues(when: number): this {
    this.scheduled = this.scheduled.filter((s) => s.when < when);
    return this;
  }

  exponentialRampToValueAtTime(): this {
    return this;
  }
}

class FakeAudioNode {
  connected: FakeAudioNode[] = [];

  connect(node: FakeAudioNode): this {
    this.connected.push(node);
    return this;
  }

  disconnect(): void {
    this.connected = [];
  }
}

export class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
}

export class FakeDynamicsCompressorNode extends FakeAudioNode {
  threshold = new FakeAudioParam();
  knee = new FakeAudioParam();
  ratio = new FakeAudioParam();
  attack = new FakeAudioParam();
  release = new FakeAudioParam();
}

export class FakeAudioBufferSourceNode extends FakeAudioNode {
  buffer?: AudioBuffer;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;

  private startTime?: number;
  private stopTime?: number;

  start(when: number, offset = 0): void {
    this.startTime = when + offset;
  }

  stop(when?: number): void {
    this.stopTime = when;
  }

  simulateEnded(): void {
    this.onended?.();
  }
}

export class FakeAudioBuffer {
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  readonly numberOfChannels: number;
  private channels: Float32Array[];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }

  copyFromChannel(destination: Float32Array, channelNumber: number): void {
    const src = this.channels[channelNumber];
    for (let i = 0; i < Math.min(destination.length, src.length); i++) {
      destination[i] = src[i];
    }
  }

  copyToChannel(source: Float32Array, channelNumber: number): void {
    const dst = this.channels[channelNumber];
    for (let i = 0; i < Math.min(source.length, dst.length); i++) {
      dst[i] = source[i];
    }
  }
}

export class FakeAudioContext {
  currentTime = 0;
  state: 'running' | 'suspended' = 'running';
  destination = new FakeAudioNode();

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer {
    return new FakeAudioBuffer(numberOfChannels, length, sampleRate) as unknown as AudioBuffer;
  }

  createGain(): AudioNode {
    const node = new FakeGainNode();
    // Param'in `when` degerlendirmesi icin context saatine erisimi olmali.
    node.gain.attachContext(this);
    return node as unknown as GainNode;
  }

  /** Üretilen kaynaklar — testler doğal bitişi taklit edebilsin diye tutulur. */
  readonly createdSources: FakeAudioBufferSourceNode[] = [];

  createBufferSource(): AudioBufferSourceNode {
    const node = new FakeAudioBufferSourceNode();
    this.createdSources.push(node);
    return node as unknown as AudioBufferSourceNode;
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    return new FakeDynamicsCompressorNode() as unknown as DynamicsCompressorNode;
  }

  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }

  decodeAudioData(
    data: ArrayBuffer,
    successCallback?: (buffer: AudioBuffer) => void,
    errorCallback?: ((err: DOMException | null) => void) | null,
  ): Promise<AudioBuffer> {
    const buffer = this.createBuffer(1, data.byteLength / 2, 44100);
    return new Promise((resolve) => {
      if (successCallback) successCallback(buffer);
      resolve(buffer);
      if (errorCallback) errorCallback(null);
    });
  }
}

export function createFakeAudioBufferFromResult(
  result: SynthesisResult,
  context: FakeAudioContext,
): AudioBuffer {
  const buffer = context.createBuffer(
    result.channels.length,
    result.channels[0]?.length ?? 0,
    result.sampleRate,
  );
  for (let ch = 0; ch < result.channels.length; ch++) {
    buffer.copyToChannel(result.channels[ch] as Float32Array<ArrayBuffer>, ch);
  }
  return buffer;
}
