/**
 * Tüp dalga kılavuzu ile modal banka maliyet kıyası. Aynı temel frekansta
 * (110 Hz, 48 kHz, 5 sn gürültü uyarımı) tüp Nyquist'e kadar ~218 harmoniği
 * O(1)/örnek taşır; modal banka mod başına O(1)/örnek öder. Çıktı: sn ses
 * başına ms (üç koşunun en iyisi, kaynak maliyeti düşülmüş) ve registry
 * maliyet modelinin tahmini.
 *
 * Kullanım: tsx scripts/resonator-bench.ts
 */
import { PROGRAM_REGISTRY } from '../src/program/catalog';
import { estimateProgramCost, renderProgramLayers } from '../src/program/render';
import { resolveProgram } from '../src/program/schema';

const RATE = 48000;
const SECONDS = 5;
const F0 = 110;

function program(resonators: unknown[]) {
  return {
    schema: 'AcousticProgramV1',
    sampleRate: RATE,
    channels: 1,
    durationSeconds: SECONDS,
    seed: 1,
    layers: [{ name: 'probe', source: { primitive: 'source.noise', version: 1 }, resonators }],
    master: { normalize: 'none' },
  };
}

function best(value: unknown): number {
  let fastest = Infinity;
  for (let run = 0; run < 3; run++) {
    const t0 = performance.now();
    renderProgramLayers(value);
    fastest = Math.min(fastest, performance.now() - t0);
  }
  return fastest;
}

const tube = {
  primitive: 'resonator.tube',
  version: 1,
  params: { length: 343 / (2 * F0), ends: 'open-open', decay: 1 },
};
const modal = (modes: number) => ({
  primitive: 'resonator.modal',
  version: 1,
  params: { frequency: F0, modes, decay: 1, inharmonicity: 0 },
});

const baseline = best(program([]));
const cases: [string, unknown[]][] = [
  [`tüp (açık/açık, ~${Math.floor(RATE / 2 / F0)} harmonik)`, [tube]],
  ['modal 8 mod', [modal(8)]],
  ['modal 32 mod (registry tavanı)', [modal(32)]],
];
console.log(
  `Temel ${F0} Hz, ${RATE} Hz, ${SECONDS} sn; kaynak maliyeti ${(baseline / SECONDS).toFixed(
    1,
  )} ms/sn düşüldü.\n`,
);
const perMode: number[] = [];
for (const [label, resonators] of cases) {
  const value = program(resonators);
  const ms = Math.max(0, best(value) - baseline) / SECONDS;
  const units = estimateProgramCost(resolveProgram(value)).workUnits / (RATE * SECONDS);
  if (label.startsWith('modal 32')) perMode.push(ms / 32);
  console.log(
    `${label.padEnd(36)} ${ms.toFixed(2).padStart(7)} ms/sn   tahmin ${units.toFixed(
      1,
    )} birim/örnek`,
  );
}
const harmonics = Math.floor(RATE / 2 / F0);
console.log(
  `\nAynı ${harmonics} harmoniği modal banka ile taşımak (doğrusal ölçek): ` +
    `≈ ${(perMode[0] * harmonics).toFixed(
      1,
    )} ms/sn (registry tavanı 32 mod olduğu için tek düğümle mümkün değil).`,
);
console.log(
  `Registry: ${
    PROGRAM_REGISTRY.has('resonator.tube') ? 'resonator.tube' : '?'
  } maliyet modeli mod sayısından bağımsız.`,
);
