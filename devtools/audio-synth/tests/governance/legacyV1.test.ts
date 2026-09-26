import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderProgram } from '../../src/program/render';
import { hashPcm } from '../../src/protocol/canonical';
import { repoSampleResolver } from '../../src/protocol/samples';

/**
 * K2 miras kanıtı: `2cd8b45` commit'inde yayımlanmış 25 akustik manifestin
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
