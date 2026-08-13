import { vi } from 'vitest';

class FakeAudioParam {
  value = 1;

  setValueAtTime(value: number): this {
    this.value = value;
    return this;
  }

  setTargetAtTime(value: number): this {
    this.value = value;
    return this;
  }

  linearRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }

  cancelScheduledValues(): this {
    return this;
  }

  cancelAndHoldAtTime(): this {
    return this;
  }

  exponentialRampToValueAtTime(): this {
    return this;
  }
}

class FakeAudioNode {
  connect = vi.fn((node: FakeAudioNode) => node);
  disconnect = vi.fn();
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakeStereoPannerNode extends FakeAudioNode {
  pan = new FakeAudioParam();
}

export class FakeAudioBufferSourceNode extends FakeAudioNode {
  buffer: unknown = null;
  detune = new FakeAudioParam();
  playbackRate = new FakeAudioParam();
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

class FakeDynamicsCompressorNode extends FakeAudioNode {
  threshold = new FakeAudioParam();
  knee = new FakeAudioParam();
  ratio = new FakeAudioParam();
  attack = new FakeAudioParam();
  release = new FakeAudioParam();
}

class FakeAudioBuffer {
  duration = 1;
  length = 44100;
  numberOfChannels = 1;
  sampleRate = 44100;
  getChannelData = vi.fn(() => new Float32Array(this.length));
  copyFromChannel = vi.fn();
  copyToChannel = vi.fn();
}

export class FakeAudioContext {
  currentTime = 0;
  state: 'running' | 'suspended' = 'running';
  destination = new FakeAudioNode() as unknown as AudioDestinationNode;

  createBuffer(): AudioBuffer {
    return new FakeAudioBuffer() as unknown as AudioBuffer;
  }

  createGain(): GainNode {
    return new FakeGainNode() as unknown as GainNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    return new FakeAudioBufferSourceNode() as unknown as AudioBufferSourceNode;
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    return new FakeDynamicsCompressorNode() as unknown as DynamicsCompressorNode;
  }

  createStereoPanner(): StereoPannerNode {
    return new FakeStereoPannerNode() as unknown as StereoPannerNode;
  }

  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
}
