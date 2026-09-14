export interface WorldMetadata {
  readonly id: string;
  readonly seed: number;
  readonly createdAtMs: number;
}

export interface WorldMetadataSource {
  nextUint32(): number;
  now(): number;
}

const generatedSeeds = new Set<number>();

export function createFreshWorldMetadata(
  source: WorldMetadataSource = browserWorldMetadataSource(),
): WorldMetadata {
  if (generatedSeeds.size >= 0x1_0000_0000) {
    throw new RangeError('Bu oturumdaki uint32 dünya tohumu alanı tükendi.');
  }
  let seed = source.nextUint32() >>> 0;
  while (generatedSeeds.has(seed)) seed = (seed + 1) >>> 0;
  generatedSeeds.add(seed);
  const createdAtMs = source.now();
  const metadata = {
    id: `world-${createdAtMs.toString(36)}-${seed.toString(16).padStart(8, '0')}`,
    seed,
    createdAtMs,
  };
  validateWorldMetadata(metadata);
  return metadata;
}

export function createExplicitWorldMetadata(seed: number, createdAtMs = 0): WorldMetadata {
  const metadata = {
    id: `world-explicit-${createdAtMs.toString(36)}-${seed.toString(16).padStart(8, '0')}`,
    seed,
    createdAtMs,
  };
  validateWorldMetadata(metadata);
  return metadata;
}

export function validateWorldMetadata(metadata: WorldMetadata): void {
  if (
    !metadata.id ||
    !Number.isInteger(metadata.seed) ||
    metadata.seed < 0 ||
    metadata.seed > 0xffffffff
  ) {
    throw new RangeError(`Dünya tohumu uint32 ve kimliği dolu olmalı: ${metadata.seed}`);
  }
  if (!Number.isSafeInteger(metadata.createdAtMs) || metadata.createdAtMs < 0) {
    throw new RangeError(`Dünya oluşturma zamanı geçersiz: ${metadata.createdAtMs}`);
  }
}

function browserWorldMetadataSource(): WorldMetadataSource {
  return {
    nextUint32: () => {
      const values = new Uint32Array(1);
      globalThis.crypto.getRandomValues(values);
      return values[0];
    },
    now: () => Date.now(),
  };
}
