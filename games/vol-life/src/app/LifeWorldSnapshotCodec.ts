import { FIELD_NAMES, type FieldSnapshot } from '@/runtime/sim/FieldSet';
import type { LifeWorldSnapshot } from '@/runtime/sim/LifeWorld';
import type { ParticleSnapshot } from '@/runtime/sim/ParticleStore';

const BINARY_MAGIC = 0x564c4946;
const BINARY_VERSION = 1;
const HEADER_BYTES = 32;
const FIELD_ARRAY_COUNT = FIELD_NAMES.length + 1;
const PARTICLE_FLOAT_ARRAY_COUNT = 4;

export interface LifeWorldSaveEnvelope {
  readonly schemaVersion: 1;
  readonly configFingerprint: string;
  readonly encoding: 'gzip-base64' | 'base64';
  readonly payload: string;
}

export async function encodeLifeWorldSnapshot(
  snapshot: LifeWorldSnapshot,
  configFingerprint: string,
): Promise<LifeWorldSaveEnvelope> {
  const binary = encodeBinary(snapshot);
  const canCompress = typeof CompressionStream !== 'undefined';
  const payload = canCompress ? await transform(binary, new CompressionStream('gzip')) : binary;
  return {
    schemaVersion: 1,
    configFingerprint,
    encoding: canCompress ? 'gzip-base64' : 'base64',
    payload: bytesToBase64(payload),
  };
}

export async function decodeLifeWorldSnapshot(
  value: unknown,
  expectedFingerprint: string,
): Promise<LifeWorldSnapshot | null> {
  if (!isEnvelope(value) || value.configFingerprint !== expectedFingerprint) return null;
  let bytes = base64ToBytes(value.payload);
  if (value.encoding === 'gzip-base64') {
    if (typeof DecompressionStream === 'undefined') return null;
    bytes = await transform(bytes, new DecompressionStream('gzip'));
  }
  return decodeBinary(bytes);
}

function encodeBinary(snapshot: LifeWorldSnapshot): Uint8Array {
  const fieldLength = snapshot.nutrientDiffusionSource.length;
  const particleCount = snapshot.particles.x.length;
  validateSnapshotLengths(snapshot, fieldLength, particleCount);
  const byteLength =
    HEADER_BYTES +
    fieldLength * Float32Array.BYTES_PER_ELEMENT * FIELD_ARRAY_COUNT +
    particleCount * Float32Array.BYTES_PER_ELEMENT * PARTICLE_FLOAT_ARRAY_COUNT +
    particleCount;
  const bytes = new Uint8Array(byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, BINARY_MAGIC, true);
  view.setUint16(4, BINARY_VERSION, true);
  view.setFloat64(8, snapshot.tick, true);
  view.setInt32(16, snapshot.rngState, true);
  view.setUint32(20, snapshot.nextFieldBand, true);
  view.setUint32(24, fieldLength, true);
  view.setUint32(28, particleCount, true);
  let offset = HEADER_BYTES;
  offset = writeFloatArray(view, offset, snapshot.nutrientDiffusionSource);
  for (const name of FIELD_NAMES) offset = writeFloatArray(view, offset, snapshot.fields[name]);
  for (const array of particleFloatArrays(snapshot.particles)) {
    offset = writeFloatArray(view, offset, array);
  }
  bytes.set(snapshot.particles.type, offset);
  return bytes;
}

function decodeBinary(bytes: Uint8Array): LifeWorldSnapshot {
  if (bytes.byteLength < HEADER_BYTES) throw new RangeError('Dünya kaydı başlığı eksik.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== BINARY_MAGIC || view.getUint16(4, true) !== BINARY_VERSION) {
    throw new RangeError('Dünya kaydı biçimi tanınmıyor.');
  }
  const tick = view.getFloat64(8, true);
  const rngState = view.getInt32(16, true);
  const nextFieldBand = view.getUint32(20, true);
  const fieldLength = view.getUint32(24, true);
  const particleCount = view.getUint32(28, true);
  if (!Number.isSafeInteger(tick) || tick < 0 || fieldLength < 4 || particleCount < 1) {
    throw new RangeError('Dünya kaydı boyutları geçersiz.');
  }
  const expectedBytes =
    HEADER_BYTES +
    fieldLength * Float32Array.BYTES_PER_ELEMENT * FIELD_ARRAY_COUNT +
    particleCount * Float32Array.BYTES_PER_ELEMENT * PARTICLE_FLOAT_ARRAY_COUNT +
    particleCount;
  if (bytes.byteLength !== expectedBytes) throw new RangeError('Dünya kaydı uzunluğu uyuşmuyor.');
  let offset = HEADER_BYTES;
  let array: Float32Array;
  [array, offset] = readFloatArray(view, offset, fieldLength);
  const nutrientDiffusionSource = array;
  const fields = {} as Record<(typeof FIELD_NAMES)[number], Float32Array>;
  for (const name of FIELD_NAMES) {
    [array, offset] = readFloatArray(view, offset, fieldLength);
    fields[name] = array;
  }
  const particleFloats: Float32Array[] = [];
  for (let index = 0; index < PARTICLE_FLOAT_ARRAY_COUNT; index++) {
    [array, offset] = readFloatArray(view, offset, particleCount);
    particleFloats.push(array);
  }
  const type = bytes.slice(offset, offset + particleCount);
  return {
    tick,
    rngState,
    nextFieldBand,
    nutrientDiffusionSource,
    fields: fields as FieldSnapshot,
    particles: {
      x: particleFloats[0],
      y: particleFloats[1],
      vx: particleFloats[2],
      vy: particleFloats[3],
      type,
    },
  };
}

function validateSnapshotLengths(
  snapshot: LifeWorldSnapshot,
  fieldLength: number,
  particleCount: number,
): void {
  if (
    !Number.isSafeInteger(snapshot.tick) ||
    snapshot.tick < 0 ||
    fieldLength < 4 ||
    particleCount < 1
  ) {
    throw new RangeError('Dünya snapshotı geçersiz.');
  }
  const fieldsValid = FIELD_NAMES.every((name) => snapshot.fields[name].length === fieldLength);
  const particlesValid =
    particleFloatArrays(snapshot.particles).every((array) => array.length === particleCount) &&
    snapshot.particles.type.length === particleCount;
  if (!fieldsValid || !particlesValid) throw new RangeError('Dünya snapshotı dizileri ayrışıyor.');
}

function particleFloatArrays(snapshot: ParticleSnapshot): readonly Float32Array[] {
  return [snapshot.x, snapshot.y, snapshot.vx, snapshot.vy];
}

function writeFloatArray(view: DataView, offset: number, values: Float32Array): number {
  for (const value of values) {
    view.setFloat32(offset, value, true);
    offset += Float32Array.BYTES_PER_ELEMENT;
  }
  return offset;
}

function readFloatArray(view: DataView, offset: number, length: number): [Float32Array, number] {
  const values = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    values[index] = view.getFloat32(offset, true);
    offset += Float32Array.BYTES_PER_ELEMENT;
  }
  return [values, offset];
}

async function transform(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const output = readStream(stream.readable);
  const writer = stream.writable.getWriter();
  await writer.write(bytes.slice());
  await writer.close();
  return output;
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    chunks.push(result.value);
    length += result.value.length;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isEnvelope(value: unknown): value is LifeWorldSaveEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const envelope = value as Partial<LifeWorldSaveEnvelope>;
  return (
    envelope.schemaVersion === 1 &&
    typeof envelope.configFingerprint === 'string' &&
    (envelope.encoding === 'gzip-base64' || envelope.encoding === 'base64') &&
    typeof envelope.payload === 'string'
  );
}
