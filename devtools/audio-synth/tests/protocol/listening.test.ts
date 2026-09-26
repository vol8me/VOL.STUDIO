/**
 * F7b — tek-komut dinleme paketi. Kilitlenen sözleşme:
 *
 *  - Paket `export/listening/` altına düşer (git dışı), `listening.json` +
 *    `index.html` + WAV'lar; production ağacına dokunmaz.
 *  - Canary'ler kanonik `runCanary` render'ından gelir (guide + review
 *    durumu gerçek kayıtlarla aynı).
 *  - Referanslar gönderilen OGG'nin çözümüdür; karar durumu
 *    `regression/decisions.json`'daki PCM-hash bağlı beyanla sınırlıdır,
 *    yoksa `undecided`.
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

describe('dinleme paketi', () => {
  it('boş depoda geçerli boş paket: json + html yazılır, WAV yok', () => {
    repo = createTestRepo();
    const pkg = buildListeningPackage(repo.root);
    expect(pkg.schema).toBe(LISTENING_SCHEMA);
    expect(pkg.items).toEqual([]);
    expect(pkg.counts).toEqual({ canary: 0, reference: 0, pending: 0 });
    expect(existsSync(join(LISTENING_DIR(), 'listening.json'))).toBe(true);
    expect(existsSync(join(LISTENING_DIR(), 'index.html'))).toBe(true);
  });

  it('canary pakete kanonik render + rehber + pending-human ile girer', () => {
    repo = createTestRepo();
    writeCanary('tink');
    const pkg = buildListeningPackage(repo.root);
    expect(pkg.counts).toEqual({ canary: 1, reference: 0, pending: 1 });
    const item = pkg.items[0];
    expect(item.kind).toBe('canary');
    expect(item.status).toBe('pending-human');
    expect(item.guide).toEqual(['Tekrar etmeyen bir ton beklenir.']);
    expect(item.pcmHash).toMatch(/^sha256:/);
    const wav = join(repo.root, item.file);
    expect(item.file.startsWith(`${LISTENING_ROOT}/canary/`)).toBe(true);
    expect(readFileSync(wav).subarray(0, 4).toString('ascii')).toBe('RIFF');
    // Karar yazılmamışsa sayfa yine de üretilir ve kimliği taşır.
    const html = readFileSync(join(LISTENING_DIR(), 'index.html'), 'utf8');
    expect(html).toContain('tink');
  });

  it('yeniden koşu aynı envanteri üretir (deterministik paket)', () => {
    repo = createTestRepo();
    writeCanary('tink');
    const first = buildListeningPackage(repo.root);
    const second = buildListeningPackage(repo.root);
    expect(second).toEqual(first);
    expect(readdirSync(LISTENING_DIR()).sort()).toEqual(['canary', 'index.html', 'listening.json']);
  });
});
