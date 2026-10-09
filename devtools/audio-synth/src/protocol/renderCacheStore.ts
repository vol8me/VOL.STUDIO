import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { threadId } from 'node:worker_threads';
import {
  channelBytes,
  emptyStats,
  MemoryRenderCache,
  type RenderCache,
} from '../engine/renderCache';
import type { Sha256 } from '../kernel/canonical';
import { coreClosure } from './sourceClosure';

/**
 * Render önbelleğinin disk katmanı. Girdiler `node_modules` altında durur
 * (yok sayılır, commit edilmez) ve kaynak kodun parmak izine göre ayrı bir
 * dizine yazılır: motor ya da CORE kodu değişince eski girdiler HİÇ
 * okunmaz. Aynı sürümde DSP'si değişmiş bir düğüm bayat PCM döndüremez.
 */
export const RENDER_CACHE_ROOT = 'node_modules/.cache/audio-synth/render';
export const RENDER_CACHE_ENV = 'AUDIO_SYNTH_RENDER_CACHE';

const MAGIC = 0x31435256; // "VRC1"
const HEADER_BYTES = 16;
const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

const DEFAULT_DISK_CACHE = { maxBytes: 2 * GIB, maxEntryBytes: 256 * MIB } as const;
const DEFAULT_MEMORY_CACHE = { maxBytes: 512 * MIB, maxEntryBytes: 128 * MIB } as const;

const SYNTH_SRC = fileURLToPath(new URL('..', import.meta.url));
const CORE_DIR = fileURLToPath(new URL('../../../../core', import.meta.url));

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|mts|mjs|json)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

let fingerprint: string | null = null;

/**
 * Render'ı etkileyebilecek her şeyin özeti: audio-synth kaynak ağacı,
 * onun yüklediği CORE dosyaları (`coreClosure`), Node/V8 sürümü ve mimari
 * (`Math` sonuçları motor sürümüne bağlıdır).
 */
export function codeFingerprint(): string {
  if (fingerprint) return fingerprint;
  const hash = createHash('sha256');
  hash.update(`${process.version}\0${process.arch}\0`);
  const files: [string, string][] = [
    ...sourceFiles(SYNTH_SRC).map((file): [string, string] => [SYNTH_SRC, file]),
    ...coreClosure(SYNTH_SRC, CORE_DIR).map((file): [string, string] => [CORE_DIR, file]),
  ];
  for (const [root, file] of files) {
    hash.update(relative(root, file));
    hash.update('\0');
    hash.update(readFileSync(file));
  }
  fingerprint = hash.digest('hex').slice(0, 16);
  return fingerprint;
}

/** Başka parmak izli dizin ve yarım `.tmp-` dosyası bu süre dokunulmamışsa bayattır. */
const STALE_DIR_MS = 10 * 60 * 1000;

function safeEntries(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function olderThan(path: string, ms: number): boolean {
  try {
    return Date.now() - statSync(path).mtimeMs > ms;
  } catch {
    return false;
  }
}

let tempCounter = 0;

function writeQuick(target: string, data: Uint8Array): void {
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}-${threadId}-${++tempCounter}`;
  const fd = openSync(temp, 'w');
  try {
    writeSync(fd, data);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, target);
}

function encode(channels: readonly Float32Array[]): Uint8Array {
  const frames = channels[0]?.length ?? 0;
  const out = new Uint8Array(HEADER_BYTES + channels.length * frames * 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, channels.length, true);
  view.setUint32(8, frames, true);
  channels.forEach((channel, ch) => {
    const bytes = new Uint8Array(channel.buffer, channel.byteOffset, channel.byteLength);
    out.set(bytes, HEADER_BYTES + ch * frames * 4);
  });
  return out;
}

function decode(bytes: Buffer): Float32Array[] | undefined {
  if (bytes.length < HEADER_BYTES) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) return undefined;
  const count = view.getUint32(4, true);
  const frames = view.getUint32(8, true);
  if (count === 0 || frames === 0) return undefined;
  if (bytes.length !== HEADER_BYTES + count * frames * 4) return undefined;
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < count; ch++) {
    const channel = new Float32Array(frames);
    const start = bytes.byteOffset + HEADER_BYTES + ch * frames * 4;
    new Uint8Array(channel.buffer).set(new Uint8Array(bytes.buffer, start, frames * 4));
    if (!channel.every(Number.isFinite)) return undefined;
    channels.push(channel);
  }
  return channels;
}

export interface DiskCacheOptions {
  readonly maxBytes: number;
  readonly maxEntryBytes: number;
}

/** İçerik adresli disk önbelleği; bozuk ya da yarım girdi ıska sayılıp silinir. */
export class DiskRenderCache implements RenderCache {
  readonly stats = emptyStats();
  readonly dir: string;
  private bytes: number | null = null;

  constructor(
    root: string,
    private readonly options: DiskCacheOptions = DEFAULT_DISK_CACHE,
  ) {
    this.dir = join(root, codeFingerprint());
    // Başka parmak izli dizin ancak bir süredir dokunulmamışsa silinir: aynı anda
    // farklı kodla koşan ikinci süreç (vitest + CLI) kendi dizinini kaybetmez.
    for (const stale of safeEntries(root)) {
      if (stale === codeFingerprint()) continue;
      const path = join(root, stale);
      if (olderThan(path, STALE_DIR_MS)) rmSync(path, { recursive: true, force: true });
    }
  }

  private fileOf(key: Sha256): string {
    const hex = key.slice('sha256:'.length);
    return join(this.dir, hex.slice(0, 2), `${hex}.f32`);
  }

  /** Başka bir süreç girdiyi okuma sırasında silebilir; o durum da ıskadır. */
  read(key: Sha256): Float32Array[] | undefined {
    const file = this.fileOf(key);
    let bytes: Buffer;
    try {
      bytes = readFileSync(file);
    } catch {
      this.stats.misses++;
      return undefined;
    }
    const channels = decode(bytes);
    if (!channels) {
      rmSync(file, { force: true });
      this.stats.misses++;
      return undefined;
    }
    try {
      const now = new Date();
      utimesSync(file, now, now);
    } catch {
      // Silinmiş girdinin zaman damgası güncellenemez; okunan veri geçerlidir.
    }
    this.stats.hits++;
    return channels;
  }

  /** En-iyi-çaba: disk hatası (dolu disk, yarışan silme) render'ı düşürmez, sayılır. */
  write(key: Sha256, channels: readonly Float32Array[]): void {
    const size = channelBytes(channels);
    if (size > this.options.maxEntryBytes) {
      this.stats.skipped++;
      return;
    }
    const file = this.fileOf(key);
    if (existsSync(file)) return;
    try {
      this.bytes ??= this.scan();
      writeQuick(file, encode(channels));
      this.stats.writes++;
      this.bytes += size + HEADER_BYTES;
      if (this.bytes > this.options.maxBytes) this.evict();
    } catch {
      this.stats.failures++;
    }
  }

  /** Girdiler; yarım kalmış eski `.tmp-` dosyaları bu tarama sırasında silinir. */
  private entries(): { file: string; size: number; mtime: number }[] {
    if (!existsSync(this.dir)) return [];
    const found: { file: string; size: number; mtime: number }[] = [];
    for (const entry of readdirSync(this.dir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const file = join(entry.parentPath, entry.name);
      let stat;
      try {
        stat = statSync(file);
      } catch {
        continue;
      }
      if (entry.name.includes('.tmp-')) {
        if (Date.now() - stat.mtimeMs > STALE_DIR_MS) rmSync(file, { force: true });
        continue;
      }
      if (entry.name.endsWith('.f32')) found.push({ file, size: stat.size, mtime: stat.mtimeMs });
    }
    return found;
  }

  private scan(): number {
    return this.entries().reduce((sum, entry) => sum + entry.size, 0);
  }

  /** En eski kullanılan girdileri siler; bütçenin %80'ine iner. */
  private evict(): void {
    const entries = this.entries().sort((a, b) => a.mtime - b.mtime);
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    for (const entry of entries) {
      if (total <= this.options.maxBytes * 0.8) break;
      rmSync(entry.file, { force: true });
      total -= entry.size;
      this.stats.evictions++;
    }
    this.bytes = total;
  }
}

/** Bellek önünde disk: diskten gelen girdi belleğe de alınır. */
export class LayeredRenderCache implements RenderCache {
  readonly stats = emptyStats();

  constructor(
    readonly memory: MemoryRenderCache,
    readonly disk: DiskRenderCache,
  ) {}

  read(key: Sha256): Float32Array[] | undefined {
    const near = this.memory.read(key);
    if (near) {
      this.stats.hits++;
      return near;
    }
    const far = this.disk.read(key);
    if (far) {
      this.memory.write(key, far);
      this.stats.hits++;
      return far;
    }
    this.stats.misses++;
    return undefined;
  }

  write(key: Sha256, channels: readonly Float32Array[]): void {
    this.memory.write(key, channels);
    this.disk.write(key, channels);
    this.stats.writes++;
  }
}

const caches = new Map<string, RenderCache>();
let processMemory: MemoryRenderCache | null = null;

/**
 * Deponun render önbelleği: süreç geneli bellek katmanı önünde depoya ait
 * disk katmanı. Anahtarlar içerik adresli olduğundan bellek katmanı depolar
 * arasında paylaşılır. `AUDIO_SYNTH_RENDER_CACHE=off` önbelleği kapatır; PCM
 * önbellekli ve önbelleksiz render'da aynıdır.
 */
export function repoRenderCache(repoRoot: string): RenderCache | null {
  if (process.env[RENDER_CACHE_ENV] === 'off') return null;
  let cache = caches.get(repoRoot);
  if (!cache) {
    processMemory ??= new MemoryRenderCache(DEFAULT_MEMORY_CACHE);
    cache = new LayeredRenderCache(
      processMemory,
      new DiskRenderCache(join(repoRoot, RENDER_CACHE_ROOT)),
    );
    caches.set(repoRoot, cache);
  }
  return cache;
}
