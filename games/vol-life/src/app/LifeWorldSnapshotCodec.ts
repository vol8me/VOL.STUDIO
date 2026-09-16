import { FIELD_NAMES, type FieldSnapshot } from '@/runtime/sim/FieldSet';
import type { LifeWorldSnapshot } from '@/runtime/sim/LifeWorld';
import { validateMatterReservoirSnapshot } from '@/runtime/sim/MatterReservoir';
import {
  MAX_STABLE_ID,
  validateParticleSnapshot,
  type ParticleSnapshot,
} from '@/runtime/sim/ParticleStore';
import { RANDOM_STREAM_IDS, validateRandomStreamStates } from '@/runtime/sim/RandomStreams';
import { validateWorldMetadata } from '@/runtime/sim/WorldMetadata';

const BINARY_MAGIC = 0x564c4946;
/** v4: tek RNG durumu yerine adlandırılmış akış tablosu ve kanonik pasif slot doğrulaması. */
const BINARY_VERSION = 4;
const ENVELOPE_VERSION = 4;
const HEADER_BYTES = 64;
const MAX_WORLD_ID_BYTES = 256;
const HABITAT_DIGEST_BYTES = 16;
const FIELD_ARRAY_COUNT = FIELD_NAMES.length + 1;
const PARTICLE_FLOAT_ARRAY_COUNT = 4;
const STREAM_COUNT = RANDOM_STREAM_IDS.length;
const MAX_BINARY_BYTES = 64 * 1024 * 1024;
const MAX_STREAM_BYTES = MAX_BINARY_BYTES + 1024 * 1024;
const MAX_PAYLOAD_CHARS = Math.ceil((MAX_STREAM_BYTES * 4) / 3) + 4;
const CRC32_TABLE = buildCrc32Table();

export interface LifeWorldSaveEnvelope {
  readonly schemaVersion: typeof ENVELOPE_VERSION;
  readonly configFingerprint: string;
  readonly encoding: 'gzip-base64' | 'base64';
  readonly byteLength: number;
  readonly checksum: `crc32-${string}`;
  readonly payload: string;
}

/**
 * `none`: kayıt yok. `incompatible`: eski şema veya başka fizik/habitat
 * sözleşmesi — sessizce oynatılmaz (DESIGN.md §7). `snapshot`: doğrulanmış kayıt.
 * Bozuk gövde (uzunluk/checksum) istisna fırlatır; çağıran onu ayrı raporlar.
 */
export type LifeWorldDecodeResult =
  | { readonly kind: 'none' }
  | { readonly kind: 'incompatible'; readonly reason: 'schema' | 'fingerprint' }
  | { readonly kind: 'snapshot'; readonly snapshot: LifeWorldSnapshot };

export async function encodeLifeWorldSnapshot(
  snapshot: LifeWorldSnapshot,
  configFingerprint: string,
): Promise<LifeWorldSaveEnvelope> {
  const binary = encodeBinary(snapshot);
  const canCompress = typeof CompressionStream !== 'undefined';
  const payload = canCompress
    ? await transform(binary, new CompressionStream('gzip'), MAX_STREAM_BYTES)
    : binary;
  return {
    schemaVersion: ENVELOPE_VERSION,
    configFingerprint,
    encoding: canCompress ? 'gzip-base64' : 'base64',
    byteLength: binary.byteLength,
    checksum: formatChecksum(binary),
    payload: bytesToBase64(payload),
  };
}

export async function decodeLifeWorldSnapshot(
  value: unknown,
  expectedFingerprint: string,
): Promise<LifeWorldDecodeResult> {
  if (value === null || value === undefined) return { kind: 'none' };
  if (isLegacyEnvelope(value)) return { kind: 'incompatible', reason: 'schema' };
  if (!isEnvelope(value)) throw new RangeError('Dünya kaydı zarfı tanınmıyor.');
  if (value.configFingerprint !== expectedFingerprint) {
    return { kind: 'incompatible', reason: 'fingerprint' };
  }
  let bytes = base64ToBytes(value.payload);
  if (value.encoding === 'gzip-base64') {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Sıkıştırılmış kayıt bu ortamda açılamıyor.');
    }
    bytes = await transform(bytes, new DecompressionStream('gzip'), value.byteLength);
  }
  if (bytes.byteLength !== value.byteLength) {
    throw new RangeError('Dünya kaydı uzunluğu uyuşmuyor.');
  }
  if (formatChecksum(bytes) !== value.checksum) {
    throw new RangeError('Dünya kaydı checksum doğrulamasını geçemedi.');
  }
  return { kind: 'snapshot', snapshot: decodeBinary(bytes) };
}

function encodeBinary(snapshot: LifeWorldSnapshot): Uint8Array {
  const fieldLength = snapshot.nutrientDiffusionSource.length;
  const capacity = snapshot.particles.x.length;
  const worldId = new TextEncoder().encode(snapshot.metadata.id);
  const digest = new TextEncoder().encode(snapshot.habitatDigest);
  validateSnapshotShape(snapshot, fieldLength, capacity, worldId.byteLength, digest.byteLength);
  const byteLength = expectedByteLength(worldId.byteLength, fieldLength, capacity);
  if (byteLength > MAX_BINARY_BYTES) throw new RangeError('Dünya snapshotı boyut sınırını aşıyor.');
  const bytes = new Uint8Array(byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, BINARY_MAGIC, true);
  view.setUint16(4, BINARY_VERSION, true);
  view.setUint16(6, STREAM_COUNT, true);
  view.setFloat64(8, snapshot.tick, true);
  view.setUint32(16, snapshot.nextFieldBand, true);
  view.setUint32(20, fieldLength, true);
  view.setUint32(24, capacity, true);
  view.setUint32(28, snapshot.metadata.seed, true);
  view.setFloat64(32, snapshot.metadata.createdAtMs, true);
  view.setUint16(40, worldId.byteLength, true);
  view.setUint16(42, digest.byteLength, true);
  // Sayaç değil VERİLMİŞ ID sayısı yazılır: tükenmiş alanda `nextStableId` 2^32'dir ve uint32'ye sığmaz.
  view.setUint32(44, snapshot.particles.nextStableId - 1, true);
  view.setUint32(48, snapshot.reservoir.external, true);
  view.setUint32(52, snapshot.reservoir.voidLossTotal, true);
  view.setUint32(56, 0, true);
  view.setUint32(60, 0, true);
  let offset = HEADER_BYTES;
  bytes.set(worldId, offset);
  offset += worldId.byteLength;
  bytes.set(digest, offset);
  offset += digest.byteLength;
  for (let index = 0; index < STREAM_COUNT; index++) {
    view.setInt32(offset, snapshot.randomStreamStates[index], true);
    offset += Int32Array.BYTES_PER_ELEMENT;
  }
  offset = writeFloatArray(view, offset, snapshot.nutrientDiffusionSource);
  for (const name of FIELD_NAMES) offset = writeFloatArray(view, offset, snapshot.fields[name]);
  for (const array of particleFloatArrays(snapshot.particles)) {
    offset = writeFloatArray(view, offset, array);
  }
  bytes.set(snapshot.particles.type, offset);
  offset += capacity;
  bytes.set(snapshot.particles.active, offset);
  offset += capacity;
  for (let slot = 0; slot < capacity; slot++) {
    view.setUint32(offset, snapshot.particles.stableId[slot], true);
    offset += Uint32Array.BYTES_PER_ELEMENT;
  }
  return bytes;
}

function decodeBinary(bytes: Uint8Array): LifeWorldSnapshot {
  if (bytes.byteLength < HEADER_BYTES) throw new RangeError('Dünya kaydı başlığı eksik.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== BINARY_MAGIC || view.getUint16(4, true) !== BINARY_VERSION) {
    throw new RangeError('Dünya kaydı biçimi tanınmıyor.');
  }
  if (view.getUint16(6, true) !== STREAM_COUNT) {
    throw new RangeError('Dünya kaydı farklı sayıda rastgelelik akışı taşıyor.');
  }
  const tick = view.getFloat64(8, true);
  const nextFieldBand = view.getUint32(16, true);
  const fieldLength = view.getUint32(20, true);
  const capacity = view.getUint32(24, true);
  const seed = view.getUint32(28, true);
  const createdAtMs = view.getFloat64(32, true);
  const worldIdLength = view.getUint16(40, true);
  const digestLength = view.getUint16(42, true);
  const nextStableId = view.getUint32(44, true) + 1;
  const reservoir = { external: view.getUint32(48, true), voidLossTotal: view.getUint32(52, true) };
  if (!Number.isSafeInteger(tick) || tick < 0 || fieldLength < 4 || capacity < 1) {
    throw new RangeError('Dünya kaydı boyutları geçersiz.');
  }
  if (
    worldIdLength < 1 ||
    worldIdLength > MAX_WORLD_ID_BYTES ||
    digestLength !== HABITAT_DIGEST_BYTES ||
    !Number.isSafeInteger(createdAtMs) ||
    createdAtMs < 0
  ) {
    throw new RangeError('Dünya kaydı metadata bilgisi geçersiz.');
  }
  if (bytes.byteLength !== expectedByteLength(worldIdLength, fieldLength, capacity)) {
    throw new RangeError('Dünya kaydı uzunluğu uyuşmuyor.');
  }
  let offset = HEADER_BYTES;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const id = decoder.decode(bytes.subarray(offset, offset + worldIdLength));
  offset += worldIdLength;
  const habitatDigest = decoder.decode(bytes.subarray(offset, offset + digestLength));
  offset += digestLength;
  const randomStreamStates = new Int32Array(STREAM_COUNT);
  for (let index = 0; index < STREAM_COUNT; index++) {
    randomStreamStates[index] = view.getInt32(offset, true);
    offset += Int32Array.BYTES_PER_ELEMENT;
  }
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
    [array, offset] = readFloatArray(view, offset, capacity);
    particleFloats.push(array);
  }
  const type = bytes.slice(offset, offset + capacity);
  offset += capacity;
  const active = bytes.slice(offset, offset + capacity);
  offset += capacity;
  const stableId = new Uint32Array(capacity);
  for (let slot = 0; slot < capacity; slot++) {
    stableId[slot] = view.getUint32(offset, true);
    offset += Uint32Array.BYTES_PER_ELEMENT;
  }
  const snapshot: LifeWorldSnapshot = {
    metadata: { id, seed, createdAtMs },
    tick,
    randomStreamStates,
    nextFieldBand,
    habitatDigest,
    nutrientDiffusionSource,
    fields: fields as FieldSnapshot,
    particles: {
      x: particleFloats[0],
      y: particleFloats[1],
      vx: particleFloats[2],
      vy: particleFloats[3],
      type,
      active,
      stableId,
      nextStableId,
    },
    reservoir,
  };
  validateSnapshotShape(snapshot, fieldLength, capacity, worldIdLength, digestLength);
  return snapshot;
}

function expectedByteLength(worldIdBytes: number, fieldLength: number, capacity: number): number {
  return (
    HEADER_BYTES +
    worldIdBytes +
    HABITAT_DIGEST_BYTES +
    STREAM_COUNT * Int32Array.BYTES_PER_ELEMENT +
    fieldLength * Float32Array.BYTES_PER_ELEMENT * FIELD_ARRAY_COUNT +
    capacity * Float32Array.BYTES_PER_ELEMENT * PARTICLE_FLOAT_ARRAY_COUNT +
    capacity * 2 +
    capacity * Uint32Array.BYTES_PER_ELEMENT
  );
}

function validateSnapshotShape(
  snapshot: LifeWorldSnapshot,
  fieldLength: number,
  capacity: number,
  worldIdBytes: number,
  digestBytes: number,
): void {
  if (
    !Number.isSafeInteger(snapshot.tick) ||
    snapshot.tick < 0 ||
    fieldLength < 4 ||
    capacity < 1 ||
    worldIdBytes < 1 ||
    worldIdBytes > MAX_WORLD_ID_BYTES ||
    digestBytes !== HABITAT_DIGEST_BYTES ||
    !/^[0-9a-f]{16}$/.test(snapshot.habitatDigest)
  ) {
    throw new RangeError('Dünya snapshotı geçersiz.');
  }
  validateWorldMetadata(snapshot.metadata);
  validateMatterReservoirSnapshot(snapshot.reservoir);
  validateParticleSnapshot(snapshot.particles, capacity);
  validateRandomStreamStates(snapshot.randomStreamStates);
  const fieldsValid =
    snapshot.nutrientDiffusionSource.length === fieldLength &&
    FIELD_NAMES.every((name) => snapshot.fields[name].length === fieldLength);
  if (!fieldsValid) throw new RangeError('Dünya snapshotı dizileri ayrışıyor.');
  const numbersValid =
    Number.isInteger(snapshot.nextFieldBand) &&
    snapshot.nextFieldBand >= 0 &&
    snapshot.nextFieldBand <= 0xffffffff &&
    snapshot.particles.nextStableId <= MAX_STABLE_ID + 1 &&
    isFiniteFloatArray(snapshot.nutrientDiffusionSource) &&
    FIELD_NAMES.every((name) => isFiniteFloatArray(snapshot.fields[name]));
  if (!numbersValid) {
    throw new RangeError('Dünya snapshotı sonlu olmayan veya geçersiz değer taşıyor.');
  }
}

function isFiniteFloatArray(values: Float32Array): boolean {
  return values.every(Number.isFinite);
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
  maxOutputBytes: number,
): Promise<Uint8Array> {
  const output = readStream(stream.readable, maxOutputBytes);
  const writer = stream.writable.getWriter();
  await writer.write(bytes.slice());
  await writer.close();
  return output;
}

async function readStream(
  stream: ReadableStream<Uint8Array>,
  maxOutputBytes: number,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    chunks.push(result.value);
    length += result.value.length;
    if (length > maxOutputBytes) {
      await reader.cancel();
      throw new RangeError('Dünya kaydı bildirilen boyutu aşıyor.');
    }
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

function isLegacyEnvelope(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  return typeof version === 'number' && version < ENVELOPE_VERSION;
}

function isEnvelope(value: unknown): value is LifeWorldSaveEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const envelope = value as Partial<LifeWorldSaveEnvelope>;
  return (
    envelope.schemaVersion === ENVELOPE_VERSION &&
    typeof envelope.configFingerprint === 'string' &&
    (envelope.encoding === 'gzip-base64' || envelope.encoding === 'base64') &&
    Number.isSafeInteger(envelope.byteLength) &&
    (envelope.byteLength ?? -1) >= 0 &&
    (envelope.byteLength ?? 0) <= MAX_BINARY_BYTES &&
    typeof envelope.checksum === 'string' &&
    /^crc32-[0-9a-f]{8}$/.test(envelope.checksum) &&
    typeof envelope.payload === 'string' &&
    envelope.payload.length <= MAX_PAYLOAD_CHARS
  );
}

function formatChecksum(bytes: Uint8Array): `crc32-${string}` {
  let checksum = 0xffffffff;
  for (const byte of bytes) {
    checksum = CRC32_TABLE[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  }
  return `crc32-${((checksum ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0')}`;
}

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index++) {
    let checksum = index;
    for (let bit = 0; bit < 8; bit++) {
      checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
    }
    table[index] = checksum;
  }
  return table;
}
