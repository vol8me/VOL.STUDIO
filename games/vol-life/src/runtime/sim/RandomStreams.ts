import { createSimRandom, type SimRandom } from '@/runtime/sim/rng';

/**
 * Alt sistem başına bağımsız rastgelelik akışları (DESIGN.md §7). Liste
 * DONDURULMUŞTUR: sıra snapshot düzenidir, ad türetmenin girdisidir. Bir akışın
 * adını ya da sırasını değiştirmek bütün dünyaları başka bir diziye taşır.
 */
export const RANDOM_STREAM_IDS = [
  'habitat',
  'fields',
  'matter-seeding',
  'lifecycle',
  'behavior',
  'evolution',
] as const;

export type RandomStreamId = (typeof RANDOM_STREAM_IDS)[number];

/**
 * Dünya tohumundan akış tohumu: akış adının FNV-1a'sı SplitMix32 ile
 * karıştırılır. SplitMix32 uint32 üzerinde birebirdir, bu yüzden aynı dünyada
 * iki akış aynı tohumu alamaz. Türetme altın değer testiyle kilitlidir.
 */
export function deriveStreamSeed(worldSeed: number, streamId: RandomStreamId): number {
  if (!Number.isInteger(worldSeed) || worldSeed < 0 || worldSeed > 0xffffffff) {
    throw new RangeError(`Dünya tohumu uint32 olmalı: ${worldSeed}`);
  }
  if (!RANDOM_STREAM_IDS.includes(streamId)) {
    throw new RangeError(`Tanınmayan rastgelelik akışı: ${String(streamId)}`);
  }
  return splitMix32((splitMix32(worldSeed >>> 0) + fnv1a32(streamId)) >>> 0);
}

export class WorldRandomStreams {
  private readonly streams: ReadonlyMap<RandomStreamId, SimRandom>;

  constructor(worldSeed: number) {
    this.streams = new Map(
      RANDOM_STREAM_IDS.map((id) => [id, createSimRandom(deriveStreamSeed(worldSeed, id))]),
    );
  }

  stream(id: RandomStreamId): SimRandom {
    const stream = this.streams.get(id);
    if (!stream) throw new RangeError(`Tanınmayan rastgelelik akışı: ${String(id)}`);
    return stream;
  }

  /** Durumlar `RANDOM_STREAM_IDS` sırasındadır; snapshot düzeni budur. */
  snapshot(): Int32Array {
    return Int32Array.from(RANDOM_STREAM_IDS, (id) => this.stream(id).getState());
  }

  restore(states: Int32Array): void {
    validateRandomStreamStates(states);
    RANDOM_STREAM_IDS.forEach((id, index) => this.stream(id).setState(states[index]));
  }
}

export function validateRandomStreamStates(states: Int32Array): void {
  if (!(states instanceof Int32Array) || states.length !== RANDOM_STREAM_IDS.length) {
    throw new RangeError(`Rastgelelik akışı durumu ${RANDOM_STREAM_IDS.length} değer taşımalı`);
  }
}

function splitMix32(value: number): number {
  let z = (value + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}
