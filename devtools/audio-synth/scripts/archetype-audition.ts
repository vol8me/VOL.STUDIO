/**
 * Dinleme paketi: her archetype'ın ilk 8 varyasyonu ve üç vokal program
 * ailesi WAV olarak git-dışı `export/audition/` altına yazılır; yanında
 * ölçüm tablosu (`audition.json`) durur. Tablo YALNIZ ölçülen değerleri
 * taşır — "gerçekçi", "doğal" gibi öznel bir yargı içermez; o yargı insan
 * dinlemesinindir.
 *
 * Kullanım: tsx scripts/archetype-audition.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analyzeAudio } from '../src/analysis/report';
import { expandArchetype } from '../src/program/archetype';
import { ARCHETYPES } from '../src/program/primitives/archetypes';
import { renderProgram } from '../src/program/render';
import { hashCanonical, hashPcm } from '../src/protocol/canonical';
import { writeWav } from '../src/writer';
import { VOCAL_FAMILIES } from '../tests/fixtures/vocalFamilies';

const OUT = fileURLToPath(new URL('../export/audition/', import.meta.url));

interface Row {
  readonly file: string;
  readonly programHash: string;
  readonly pcmHash: string;
  readonly durationSeconds: number;
  readonly maxMomentaryLufs: number | null;
  readonly truePeakDbtp: number | null;
  readonly centroidHz: number | null;
  readonly flatness: number | null;
  readonly decay40Seconds: number | null;
}

function audition(file: string, program: unknown): Row {
  const out = renderProgram(program);
  mkdirSync(OUT, { recursive: true });
  writeWav(`${OUT}${file}`, out);
  const report = analyzeAudio(out.channels, out.sampleRate, 'source-pcm');
  return {
    file,
    programHash: hashCanonical(program),
    pcmHash: hashPcm(out.channels, out.sampleRate),
    durationSeconds: report.format.durationSeconds,
    maxMomentaryLufs: report.level.maxMomentaryLufs,
    truePeakDbtp: report.level.truePeakDbtp,
    centroidHz: report.spectral.centroidHz,
    flatness: report.spectral.flatness,
    decay40Seconds: report.temporal.decay40Seconds,
  };
}

const rows: Row[] = [];
for (const entry of ARCHETYPES) {
  for (let k = 0; k < entry.variation.guaranteed; k++) {
    const program = expandArchetype({
      schema: 'ArchetypeRequestV1',
      archetype: entry.id,
      version: entry.version,
      variation: k,
    });
    rows.push(audition(`${entry.id.slice('archetype.'.length)}-v${k}.wav`, program));
  }
}
for (const [name, program] of Object.entries(VOCAL_FAMILIES)) {
  rows.push(audition(`vocal-${name}.wav`, program));
}
writeFileSync(`${OUT}audition.json`, `${JSON.stringify(rows, null, 2)}\n`);
const fmt = (v: number | null, d = 1) => (v === null ? '—' : v.toFixed(d));
for (const row of rows) {
  console.log(
    `${row.file.padEnd(28)} ${fmt(row.durationSeconds, 2)} sn  M ${fmt(
      row.maxMomentaryLufs,
    )} LUFS  ` +
      `TP ${fmt(row.truePeakDbtp, 2)}  merkez ${fmt(row.centroidHz, 0)} Hz  ${row.pcmHash.slice(
        7,
        19,
      )}`,
  );
}
console.log(`\n${rows.length} dosya → export/audition/ (git-dışı); ölçüm tablosu audition.json.`);
