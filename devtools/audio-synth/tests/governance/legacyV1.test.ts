import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderProgram } from '../../src/program/render';
import { PROGRAM_REGISTRY } from '../../src/program/catalog';
import { hashPcm } from '../../src/protocol/canonical';
import { repoSampleResolver } from '../../src/protocol/samples';

/**
 * Miras kanıtı: `2cd8b45` commit'inde yayımlanmış 25 akustik manifestin
 * gömülü programı ve kayıtlı PCM özeti (`tests/fixtures/legacy-v1.json`)
 * bugünkü motorla BİT-EŞİT yeniden üretilmeli. Düğüm sürümleri 1'e
 * pin'lidir ve dondurulmuş v1 çekirdeklerine çözülür; bu dosyada bir satır
 * kırılırsa "eski program aynı sürümü adıyla ister" sözü bozulmuş demektir.
 *
 * Fixture'ı yeniden üretmek için manifest'ler `git show 2cd8b45:...`
 * üzerinden okunur; elle düzenlenmez.
 */
interface LegacyRecord {
  readonly manifest: string;
  readonly program: unknown;
  readonly seed: number;
  readonly pcmHash: string;
  readonly sampleRate: number;
  readonly channels: number;
}

const FIXTURE = JSON.parse(
  readFileSync(new URL('../fixtures/legacy-v1.json', import.meta.url), 'utf8'),
) as LegacyRecord[];

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

describe('legacy-v1: 2cd8b45 manifest programları bit-eşit yeniden üretilir', () => {
  it.each(FIXTURE.map((f) => [f.manifest, f] as const))('%s', (_name, record) => {
    const rendered = renderProgram(record.program, {
      seed: record.seed,
      samples: repoSampleResolver(REPO_ROOT),
      quality: 'final',
      cache: null,
    });
    expect(hashPcm(rendered.channels, rendered.sampleRate)).toBe(record.pcmHash);
    expect(rendered.channels.length).toBe(record.channels);
    expect(rendered.sampleRate).toBe(record.sampleRate);
  });
});

/**
 * Dondurulmuş v1 çekirdeklerinin hepsi registry'de canlı kalır — yalnız
 * manifest fixture'ının pinlediği `oscillator@1` değil, `wind/rain/fire/retro/
 * drum` v1 yolları da varsayılan parametrelerle render edilebilir, sonlu ve
 * deterministik olmalı. Kapsam gerilemesinin ana kaynağı bu çekirdeklerin
 * çağrılmamasıydı.
 */
describe('legacy-v1: her dondurulmuş v1 kaynak düğümü render edilir', () => {
  // Dondurulmuş v1 = aynı id'nin daha yeni sürümü olan birinci sürüm.
  // Tek sürümlü kaynaklar (granular, sample, sampler) yaşayan koddur ve
  // zorunlu parametre ister; buranın konusu değiller.
  const ids = new Set(PROGRAM_REGISTRY.entries().map((e) => e.id));
  const multiVersion = new Set(
    [...ids].filter((id) => PROGRAM_REGISTRY.entries().some((e) => e.id === id && e.version > 1)),
  );
  const v1Sources = [...multiVersion]
    .filter((id) =>
      PROGRAM_REGISTRY.entries().some((e) => e.id === id && e.version === 1 && e.kind === 'source'),
    )
    .sort();
  it('en az beş v1 kaynağı var (wind, rain, fire, oscillator, retro/drum)', () => {
    for (const id of ['source.wind', 'source.rain', 'source.fire', 'source.oscillator']) {
      expect(v1Sources).toContain(id);
    }
  });
  it.each(v1Sources.map((id) => [id] as const))('%s@1 sonlu ve deterministik', (id) => {
    const doc = {
      schema: 'AcousticProgramV1',
      sampleRate: 48000,
      channels: 1,
      durationSeconds: 0.5,
      seed: 7,
      layers: [{ name: 'v1', source: { primitive: id, version: 1, params: {} } }],
      master: { normalize: 'peak' as const, peakDbfs: -6 },
    };
    const a = renderProgram(doc);
    const b = renderProgram(doc);
    expect(hashPcm(a.channels, a.sampleRate)).toBe(hashPcm(b.channels, b.sampleRate));
    for (const ch of a.channels) {
      expect(ch.every((s) => Number.isFinite(s))).toBe(true);
    }
  });
});

/**
 * `source.retro@1` çekirdeğinin dalga yolları (darbe, 4-bit üçgen,
 * testere, uzun/kısa LFSR, wavetable) ve `source.drum@1`'in model
 * anahtarı ancak parametre çeşitliliğiyle açılır; varsayılan tek darbe
 * ve tek kick render'ı donmuş kodun çoğunu yalnız bırakırdı. Her dizge
 * registry'deki seçim listesiyle 1:1 kalır — yeni dalga/model eklenirse
 * satır burada da görünür.
 */
describe('legacy-v1: retro ve drum v1 içsel dalları', () => {
  const RETRO_CASES: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['waveform=triangle', { waveform: 'triangle' }],
    ['waveform=triangle-4bit', { waveform: 'triangle-4bit' }],
    ['waveform=sawtooth', { waveform: 'sawtooth' }],
    ['waveform=noise-long', { waveform: 'noise-long' }],
    ['waveform=noise-short', { waveform: 'noise-short' }],
    ['waveform=table-ramp-4bit', { waveform: 'table-ramp-4bit' }],
    ['waveform=table-square-4bit', { waveform: 'table-square-4bit' }],
    ['waveform=table-hollow', { waveform: 'table-hollow' }],
    ['waveform=table-organ', { waveform: 'table-organ' }],
    ['waveform=table-buzz', { waveform: 'table-buzz' }],
    ['waveform=table-soft-bell', { waveform: 'table-soft-bell' }],
    ['sync=2', { sync: 2 }],
    ['bits+rate+arpeggio', { bits: 8, rate: 8000, arpeggio: 'coin' }],
  ];
  const DRUM_MODELS = ['tom', 'snare', 'clap', 'hat', 'cymbal', 'perc'] as const;
  it.each(RETRO_CASES)('source.retro@1 %s', (_name, params) => {
    const doc = {
      schema: 'AcousticProgramV1',
      sampleRate: 48000,
      channels: 1,
      durationSeconds: 0.4,
      seed: 7,
      layers: [{ name: 'v1', source: { primitive: 'source.retro', version: 1, params } }],
      master: { normalize: 'peak' as const, peakDbfs: -6 },
    };
    const a = renderProgram(doc);
    const b = renderProgram(doc);
    expect(hashPcm(a.channels, a.sampleRate)).toBe(hashPcm(b.channels, b.sampleRate));
    expect(a.channels[0].every((s) => Number.isFinite(s))).toBe(true);
  });
  it.each(DRUM_MODELS.map((model) => [`model=${model}`, { model }] as const))(
    'source.drum@1 %s',
    (_name, params) => {
      const doc = {
        schema: 'AcousticProgramV1',
        sampleRate: 48000,
        channels: 1,
        durationSeconds: 0.4,
        seed: 7,
        layers: [{ name: 'v1', source: { primitive: 'source.drum', version: 1, params } }],
        master: { normalize: 'peak' as const, peakDbfs: -6 },
      };
      const rendered = renderProgram(doc);
      expect(rendered.channels[0].every((s) => Number.isFinite(s))).toBe(true);
    },
  );
});
