/**
 * R8a — tohumlu sınır fuzz'ı. Doğrulayıcılar ve çözücüler her bozuk girdiye
 * ADLI hata vermelidir (`AudioParamError` ya da `ProtocolError`); asla
 * `TypeError`/`RangeError`/isimsiz `Error` görülmemeli. Mutasyon bazen geçerli
 * bir belge üretebilir — o zaman iddia "çökmedi"dir; fırlatıldığında tip
 * sözleşmesi kilitlenir. Tohum sabittir: kampanya deterministiktir.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRandom } from '@volstudio/core/random';
import { AudioParamError } from '../../src/guard/errors';
import { ProtocolError } from '../../src/protocol/errors';
import { CanonicalJsonError } from '../../src/kernel/canonical';
import { resolveProgram } from '../../src/program/schema';
import { resolveSynthParams } from '../../src/guard/synth';
import { validateBenchmarkTask } from '../../src/protocol/benchmark';
import { validateCanary } from '../../src/protocol/canary';
import { validateManifest } from '../../src/protocol/manifest';
import { validateSources } from '../../src/protocol/sources';

const REPO = join(__dirname, '../../../..');
/** Adlı sözleşme hataları — `TypeError`/`RangeError`/isimsiz `Error` asla geçemez. */
const NAMED = [AudioParamError, ProtocolError, CanonicalJsonError];

/** Basit derin kopya (belge ağaçları JSON'dur). */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Tohumlu mutasyon torbası: alan silme, tip bozma, aşırı değer, bilinmeyen anahtar. */
function mutate(value: unknown, rand: () => number, depth = 0): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => mutate(v, rand, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const roll = rand();
    if (roll < 0.08) continue; // alan silme
    if (roll < 0.3) {
      // Tip bozma / aşırı değer
      const junk = [
        null,
        'x',
        0,
        -1,
        1e12,
        NaN,
        Number.POSITIVE_INFINITY,
        [],
        {},
        'ş',
        { a: { b: { c: { d: 'deep' } } } },
        'x'.repeat(4096),
      ];
      out[key] = junk[Math.floor(rand() * junk.length)];
      continue;
    }
    out[key] = mutate(child, rand, depth + 1);
  }
  if (rand() < 0.15) out[`injected${Math.floor(rand() * 100)}`] = { nested: [1, 'x', null] };
  return out;
}

/** `fn` çökmemeli; hata fırlatırsa adlandırılmış sözleşme tipinde olmalı. */
function expectNamed(fn: () => unknown): { threw: boolean } {
  try {
    fn();
    return { threw: false };
  } catch (error) {
    const named = NAMED.some((t) => error instanceof t);
    expect(
      named,
      `adlandırılmamış hata: ${error instanceof Error ? error.name : String(error)} — ` +
        `${error instanceof Error ? error.message?.slice(0, 160) : ''}`,
    ).toBe(true);
    return { threw: true };
  }
}

const BASE_PROGRAM = {
  schema: 'AcousticProgramV1',
  sampleRate: 48000,
  channels: 1,
  durationSeconds: 0.5,
  seed: 7,
  layers: [
    {
      name: 'tone',
      source: {
        primitive: 'source.oscillator',
        version: 2,
        params: { waveform: 'sawtooth', frequency: 440 },
      },
      articulation: {
        primitive: 'articulation.envelope',
        version: 1,
        params: { attack: 0.005, decay: 0.1, sustainLevel: 0, release: 0.05 },
      },
    },
  ],
  master: { normalize: 'peak', peakDbfs: -6 },
};

const BASE_CANARY = {
  schema: 'OrganicCanaryV1',
  id: 'tink',
  version: 1,
  title: 'Taban canary',
  purpose: 'Fuzz tabanı.',
  source: { kind: 'program', program: BASE_PROGRAM },
  expectations: [{ kind: 'clipping' }],
  listeningGuide: ['Bir ton beklenir.'],
};

const BASE_BENCHMARK = {
  schema: 'BenchmarkTaskV1',
  id: 'bench',
  version: 1,
  title: 'Taban benchmark',
  purpose: 'Fuzz tabanı.',
  category: 'sfx',
  listeningGuide: ['Bir ton beklenir.'],
  parts: [
    {
      id: 'main',
      source: { kind: 'program', program: BASE_PROGRAM },
      expectations: [
        { kind: 'asset-policy', assetClass: 'ui' },
        { kind: 'clipping' },
        { kind: 'clicks', max: 0 },
      ],
    },
  ],
};

describe('tohumlu fuzz: doğrulayıcılar adlı hata sözleşmesi taşır', () => {
  it('kesin bozuk girdiler adlı hatayla reddedilir', () => {
    const junk = [null, undefined, 42, 'x', [], {}, { schema: 'YokV1' }];
    for (const bad of junk) {
      for (const [name, fn] of [
        ['resolveProgram', () => resolveProgram(bad)],
        ['validateCanary', () => validateCanary(bad)],
        ['validateBenchmarkTask', () => validateBenchmarkTask(bad)],
        ['validateManifest', () => validateManifest(bad)],
        ['validateSources', () => validateSources(bad)],
        ['resolveSynthParams', () => resolveSynthParams(bad)],
      ] as const) {
        const { threw } = expectNamed(fn as () => unknown);
        expect(threw, `${name} bozuk girdiyi kabul etti`).toBe(true);
      }
    }
  });

  it('resolveProgram: 200 tohumlu mutasyon adlı hata verir ya da geçerli belge üretir', () => {
    const rng = createRandom(0x5eed);
    const rand = () => rng.next();
    let threw = 0;
    for (let i = 0; i < 200; i++) {
      threw += expectNamed(() => resolveProgram(mutate(clone(BASE_PROGRAM), rand))).threw ? 1 : 0;
    }
    expect(threw).toBeGreaterThan(150); // çoğu mutasyon gerçekten bozuk olmalı
  });

  it('validateCanary / validateBenchmarkTask: mutasyonlar adlı hata verir', () => {
    const rng = createRandom(0xc0ffee);
    const rand = () => rng.next();
    for (let i = 0; i < 120; i++) {
      expectNamed(() => validateCanary(mutate(clone(BASE_CANARY), rand)));
      expectNamed(() => validateBenchmarkTask(mutate(clone(BASE_BENCHMARK), rand)));
    }
  });

  it('validateManifest / validateSources: gerçek manifest tabanından mutasyon', () => {
    const base = JSON.parse(
      readFileSync(
        join(REPO, 'devtools/audio-synth/reference/production/manifests/sfx/reference-impact.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    const rng = createRandom(0xdecaf);
    const rand = () => rng.next();
    let threw = 0;
    for (let i = 0; i < 150; i++) {
      threw += expectNamed(() => validateManifest(mutate(clone(base), rand))).threw ? 1 : 0;
    }
    expect(threw).toBeGreaterThan(100);
    const rngS = createRandom(0x5eed5);
    const randSources = () => rngS.next();
    for (let i = 0; i < 120; i++) {
      expectNamed(() => validateSources(mutate(clone(base), randSources)));
    }
  });

  it('mutasyon karmaşa belgesi (salt JSON): düz girdiler adlı hatayla reddedilir', () => {
    const rng = createRandom(14);
    const rand = () => rng.next();
    for (let i = 0; i < 200; i++) {
      const noise = mutate(
        { a: 1, b: 'x', c: [1, { d: true }], e: null, deep: { x: { y: { z: 0 } } } },
        rand,
      );
      expectNamed(() => resolveProgram(noise));
      expectNamed(() => validateBenchmarkTask(noise));
    }
  });
});
