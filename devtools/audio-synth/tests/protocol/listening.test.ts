/**
 * F7b/R7 — tek-komut dinleme paketi. Kilitlenen sözleşme:
 *
 *  - Paket `export/listening/` altına düşer (git dışı), `listening.json` +
 *    `index.html` + WAV'lar; production ağacına dokunmaz.
 *  - Canary'ler kanonik `runCanary` render'ından gelir (guide + review
 *    durumu gerçek kayıtlarla aynı).
 *  - Referanslar gönderilen OGG'nin çözümüdür; karar durumu
 *    `regression/decisions.json`'daki PCM-hash bağlı beyanla sınırlıdır,
 *    yoksa `undecided`.
 *  - Benchmark öğeleri kaynak + gönderim varyantı ve (loop taşıyorsa)
 *    iki-turluk dikiş dinlemesi sunar; karar komutu öğede görünür.
 *  - Karşılaştırma öğeleri (v1/v2) dinleme amaçlıdır, karar komutu taşımaz.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildListeningPackage, LISTENING_ROOT, LISTENING_SCHEMA } from '../../src/protocol';
import { createTestRepo, type TestRepo } from './repo';
import { readFileSync } from 'node:fs';

let repo: TestRepo | undefined;
afterEach(() => {
  repo?.cleanup();
  repo = undefined;
});

const LISTENING_DIR = () => join(repo!.root, LISTENING_ROOT);
const COUNTS = { canary: 0, benchmark: 0, reference: 0, comparison: 0, pending: 0 };

function writeCanary(id: string): void {
  const dir = join(repo!.root, 'devtools/audio-synth/canaries');
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
                version: 1,
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
  const dir = join(repo!.root, 'devtools/audio-synth/benchmarks');
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

describe('dinleme paketi', () => {
  it('boş depoda yalnız sabit v1/v2 karşılaştırma çiftleri üretilir', () => {
    repo = createTestRepo();
    const pkg = buildListeningPackage(repo.root);
    expect(pkg.schema).toBe(LISTENING_SCHEMA);
    expect(pkg.counts).toEqual({ ...COUNTS, comparison: 4 });
    expect(pkg.items.every((i) => i.kind === 'comparison')).toBe(true);
    expect(pkg.items.every((i) => i.decision === null)).toBe(true);
    expect(pkg.items.every((i) => i.status === 'listen-only')).toBe(true);
    // Çiftler aynı grup altında v1/v2 rolüyle yan yana durur.
    const groups = new Map<string, string[]>();
    for (const item of pkg.items) {
      const roles = groups.get(item.group ?? '') ?? [];
      roles.push(item.role ?? '');
      groups.set(item.group ?? '', roles);
    }
    expect([...groups.values()].sort()).toEqual([
      ['v1', 'v2'],
      ['v1', 'v2'],
    ]);
    expect(existsSync(join(LISTENING_DIR(), 'listening.json'))).toBe(true);
    expect(existsSync(join(LISTENING_DIR(), 'index.html'))).toBe(true);
  });

  it('canary pakete kanonik render + rehber + pending-human ile girer', () => {
    repo = createTestRepo();
    writeCanary('tink');
    const pkg = buildListeningPackage(repo.root);
    expect(pkg.counts).toEqual({ ...COUNTS, canary: 1, comparison: 4, pending: 1 });
    const item = pkg.items[0];
    expect(item.kind).toBe('canary');
    expect(item.status).toBe('pending-human');
    expect(item.guide).toEqual(['Tekrar etmeyen bir ton beklenir.']);
    expect(item.pcmHash).toMatch(/^sha256:/);
    expect(item.decision).toContain('canary review tink');
    const wav = join(repo.root, item.file);
    expect(item.file.startsWith(`${LISTENING_ROOT}/canary/`)).toBe(true);
    expect(readFileSync(wav).subarray(0, 4).toString('ascii')).toBe('RIFF');
    // Karar yazılmamışsa sayfa yine de üretilir ve kimliği taşır.
    const html = readFileSync(join(LISTENING_DIR(), 'index.html'), 'utf8');
    expect(html).toContain('tink');
    expect(html).toContain('canary review');
  });

  it('benchmark parçası kaynak+teslim varyantını karar komutuyla sunar', () => {
    repo = createTestRepo();
    writeBenchmark('bench-x');
    const pkg = buildListeningPackage(repo.root);
    const items = pkg.items.filter((i) => i.kind === 'benchmark');
    expect(items.map((i) => i.role)).toEqual(['source', 'delivery']);
    for (const item of items) {
      expect(item.group).toBe('task:bench-x');
      expect(item.status).toBe('pending-human');
      expect(item.decision).toContain('benchmark review bench-x');
      expect(item.pcmHash).toMatch(/^sha256:/);
    }
    expect(pkg.counts.benchmark).toBe(2);
    expect(pkg.counts.comparison).toBe(4);
    expect(pkg.counts.pending).toBe(2);
  }, 30000);

  it('yeniden koşu aynı envanteri üretir (deterministik paket)', () => {
    repo = createTestRepo();
    writeCanary('tink');
    const first = buildListeningPackage(repo.root);
    const second = buildListeningPackage(repo.root);
    expect(second).toEqual(first);
    expect(readdirSync(LISTENING_DIR()).sort()).toEqual([
      'canary',
      'comparison',
      'index.html',
      'listening.json',
    ]);
  });
});
