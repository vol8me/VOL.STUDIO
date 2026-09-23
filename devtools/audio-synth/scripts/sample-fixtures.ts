/**
 * Sample kütüphanesinin SENTETİK referans kayıtlarını (`audio-samples/*.json`)
 * üretir. Her kayıt üretici programı gömülü taşır; betik programı render
 * edip 16-bit WAV baytlarını özetler ve JSON'a yazar. WAV commit edilmez
 * (deterministik ara çıktı); özet her çözümde yeniden doğrulanır. Gerçek
 * kayıt DEĞİLDİRLER — `origin.kind: synthetic-fixture` bunu açıkça söyler.
 *
 * Kullanım: pnpm --filter @volstudio/audio-synth audio:samples
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderProgram } from '../src/program/render';
import {
  DEFAULT_SAMPLES_ROOT,
  prettyCanonicalJson,
  SAMPLE_ASSET_SCHEMA,
  sha256Bytes,
  validateSampleAsset,
} from '../src/protocol';
import { encodeWav } from '../src/writer';
import { findRepoRoot } from './lib/args';

const node = (primitive: string, params: Record<string, unknown> = {}) => ({
  primitive,
  version: 1,
  params,
});

function program(
  seconds: number,
  layers: unknown[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schema: 'AcousticProgramV1',
    sampleRate: 48000,
    channels: 1,
    durationSeconds: seconds,
    seed: 17,
    layers,
    master: { normalize: 'peak', peakDbfs: -1, fadeOutSeconds: 0.02 },
    ...extra,
  };
}

function tone(frequency: number, contactTime: number, inharmonicity: number, seed: number) {
  return program(
    1.2,
    [
      {
        name: 'note',
        source: node('exciter.impact', { contactTime, roughness: 0.15 }),
        resonators: [
          node('resonator.modal', {
            layout: 'string',
            frequency,
            modes: 16,
            decay: 1.4,
            damping: 1.2,
            brightness: contactTime < 0.001 ? 0.7 : 0.4,
            inharmonicity,
          }),
        ],
      },
    ],
    { seed },
  );
}

const FIXTURES: readonly { id: string; title: string; notes: string; program: unknown }[] = [
  {
    id: 'tone-c4-soft',
    title: 'Tonal nota C4 (yumuşak vuruş)',
    notes: 'Sampler velocity katmanı fixture’ı: uzun temas, koyu.',
    program: tone(261.63, 0.004, 0.0004, 17),
  },
  {
    id: 'tone-c4-hard',
    title: 'Tonal nota C4 (sert vuruş)',
    notes: 'Sampler velocity katmanı fixture’ı: kısa temas, parlak.',
    program: tone(261.63, 0.0006, 0.0004, 17),
  },
  {
    id: 'tone-c4-hard-rr',
    title: 'Tonal nota C4 (sert, round-robin varyantı)',
    notes: 'Aynı nota, farklı tohum ve esneklik: round-robin fixture’ı.',
    program: tone(261.63, 0.0007, 0.0006, 29),
  },
  {
    id: 'tone-g4-hard',
    title: 'Tonal nota G4 (sert vuruş)',
    notes: 'İkinci anahtar bölgesi fixture’ı (kök 67).',
    program: tone(392, 0.0006, 0.0004, 17),
  },
  {
    id: 'metal-hit',
    title: 'Metal–metal çarpma',
    notes: 'Hybrid transient fixture’ı (source.contact).',
    program: program(0.8, [
      { name: 'hit', source: node('source.contact', { velocity: 5, mass: 0.4, debris: 0 }) },
    ]),
  },
  {
    id: 'room-ir',
    title: 'Sentetik stereo oda IR’ı',
    notes: 'İlintisiz iki kanal üstel sönümlü süzülmüş gürültü; gerçek oda ölçümü DEĞİL.',
    program: program(
      1,
      ['left', 'right'].map((name, i) => ({
        name,
        pan: i === 0 ? -1 : 1,
        source: node('source.noise', { color: 'pink' }),
        resonators: [node('resonator.biquad', { mode: 'lowpass', frequency: 7000 })],
        articulation: node('articulation.envelope', {
          attack: 0.001,
          decay: 0.9,
          sustainLevel: 0,
          release: 0.05,
          curve: 'exponential',
        }),
      })),
      { channels: 2 },
    ),
  },
  {
    id: 'body-ir',
    title: 'Ahşap gövde tepkisi',
    notes: 'Materyal gövdesi IR’ı (exciter.impact → resonator.material wood).',
    program: program(0.5, [
      {
        name: 'body',
        source: node('exciter.impact', { contactTime: 0.0002, roughness: 0 }),
        resonators: [node('resonator.material', { material: 'wood', size: 0.4 })],
      },
    ]),
  },
  {
    id: 'texture-breath',
    title: 'Nefes dokusu',
    notes: 'Granular kaynak fixture’ı (source.airflow, basınç salınımı).',
    program: {
      ...program(1.5, [
        {
          name: 'air',
          source: node('source.airflow', {
            pressure: { gesture: 'breath' },
            aperture: 14,
            sibilance: 0.2,
            cavityMix: 0.4,
          }),
        },
      ]),
      gestures: {
        breath: {
          curve: 'curve.cosine',
          version: 1,
          points: [
            [0, 0.1],
            [0.6, 0.8],
            [1.5, 0.15],
          ],
        },
      },
    },
  },
];

const repoRoot = findRepoRoot(process.cwd());
for (const fixture of FIXTURES) {
  const rendered = renderProgram(fixture.program);
  const bytes = encodeWav(rendered);
  const asset = validateSampleAsset({
    schema: SAMPLE_ASSET_SCHEMA,
    id: fixture.id,
    title: fixture.title,
    format: 'wav-pcm16',
    hash: sha256Bytes(bytes),
    sampleRate: rendered.sampleRate,
    channels: rendered.channels.length,
    frames: rendered.channels[0].length,
    origin: { kind: 'synthetic-fixture', program: fixture.program },
    notes: fixture.notes,
  });
  writeFileSync(
    join(repoRoot, DEFAULT_SAMPLES_ROOT, `${asset.id}.json`),
    prettyCanonicalJson(asset),
  );
  console.log(
    `${asset.id}  ${asset.hash.slice(7, 19)}  ${(asset.frames / asset.sampleRate).toFixed(2)} sn`,
  );
}
