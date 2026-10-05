import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildListeningPackage,
  LISTENING_ROOT,
  LISTENING_SCHEMA,
  MANIFESTS_ROOT,
} from '../../src/protocol';
import { createTestRepo, type TestRepo } from './repo';
import { readFileSync } from 'node:fs';
import { CORPUS_TIMEOUT } from '../support/timeouts';

/** Gerçek depo kökü: manifest/asset fikstürleri buradan kopyalanır. */
const REPO = fileURLToPath(new URL('../../../..', import.meta.url));

let repo: TestRepo | undefined;
afterEach(() => {
  repo?.cleanup();
  repo = undefined;
});

const LISTENING_DIR = () => join(repo!.root, LISTENING_ROOT);
const COUNTS = { canary: 0, benchmark: 0, reference: 0 };

function writeCanary(id: string): void {
  const dir = join(repo!.root, 'devtools/audio-synth/corpus/canaries');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.json`),
    JSON.stringify({
      schema: 'OrganicCanaryV1',
      id,
      version: 1,
      title: 'Test canary',
      purpose: 'Dinleme paketi testi.',
      source: {
        kind: 'program',
        program: {
          schema: 'AcousticProgramV1',
          sampleRate: 48000,
          channels: 1,
          durationSeconds: 0.2,
          seed: 3,
          layers: [
            {
              name: 'tone',
              source: {
                primitive: 'source.oscillator',
                version: 2,
                params: { waveform: 'sine', frequency: 440 },
              },
              articulation: {
                primitive: 'articulation.envelope',
                version: 1,
                params: { attack: 0.005, decay: 0.1, sustainLevel: 0, release: 0.05 },
              },
            },
          ],
          master: { normalize: 'peak', peakDbfs: -6 },
        },
      },
      expectations: [{ kind: 'clipping' }],
      listeningGuide: ['Tekrar etmeyen bir ton beklenir.'],
    }),
  );
}

function writeBenchmark(id: string): void {
  const dir = join(repo!.root, 'devtools/audio-synth/corpus/benchmarks');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.json`),
    JSON.stringify({
      schema: 'BenchmarkTaskV1',
      id,
      version: 1,
      title: 'Test benchmark',
      purpose: 'Dinleme paketi testi.',
      category: 'sfx',
      listeningGuide: ['Kısa bir ton beklenir.'],
      parts: [
        {
          id: 'main',
          source: {
            kind: 'program',
            program: {
              schema: 'AcousticProgramV1',
              sampleRate: 48000,
              channels: 1,
              durationSeconds: 0.2,
              seed: 5,
              layers: [
                {
                  name: 'tone',
                  source: {
                    primitive: 'source.oscillator',
                    version: 2,
                    params: { waveform: 'sine', frequency: 440 },
                  },
                  articulation: {
                    primitive: 'articulation.envelope',
                    version: 1,
                    params: { attack: 0.005, decay: 0.1, sustainLevel: 0, release: 0.05 },
                  },
                },
              ],
              master: { normalize: 'peak', peakDbfs: -6 },
            },
          },
          expectations: [
            { kind: 'asset-policy', assetClass: 'ui' },
            { kind: 'clipping' },
            { kind: 'clicks', max: 0 },
          ],
        },
      ],
    }),
  );
}

/** `codec-loop-seam` taşıyan parça → iki-tur dikiş varyantı üretir (twice). */
function writeLoopBenchmark(id: string): void {
  const dir = join(repo!.root, 'devtools/audio-synth/corpus/benchmarks');
  mkdirSync(dir, { recursive: true });
  const doc = JSON.stringify({
    schema: 'BenchmarkTaskV1',
    id,
    version: 1,
    title: 'Dikiş testi',
    purpose: 'Loop dikişi dinleme öğesi üretir.',
    category: 'sfx',
    listeningGuide: ['Dikiş duyulmamalı.'],
    parts: [
      {
        id: 'loop',
        source: {
          kind: 'program',
          program: {
            schema: 'AcousticProgramV1',
            sampleRate: 48000,
            channels: 1,
            durationSeconds: 0.3,
            seed: 5,
            layers: [
              {
                name: 'tone',
                source: {
                  primitive: 'source.oscillator',
                  version: 2,
                  params: { waveform: 'sine', frequency: 220 },
                },
              },
            ],
            master: { normalize: 'peak', peakDbfs: -6 },
          },
        },
        expectations: [
          { kind: 'asset-policy', assetClass: 'sfx' },
          { kind: 'clipping' },
          { kind: 'clicks', max: 0 },
          { kind: 'codec-loop-seam' },
        ],
      },
    ],
  });
  writeFileSync(join(dir, `${id}.json`), doc);
}

/**
 * Gerçek arcade-theme benchmark'ı: müzik kaynağı + stinger segmenti +
 * codec-loop-seam. checkMusic yolunu, overlay ve iki-tur varyantını kapsar.
 */
function copyMusicBenchmark(): void {
  const src = join(REPO, 'devtools/audio-synth/corpus/benchmarks/arcade-theme.json');
  const dstDir = join(repo!.root, 'devtools/audio-synth/corpus/benchmarks');
  mkdirSync(dstDir, { recursive: true });
  copyFileSync(src, join(dstDir, 'arcade-theme.json'));
}

/**
 * Manifest + asset kopyası: regresyon korpusu girdisi üretir; manifest'in
 * `integration.loop` bayrağı `loop2x` referans öğesini kapsar.
 */
function writeReference(id: string): void {
  const srcManifest = join(REPO, MANIFESTS_ROOT, `${id}.json`);
  const manifest = JSON.parse(readFileSync(srcManifest, 'utf8')) as {
    asset: { path: string };
  };
  const dstManifest = join(repo!.root, MANIFESTS_ROOT, `${id}.json`);
  mkdirSync(dirname(dstManifest), { recursive: true });
  copyFileSync(srcManifest, dstManifest);
  const assetDst = join(repo!.root, manifest.asset.path);
  mkdirSync(dirname(assetDst), { recursive: true });
  copyFileSync(join(REPO, manifest.asset.path), assetDst);
}

describe('dinleme paketi', () => {
  it('boş depoda paket boştur; envanter ve sayfa yine yazılır', () => {
    repo = createTestRepo();
    const pkg = buildListeningPackage(repo.root);
    expect(pkg.schema).toBe(LISTENING_SCHEMA);
    expect(pkg.counts).toEqual(COUNTS);
    expect(pkg.items).toEqual([]);
    expect(existsSync(join(LISTENING_DIR(), 'listening.json'))).toBe(true);
    expect(existsSync(join(LISTENING_DIR(), 'index.html'))).toBe(true);
  });

  it('canary pakete kanonik render + rehber + kabul alanı olmadan girer', () => {
    repo = createTestRepo();
    writeCanary('tink');
    const pkg = buildListeningPackage(repo.root);
    expect(pkg.counts).toEqual({ ...COUNTS, canary: 1 });
    const item = pkg.items[0];
    expect(item.kind).toBe('canary');
    expect(item).not.toHaveProperty('status');
    expect(item.guide).toEqual(['Tekrar etmeyen bir ton beklenir.']);
    expect(item.pcmHash).toMatch(/^sha256:/);
    expect(item).not.toHaveProperty('decision');
    const wav = join(repo.root, item.file);
    expect(item.file.startsWith(`${LISTENING_ROOT}/canary/`)).toBe(true);
    expect(readFileSync(wav).subarray(0, 4).toString('ascii')).toBe('RIFF');
    // Karar yazılmamışsa sayfa yine de üretilir ve kimliği taşır.
    const html = readFileSync(join(LISTENING_DIR(), 'index.html'), 'utf8');
    expect(html).toContain('tink');
    expect(html).not.toContain('canary review');
  });

  it('benchmark parçası kaynak+teslim varyantını kabul alanı olmadan sunar', () => {
    repo = createTestRepo();
    writeBenchmark('bench-x');
    const pkg = buildListeningPackage(repo.root);
    const items = pkg.items.filter((i) => i.kind === 'benchmark');
    expect(items.map((i) => i.role)).toEqual(['source', 'delivery']);
    for (const item of items) {
      expect(item.group).toBe('task:bench-x');
      expect(item).not.toHaveProperty('status');
      expect(item).not.toHaveProperty('decision');
      expect(item.pcmHash).toMatch(/^sha256:/);
    }
    expect(pkg.counts.benchmark).toBe(2);
    expect(pkg.counts).not.toHaveProperty('pending');
  }, 30000);

  it('codec-loop-seam taşıyan parça iki-tur dikiş varyantı üretir', () => {
    repo = createTestRepo();
    writeLoopBenchmark('bench-loop');
    const pkg = buildListeningPackage(repo.root);
    const items = pkg.items.filter((i) => i.kind === 'benchmark');
    expect(items.map((i) => i.role)).toEqual(['source', 'delivery', 'loop2x']);
    const loop = items[2];
    expect(loop.id).toBe('bench-loop/loop/loop2x');
    expect(loop.guide).toEqual(['İki ardışık tur — dikiş duyulmalı.']);
    // İki tur = tek turun iki katı uzunluk.
    const single = readFileSync(join(repo.root, items[1].file)).byteLength;
    const doubled = readFileSync(join(repo.root, loop.file)).byteLength;
    expect(doubled).toBeGreaterThan(single);
  }, 30000);

  it('müzik parçası mix + stinger overlay + loop2x öğeleri üretir', () => {
    repo = createTestRepo();
    copyMusicBenchmark();
    const pkg = buildListeningPackage(repo.root);
    const items = pkg.items.filter((i) => i.kind === 'benchmark');
    const roles = items.map((i) => i.role);
    expect(roles).toContain('source');
    expect(roles).toContain('delivery');
    expect(roles).toContain('loop2x');
    // arcade-theme'in 'jingle' stinger'ı döngü üzerine bindirilir.
    const overlay = items.find((i) => i.id === 'arcade-theme/main/overlay-jingle');
    expect(overlay?.role).toBe('overlay');
    expect(overlay?.guide[0]).toContain('jingle');
    expect(overlay?.assetClass).toBe('music');
  }, 180_000);

  it(
    'referans korpusu kaynak+gönderim öğeleri üretir; loop manifesti iki-tur ekler',
    () => {
      repo = createTestRepo();
      writeReference('sfx/reference-impact'); // loop:false
      writeReference('ambience/reference-ambience'); // loop:true
      const pkg = buildListeningPackage(repo.root);
      const refs = pkg.items.filter((i) => i.kind === 'reference');
      const impact = refs.filter((i) => i.group === 'ref:sfx/reference-impact');
      const ambience = refs.filter((i) => i.group === 'ref:ambience/reference-ambience');
      expect(impact.map((i) => i.role)).toEqual(['source', 'delivery']);
      expect(ambience.map((i) => i.role)).toEqual(['source', 'delivery', 'loop2x']);
      for (const item of refs) {
        expect(item).not.toHaveProperty('status');
        expect(item).not.toHaveProperty('decision');
        expect(item.manifest).toContain(MANIFESTS_ROOT);
        // Türetilmiş loop2x öğesinde pcmHash null kalır.
        if (item.role === 'loop2x') expect(item.pcmHash).toBeNull();
        else expect(item.pcmHash).toMatch(/^sha256:/);
      }
      // Gönderim öğesi yayımlanmış OGG'nin kodek çözümüdür.
      const delivery = ambience.find((i) => i.role === 'delivery');
      expect(delivery?.guide).toEqual(['Yayımlanmış assetin kodek çözümü.']);
    },
    CORPUS_TIMEOUT,
  );

  it('yeniden koşu aynı envanteri üretir (deterministik paket)', () => {
    repo = createTestRepo();
    writeCanary('tink');
    const first = buildListeningPackage(repo.root);
    const second = buildListeningPackage(repo.root);
    expect(second).toEqual(first);
    expect(readdirSync(LISTENING_DIR()).sort()).toEqual(['canary', 'index.html', 'listening.json']);
  });
});
