import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AudioParamError } from '../../src/guard/errors';
import { renderProgram } from '../../src/program/render';
import { sha256Bytes } from '../../src/protocol/canonical';
import { ProtocolError } from '../../src/protocol/errors';
import {
  DEFAULT_SAMPLES_ROOT,
  loadSampleLibrary,
  repoSampleResolver,
  SAMPLE_ASSET_SCHEMA,
  SAMPLE_CACHE_ROOT,
  sampleBytes,
  sampleDeclOf,
  synthesizeFixture,
  validateSampleAsset,
  verifySampleLibrary,
  type SampleAssetV1,
} from '../../src/protocol/samples';
import { sameSources, sourcesOf, validateSources } from '../../src/protocol/sources';
import { encodeWav } from '../../src/writer';
import { createTestRepo, type TestRepo } from './repo';

/**
 * Sample kütüphanesi protokolü: kimlik = WAV baytlarının özeti. Fixture
 * baytları gömülü programdan üretilip git-dışı önbelleğe yazılır; kayıt
 * baytları kütüphanedeki dosyadan okunur. Her iki yolda özet uyuşmazlığı
 * sessiz sürüklenme değil `identity` hatasıdır.
 */
function toneProgram(frequency: number): Record<string, unknown> {
  return {
    schema: 'AcousticProgramV1',
    sampleRate: 48000,
    channels: 1,
    durationSeconds: 0.12,
    seed: 3,
    layers: [
      {
        name: 'tone',
        source: { primitive: 'source.oscillator', version: 1, params: { frequency } },
      },
    ],
    master: { normalize: 'peak', peakDbfs: -3, fadeOutSeconds: 0.01 },
  };
}

function fixture(id: string, frequency = 440): SampleAssetV1 {
  const program = toneProgram(frequency);
  const bytes = encodeWav(renderProgram(program));
  return validateSampleAsset({
    schema: SAMPLE_ASSET_SCHEMA,
    id,
    title: `Fixture ${id}`,
    format: 'wav-pcm16',
    hash: sha256Bytes(bytes),
    sampleRate: 48000,
    channels: 1,
    frames: 5760,
    origin: { kind: 'synthetic-fixture', program },
  });
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof ProtocolError) return error.code;
    if (error instanceof AudioParamError) return `${error.path}:${error.issue}`;
    throw error;
  }
  throw new Error('hata beklenirdi');
}

let repo: TestRepo;
let dir: string;
const write = (asset: unknown, name = `${(asset as SampleAssetV1).id}.json`) =>
  writeFileSync(join(dir, name), JSON.stringify(asset));

beforeEach(() => {
  repo = createTestRepo();
  dir = join(repo.root, DEFAULT_SAMPLES_ROOT);
  mkdirSync(dir, { recursive: true });
});
afterEach(() => repo.cleanup());

describe('SampleAssetV1 doğrulaması', () => {
  it.each<[string, (a: Record<string, unknown>) => void, string]>([
    ['kimlik', (a) => (a.id = 'Bad Id'), 'id:type'],
    ['özet', (a) => (a.hash = 'md5:abc'), 'hash:type'],
    ['kanal', (a) => (a.channels = 3), 'channels:type'],
    ['biçim', (a) => (a.format = 'flac'), 'format:type'],
    ['boş başlık', (a) => (a.title = ' '), 'title:type'],
    [
      'üretici program sample kullanamaz',
      (a) => {
        const program = toneProgram(440);
        program.samples = { x: sampleDeclOf(fixture('x')) };
        program.layers = [
          {
            name: 's',
            source: { primitive: 'source.sample', version: 1, params: { sample: 'x' } },
          },
        ];
        a.origin = { kind: 'synthetic-fixture', program };
      },
      'origin.program:combination',
    ],
    [
      'kayıt lisans ister',
      (a) => (a.origin = { kind: 'recorded', file: 'a.wav', source: 'mikrofon' }),
      'origin.license:type',
    ],
  ])('%s reddedilir', (_label, edit, expected) => {
    const asset = JSON.parse(JSON.stringify(fixture('ok'))) as Record<string, unknown>;
    edit(asset);
    expect(code(() => validateSampleAsset(asset))).toBe(expected);
  });

  it('kayıt yolu depo-göreli olmalı', () => {
    const asset = {
      ...fixture('ok'),
      origin: { kind: 'recorded', file: '/abs.wav', license: 'CC0', source: 'x' },
    };
    expect(code(() => validateSampleAsset(asset))).toBe('path');
  });
});

describe('kütüphane ve çözücü', () => {
  it('klasör yoksa kütüphane boş; dosya adı kimlikle aynı olmak zorunda', () => {
    expect(loadSampleLibrary(repo.root, 'devtools/none').size).toBe(0);
    write(fixture('tone-a'), 'other.json');
    expect(code(() => loadSampleLibrary(repo.root))).toBe('identity');
  });

  it('bozuk kayıt protokol hatası olur', () => {
    write({ ...fixture('tone-a'), extra: 1 }, 'tone-a.json');
    expect(code(() => loadSampleLibrary(repo.root))).toBe('invalid');
  });

  it('fixture üretilir, önbelleğe yazılır; bozuk önbellek yeniden üretilir', () => {
    const asset = fixture('tone-a');
    write(asset);
    const data = repoSampleResolver(repo.root)(sampleDeclOf(asset));
    expect([data.sampleRate, data.channels.length, data.channels[0].length]).toEqual([
      48000, 1, 5760,
    ]);
    const cache = join(repo.root, SAMPLE_CACHE_ROOT, 'tone-a.wav');
    expect(sha256Bytes(readFileSync(cache))).toBe(asset.hash);
    writeFileSync(cache, Buffer.from('bozuk'));
    const again = repoSampleResolver(repo.root)(sampleDeclOf(asset));
    expect(again.channels[0]).toEqual(data.channels[0]);
    expect(sha256Bytes(readFileSync(cache))).toBe(asset.hash);
  });

  it('aynı süreçte ikinci çözüm önbellekten döner (aynı nesne)', () => {
    const asset = fixture('tone-a');
    write(asset);
    const resolve = repoSampleResolver(repo.root);
    expect(resolve(sampleDeclOf(asset))).toBe(resolve(sampleDeclOf(asset)));
  });

  it('kütüphanede olmayan kimlik ve başka sürüm özeti adlı hatayla durur', () => {
    const asset = fixture('tone-a');
    write(asset);
    const resolve = repoSampleResolver(repo.root);
    expect(code(() => resolve({ ...sampleDeclOf(asset), id: 'missing' }))).toBe('not-found');
    const other = sampleDeclOf(fixture('tone-a', 330));
    expect(code(() => resolve(other))).toBe('identity');
  });

  it('motor sürüklenirse (özet tutmaz) fixture çözülmez, verify düşer; önbellek yazılmaz', () => {
    const drifted = { ...fixture('tone-a'), hash: fixture('x', 330).hash };
    write(drifted);
    expect(code(() => sampleBytes(repo.root, drifted))).toBe('identity');
    expect(existsSync(join(repo.root, SAMPLE_CACHE_ROOT, 'tone-a.wav'))).toBe(false);
    const [report] = verifySampleLibrary(repo.root);
    expect([report.ok, report.detail]).toEqual([false, `özet ${fixture('y').hash}`]);
  });

  it('kaydedilen biçim çözülenle uyuşmazsa identity', () => {
    const asset = { ...fixture('tone-a'), frames: 100 };
    write(asset);
    expect(code(() => repoSampleResolver(repo.root)(sampleDeclOf(asset)))).toBe('identity');
    expect(verifySampleLibrary(repo.root)[0].ok).toBe(false);
  });

  it('recorded kayıt dosyadan okunur; dosya değişirse identity ve verify düşer', () => {
    const bytes = encodeWav(renderProgram(toneProgram(550)));
    writeFileSync(join(dir, 'rec.wav'), bytes);
    const asset = validateSampleAsset({
      ...fixture('rec'),
      hash: sha256Bytes(bytes),
      origin: { kind: 'recorded', file: 'rec.wav', license: 'CC0', source: 'test kaydı' },
    });
    write(asset);
    expect(code(() => synthesizeFixture(asset))).toBe('invalid');
    expect(verifySampleLibrary(repo.root)).toEqual([
      { id: 'rec', origin: 'recorded', ok: true, detail: 'özet ve biçim aynı' },
    ]);
    expect(repoSampleResolver(repo.root)(sampleDeclOf(asset)).channels[0].length).toBe(5760);
    bytes[bytes.length - 1] ^= 1;
    writeFileSync(join(dir, 'rec.wav'), bytes);
    expect(code(() => repoSampleResolver(repo.root)(sampleDeclOf(asset)))).toBe('identity');
    expect(verifySampleLibrary(repo.root)[0].ok).toBe(false);
  });
});

describe('manifest kaynak bloğu', () => {
  function sampledProgram(soft: SampleAssetV1, hard: SampleAssetV1): Record<string, unknown> {
    return {
      ...toneProgram(440),
      durationSeconds: 0.3,
      samples: { soft: sampleDeclOf(soft), hard: sampleDeclOf(hard) },
      banks: {
        keys: {
          schema: 'SampleBankV1',
          zones: [
            { sample: 'soft', rootKey: 69, keyLow: 60, keyHigh: 80, velocityHigh: 0.5 },
            { sample: 'hard', rootKey: 69, keyLow: 60, keyHigh: 80, velocityLow: 0.5 },
          ],
        },
      },
      layers: [
        {
          name: 'note',
          source: {
            primitive: 'source.sampler',
            version: 1,
            params: { bank: 'keys', note: 69, velocity: 0.8 },
          },
        },
      ],
    };
  }

  it('sample kullanmayan ya da müzik programında kaynak bloğu yoktur', () => {
    expect(sourcesOf('acoustic', toneProgram(440), repo.root)).toBeNull();
    expect(sourcesOf('music', toneProgram(440), repo.root)).toBeNull();
    expect(sameSources(undefined, null)).toBe(true);
  });

  it('kayıtlar ada göre sıralı, köken kütüphaneden; sampler seçimi gerekçeli', () => {
    const soft = fixture('soft-a', 440);
    const hard = fixture('hard-a', 445);
    write(soft);
    const sources = sourcesOf('acoustic', sampledProgram(soft, hard), repo.root);
    expect(sources?.samples.map((s) => [s.name, s.id, s.origin])).toEqual([
      ['hard', 'hard-a', 'recorded'],
      ['soft', 'soft-a', 'synthetic-fixture'],
    ]);
    expect(sources?.selections).toHaveLength(1);
    expect(sources?.selections[0]).toMatchObject({ layer: 'note', bank: 'keys', sample: 'hard' });
    expect(sources?.selections[0].reason.length).toBeGreaterThan(0);
    expect(validateSources(sources)).toBe(sources);
    expect(sameSources(sources ?? undefined, sources)).toBe(true);
    expect(sameSources(undefined, sources)).toBe(false);
  });

  it('kaynak bloğu en az bir kayıt ve bilinen alanlar taşır', () => {
    expect(code(() => validateSources({ samples: [], selections: [] }))).toBe(
      'sources.samples:range',
    );
    expect(
      code(() => validateSources({ samples: [{ name: 'a', extra: 1 }], selections: [] })),
    ).toBe('sources.samples[0].extra:unknown-key');
  });
});
