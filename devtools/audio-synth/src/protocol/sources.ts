import { AudioParamError } from '../guard/errors';
import { checkArray, checkObject } from '../guard/read';
import { numberOf } from '../program/params';
import { selectZone } from '../program/sampleBank';
import { resolveProgram } from '../program/schema';
import { canonicalJson } from './canonical';
import type { JobKind } from './kinds';
import { loadSampleLibrary } from './samples';

/**
 * Manifest'in kaynak provenance'ı: programın kullandığı her kayıt (kütüphane
 * kimliği, içerik özeti, kökeni) ve her sampler katmanında HANGİ bölgenin
 * NEDEN seçildiği. Program manifest'e gömülü olduğu için seçim yeniden
 * hesaplanabilir; burada okunabilir ve doğrulanabilir hâliyle durur. Sample
 * kullanmayan programın manifest'inde alan yoktur (eski manifest'ler aynı).
 */
export interface ManifestSampleV1 {
  readonly name: string;
  readonly id: string;
  readonly hash: string;
  readonly origin: 'synthetic-fixture' | 'recorded';
  readonly sampleRate: number;
  readonly channels: number;
  readonly frames: number;
}

export interface ManifestSelectionV1 {
  readonly layer: string;
  readonly bank: string;
  readonly zone: number;
  readonly sample: string;
  readonly reason: string;
}

export interface ManifestSourcesV1 {
  readonly samples: readonly ManifestSampleV1[];
  readonly selections: readonly ManifestSelectionV1[];
}

export function sourcesOf(
  kind: JobKind,
  programDocument: unknown,
  repoRoot: string,
): ManifestSourcesV1 | null {
  if (kind !== 'acoustic') return null;
  const program = resolveProgram(programDocument);
  if (program.samples.size === 0) return null;
  const library = loadSampleLibrary(repoRoot);
  const samples = [...program.samples.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, decl]) => ({
      name,
      id: decl.id,
      hash: decl.hash,
      origin: library.get(decl.id)?.origin.kind ?? 'recorded',
      sampleRate: decl.sampleRate,
      channels: decl.channels,
      frames: decl.frames,
    }));
  const selections: ManifestSelectionV1[] = [];
  for (const layer of program.layers) {
    if (layer.source.entry.id !== 'source.sampler') continue;
    const params = layer.source.params as Readonly<Record<string, number | string>>;
    const bank = String(params.bank);
    const pick = selectZone(
      program.banks.get(bank) ?? [],
      numberOf(params, 'note'),
      numberOf(params, 'velocity'),
      numberOf(params, 'event'),
    );
    if (!pick) continue;
    selections.push({
      layer: layer.name,
      bank,
      zone: pick.zone.index,
      sample: pick.zone.sample,
      reason: pick.reason,
    });
  }
  return { samples, selections };
}

export function validateSources(value: unknown): ManifestSourcesV1 {
  const o = checkObject(value, 'sources', ['samples', 'selections']);
  checkArray(o.samples, 'sources.samples').forEach((s, i) =>
    checkObject(s, `sources.samples[${i}]`, [
      'name',
      'id',
      'hash',
      'origin',
      'sampleRate',
      'channels',
      'frames',
    ]),
  );
  checkArray(o.selections, 'sources.selections').forEach((s, i) =>
    checkObject(s, `sources.selections[${i}]`, ['layer', 'bank', 'zone', 'sample', 'reason']),
  );
  if ((o.samples as unknown[]).length === 0) {
    throw new AudioParamError('sources.samples', 'range', 'kaynak bloğu en az bir kayıt taşır', 0);
  }
  return value as ManifestSourcesV1;
}

/** Kayıtlı kaynak bloğu güncel programdan ve kütüphaneden yeniden türetilene eşit mi. */
export function sameSources(
  recorded: ManifestSourcesV1 | undefined,
  current: ManifestSourcesV1 | null,
): boolean {
  return canonicalJson(recorded ?? null) === canonicalJson(current);
}
