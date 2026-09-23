import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { AudioParamError } from '../guard/errors';
import { checkChoice, checkNumber, checkObject, checkSampleRate } from '../guard/read';
import { renderProgram } from '../program/render';
import { resolveProgram } from '../program/schema';
import type { SampleData, SampleDeclV1, SampleResolver } from '../program/samples';
import { decodeWavChannels } from '../synthesis/sample';
import { encodeWav } from '../writer';
import { EXPORT_ROOT } from './audition';
import { sha256Bytes } from './canonical';
import { ProtocolError } from './errors';
import { checkRepoRelative, readJsonFile, resolveInside, writeFileAtomic } from './fs';
import { asProtocol } from './records';

/**
 * Sample kütüphanesi — kayıt verisinin içerik özetiyle adreslenen kaynağı.
 * `audio-samples/<id>.json` (`SampleAssetV1`) kaydın kimliğini, biçimini ve
 * KÖKENİNİ taşır:
 *
 * - `recorded`: gerçek kayıt; WAV dosyası kütüphanede commit edilir (kaynak
 *   hâli, yazarında), lisans ve kaynak beyanı zorunludur.
 * - `synthetic-fixture`: motorla üretilmiş fixture; WAV'ı deterministik olarak
 *   üretilebildiği için commit EDİLMEZ (asset'in ara hâli) — üretici program
 *   kayıtta gömülüdür, baytlar git-dışı `export/samples/` önbelleğine üretilir
 *   ve özet her çözümde doğrulanır. Motor değişip baytlar değişirse çözüm
 *   `identity` hatasıyla durur (sessiz sürüklenme yok).
 *
 * Özet WAV BAYTLARININ SHA-256'sıdır (`wav-pcm16`); program bildirimi aynı
 * özeti taşır, kütüphanedeki kayıtla uyuşmazsa program başka bir kayıt
 * sürümüne bağlıdır ve reddedilir.
 */
export const SAMPLE_ASSET_SCHEMA = 'SampleAssetV1';
export const DEFAULT_SAMPLES_ROOT = 'devtools/audio-synth/audio-samples';
export const SAMPLE_CACHE_ROOT = `${EXPORT_ROOT}/samples`;

export type SampleOriginV1 =
  | { readonly kind: 'synthetic-fixture'; readonly program: unknown }
  | {
      readonly kind: 'recorded';
      readonly file: string;
      readonly license: string;
      readonly source: string;
    };

export interface SampleAssetV1 {
  readonly schema: typeof SAMPLE_ASSET_SCHEMA;
  readonly id: string;
  readonly title: string;
  readonly format: 'wav-pcm16';
  readonly hash: string;
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly frames: number;
  readonly origin: SampleOriginV1;
  readonly notes?: string;
}

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;

function text(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new AudioParamError(path, 'type', `boş olmayan, en çok ${max} karakter`, value);
  }
  return value;
}

export function validateSampleAsset(value: unknown): SampleAssetV1 {
  const o = checkObject(value, '', [
    'schema',
    'id',
    'title',
    'format',
    'hash',
    'sampleRate',
    'channels',
    'frames',
    'origin',
    'notes',
  ]);
  if (o.schema !== SAMPLE_ASSET_SCHEMA) {
    throw new AudioParamError('schema', 'type', `"${SAMPLE_ASSET_SCHEMA}" olmalı`, o.schema);
  }
  if (typeof o.id !== 'string' || !ID.test(o.id))
    throw new AudioParamError('id', 'type', ID.source, o.id);
  if (typeof o.hash !== 'string' || !HASH.test(o.hash)) {
    throw new AudioParamError('hash', 'type', 'sha256:<64 hex>', o.hash);
  }
  if (o.channels !== 1 && o.channels !== 2)
    throw new AudioParamError('channels', 'type', '1 ya da 2', o.channels);
  const head = checkObject(o.origin, 'origin', ['kind', 'program', 'file', 'license', 'source']);
  const kind = checkChoice(head.kind, 'origin.kind', ['synthetic-fixture', 'recorded'] as const);
  let origin: SampleOriginV1;
  if (kind === 'synthetic-fixture') {
    checkObject(o.origin, 'origin', ['kind', 'program']);
    const program = resolveProgram(head.program);
    if (program.samples.size > 0) {
      throw new AudioParamError(
        'origin.program',
        'combination',
        'üretici program sample kullanamaz',
        head.program,
      );
    }
    origin = { kind, program: head.program };
  } else {
    checkObject(o.origin, 'origin', ['kind', 'file', 'license', 'source']);
    origin = {
      kind,
      file: checkRepoRelative(head.file, 'origin.file'),
      license: text(head.license, 'origin.license', 200),
      source: text(head.source, 'origin.source', 400),
    };
  }
  return {
    schema: SAMPLE_ASSET_SCHEMA,
    id: o.id,
    title: text(o.title, 'title', 120),
    format: checkChoice(o.format, 'format', ['wav-pcm16'] as const),
    hash: o.hash,
    sampleRate: checkSampleRate(o.sampleRate, 'sampleRate'),
    channels: o.channels,
    frames: checkNumber(o.frames, 'frames', { min: 1, integer: true }),
    origin,
    ...(o.notes === undefined ? {} : { notes: text(o.notes, 'notes', 1000) }),
  };
}

export function loadSampleLibrary(
  repoRoot: string,
  root = DEFAULT_SAMPLES_ROOT,
): Map<string, SampleAssetV1> {
  const dir = resolveInside(repoRoot, root, 'samples');
  const out = new Map<string, SampleAssetV1>();
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort()) {
    const asset = asProtocol(name, () => validateSampleAsset(readJsonFile(`${dir}/${name}`, name)));
    if (`${asset.id}.json` !== name)
      throw new ProtocolError('identity', `dosya adı ${asset.id}.json olmalı`, name);
    out.set(asset.id, asset);
  }
  return out;
}

/** Sentetik fixture'ın WAV baytları: üretici program render edilir, 16-bit WAV'a kodlanır. */
export function synthesizeFixture(asset: SampleAssetV1): Buffer {
  if (asset.origin.kind !== 'synthetic-fixture') {
    throw new ProtocolError('invalid', 'yalnız sentetik fixture üretilir', asset.id);
  }
  return encodeWav(renderProgram(asset.origin.program));
}

/** Kaydın baytlarını getirir ve özetini doğrular (kayıt: dosya; fixture: önbellek ya da üretim). */
export function sampleBytes(
  repoRoot: string,
  asset: SampleAssetV1,
  root = DEFAULT_SAMPLES_ROOT,
): Buffer {
  let bytes: Buffer;
  if (asset.origin.kind === 'recorded') {
    bytes = readFileSync(resolveInside(repoRoot, `${root}/${asset.origin.file}`, asset.id));
  } else {
    const cache = resolveInside(repoRoot, `${SAMPLE_CACHE_ROOT}/${asset.id}.wav`, asset.id);
    const cached = existsSync(cache) ? readFileSync(cache) : null;
    if (cached && sha256Bytes(cached) === asset.hash) return cached;
    bytes = synthesizeFixture(asset);
    if (sha256Bytes(bytes) === asset.hash) writeFileAtomic(cache, bytes);
  }
  const hash = sha256Bytes(bytes);
  if (hash !== asset.hash) {
    throw new ProtocolError(
      'identity',
      `sample baytları kayıtlı özete uymuyor (${hash})`,
      asset.id,
    );
  }
  return bytes;
}

export function decodeSample(bytes: Uint8Array, asset: SampleAssetV1): SampleData {
  const decoded = decodeWavChannels(bytes);
  const frames = decoded.channels[0]?.length ?? 0;
  if (
    decoded.sampleRate !== asset.sampleRate ||
    decoded.channels.length !== asset.channels ||
    frames !== asset.frames
  ) {
    throw new ProtocolError(
      'identity',
      'çözülen biçim kayıttaki oran/kanal/kare ile uyuşmuyor',
      asset.id,
    );
  }
  return decoded;
}

/** Programın bildirimine uyan kütüphane kaydının bildirimi (yazarlar için). */
export function sampleDeclOf(asset: SampleAssetV1): SampleDeclV1 {
  return {
    id: asset.id,
    hash: asset.hash,
    sampleRate: asset.sampleRate,
    channels: asset.channels,
    frames: asset.frames,
  };
}

/**
 * Render'a enjekte edilen repo çözücüsü: bildirimin kimliği kütüphanede
 * olmalı ve özeti kütüphanedeki kayıtla aynı olmalı; baytlar özetle
 * doğrulanıp çözülür. Aynı süreçte bir kez çözülen kayıt önbellekten döner.
 */
export function repoSampleResolver(repoRoot: string, root = DEFAULT_SAMPLES_ROOT): SampleResolver {
  let library: Map<string, SampleAssetV1> | null = null;
  const cache = new Map<string, SampleData>();
  return (decl) => {
    const hit = cache.get(decl.hash);
    if (hit) return hit;
    library ??= loadSampleLibrary(repoRoot, root);
    const asset = library.get(decl.id);
    if (!asset) throw new ProtocolError('not-found', `sample kütüphanede yok: ${decl.id}`, root);
    if (asset.hash !== decl.hash) {
      throw new ProtocolError(
        'identity',
        `program ${decl.hash}, kütüphane ${asset.hash} (başka sürüm)`,
        decl.id,
      );
    }
    const data = decodeSample(sampleBytes(repoRoot, asset, root), asset);
    cache.set(decl.hash, data);
    return data;
  };
}

export interface SampleVerificationV1 {
  readonly id: string;
  readonly origin: SampleOriginV1['kind'];
  readonly ok: boolean;
  readonly detail: string;
}

/** Kütüphanenin her kaydını özetinden doğrular (fixture'lar yeniden üretilerek). */
export function verifySampleLibrary(
  repoRoot: string,
  root = DEFAULT_SAMPLES_ROOT,
): SampleVerificationV1[] {
  return [...loadSampleLibrary(repoRoot, root).values()].map((asset) => {
    try {
      const bytes =
        asset.origin.kind === 'synthetic-fixture'
          ? synthesizeFixture(asset)
          : sampleBytes(repoRoot, asset, root);
      const hash = sha256Bytes(bytes);
      if (hash !== asset.hash)
        return { id: asset.id, origin: asset.origin.kind, ok: false, detail: `özet ${hash}` };
      decodeSample(bytes, asset);
      return { id: asset.id, origin: asset.origin.kind, ok: true, detail: 'özet ve biçim aynı' };
    } catch (error) {
      return {
        id: asset.id,
        origin: asset.origin.kind,
        ok: false,
        detail: (error as Error).message,
      };
    }
  });
}
