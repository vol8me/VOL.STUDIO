export class FakeAudioParam {
  value = 1;
  setTargetAtTime(value: number): void {
    this.value = value;
  }
  setValueAtTime(value: number): void {
    this.value = value;
  }
}
export class FakeAudioNode {
  connections: unknown[] = [];
  disconnected = false;
  connect(node: unknown): void {
    this.connections.push(node);
  }
  disconnect(): void {
    this.disconnected = true;
    this.connections = [];
  }
}
export class FakeAudioGain extends FakeAudioNode {
  gain = new FakeAudioParam();
}
export class FakeAudioPanner extends FakeAudioNode {
  pan = new FakeAudioParam();
}
export class FakeAudioSource extends FakeAudioNode {
  buffer: (AudioBuffer & { url?: string }) | null = null;
  playbackRate = new FakeAudioParam();
  loop = false;
  started = false;
  stopped = false;
  onended: (() => void) | null = null;
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}
export class FakeAudioContext {
  currentTime = 0;
  state = 'running';
  sources: FakeAudioSource[] = [];
  gains: FakeAudioGain[] = [];
  panners: FakeAudioPanner[] = [];
  destination = new FakeAudioNode();
  createGain(): GainNode {
    const n = new FakeAudioGain();
    this.gains.push(n);
    return n as unknown as GainNode;
  }
  createStereoPanner(): StereoPannerNode {
    const n = new FakeAudioPanner();
    this.panners.push(n);
    return n as unknown as StereoPannerNode;
  }
  createBufferSource(): AudioBufferSourceNode {
    const n = new FakeAudioSource();
    this.sources.push(n);
    return n as unknown as AudioBufferSourceNode;
  }
  decodeAudioData(bytes: ArrayBuffer): Promise<AudioBuffer> {
    return Promise.resolve({
      duration: 1,
      length: bytes.byteLength,
      url: new TextDecoder().decode(bytes),
    } as unknown as AudioBuffer);
  }
}
