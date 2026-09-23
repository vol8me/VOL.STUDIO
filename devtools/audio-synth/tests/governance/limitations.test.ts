import { describe, expect, it } from 'vitest';
import { MUSIC_ASSET_SPEC_SCHEMA } from '@volstudio/core/audio/music';
import { instrumentIds, INSTRUMENT_PREFIX } from '../../src/music/instruments';
import { MUSIC_PROGRAM_SCHEMA } from '../../src/music/program';
import { PROGRAM_REGISTRY } from '../../src/program/catalog';
import {
  KNOWN_LIMITATIONS,
  limitationRisks,
  type KnownLimitation,
} from '../../src/program/limitations';
import { PROGRAM_PLAN_SCHEMA } from '../../src/program/planner';
import { ACOUSTIC_PROGRAM_SCHEMA, resolveProgram } from '../../src/program/schema';
import { STYLE_PROFILES, type StyleProfileV1 } from '../../src/program/styles';
import { ASSET_MANIFEST_SCHEMA } from '../../src/protocol/manifest';
import { MUSIC_BUNDLE_SCHEMA } from '../../src/protocol/music';
import { SAMPLE_ASSET_SCHEMA } from '../../src/protocol/samples';

/**
 * KNOWN_LIMITATIONS agent'a `context` ile açılır; yeniden adlandırılan bir
 * yapı taşı ya da silinen bir şema, `affects` token'ını sessizce bayatlatır.
 * Bu kapı her token'ı GERÇEK bir yüzeye bağlar ve kategorize edilemeyen
 * token'ı reddeder — sessiz geçiş yok.
 */
const SCHEMAS = new Set<string>([
  ACOUSTIC_PROGRAM_SCHEMA,
  MUSIC_PROGRAM_SCHEMA,
  MUSIC_ASSET_SPEC_SCHEMA,
  MUSIC_BUNDLE_SCHEMA,
  SAMPLE_ASSET_SCHEMA,
  PROGRAM_PLAN_SCHEMA,
  ASSET_MANIFEST_SCHEMA,
]);

/** Çalışma zamanı şema sabiti olmayan tip adları: yüzey gerçek, ad tsc'ye sabit. */
const TYPE_SURFACES: Readonly<Record<string, readonly unknown[]>> = {
  StyleProfileV1: STYLE_PROFILES satisfies readonly StyleProfileV1[],
};

const NAMESPACES: Readonly<Record<string, () => readonly string[]>> = {
  'archetype.*': () =>
    PROGRAM_REGISTRY.entries()
      .filter((entry) => entry.id.startsWith('archetype.'))
      .map((entry) => entry.id),
  'preset:*': () => instrumentIds(),
};

type TokenKind = 'node' | 'namespace' | 'schema' | 'type' | 'section' | null;

function resolveToken(token: string): TokenKind {
  if (token.includes('*')) return token in NAMESPACES ? 'namespace' : null;
  if (token in TYPE_SURFACES) return 'type';
  if (SCHEMAS.has(token)) return 'schema';
  if (token === 'master') return 'section';
  return PROGRAM_REGISTRY.has(token) ? 'node' : null;
}

const program = (waveform: string, frequency: number) =>
  resolveProgram({
    schema: ACOUSTIC_PROGRAM_SCHEMA,
    sampleRate: 48000,
    channels: 1,
    durationSeconds: 0.05,
    seed: 1,
    layers: [
      {
        name: 'probe',
        source: { primitive: 'source.oscillator', version: 1, params: { waveform, frequency } },
      },
    ],
  });

describe('bilinen sınırlamaların kimlikleri', () => {
  it('her `affects` tokenı gerçek bir yüzeye çözülür; tanınmayan token reddedilir', () => {
    const seen: string[] = [];
    for (const limitation of KNOWN_LIMITATIONS) {
      for (const token of limitation.affects) {
        const kind = resolveToken(token);
        expect(kind, `${limitation.id}: ${token}`).not.toBeNull();
        seen.push(token);
        if (kind === 'type') {
          expect(TYPE_SURFACES[token]?.length, token).toBeGreaterThan(0);
        }
        if (kind === 'namespace') {
          expect(NAMESPACES[token]?.().length, token).toBeGreaterThan(0);
        }
      }
    }
    expect(seen.length).toBeGreaterThan(0);
  });

  it('joker ad alanları kendi kimlik biçimini taşıyor', () => {
    expect(instrumentIds().every((id) => id.startsWith(INSTRUMENT_PREFIX))).toBe(true);
    expect(NAMESPACES['archetype.*']?.().length).toBeGreaterThan(0);
  });

  it('`master` çözümlenmiş programın gerçek bölümüdür', () => {
    const resolved = program('sine', 200);
    expect(resolved.master).toBeTypeOf('object');
    expect(resolved.master.peakDbfs).toBeDefined();
  });

  it('kimlikler tekil; limitationRisks yalnız kayıtlı sınırlamaya işaret eder', () => {
    const ids = KNOWN_LIMITATIONS.map((l: KnownLimitation) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    const risky = limitationRisks(program('sawtooth', 1500));
    expect(risky).toEqual(['polyblep-alias']);
    for (const risk of risky) expect(ids).toContain(risk);
    expect(limitationRisks(program('sine', 200))).toEqual([]);
  });
});
