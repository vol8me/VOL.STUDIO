/**
 * Kenarlı osilatör alias karakterizasyonu — `tests/synthesis/retro.test.ts` ve
 * `tests/synthesis/oscillatorAlias.test.ts` kilitlerinin ölçüm ızgarası.
 *
 * Kafes yöntemi: periyodik dalganın harmonikleri `n·f0` kafesine düşer;
 * kafes dışındaki her enerji katlanmadır (FFT kutu genişliği ±5 ana lob
 * payı). İki yol ayrı raporlanır: motor `synthesize` (PolyBLEP → bant
 * sınırlı rezidüel) ve retro çekirdek (2× iç oran + halfband decimator).
 * Ölçülen değer `aliasToSignalDb`; test sınırı ölçümün 2 dB üstüdür.
 *
 * Deterministiktir; çıktı commit'lenmez, sınırlar yeniden ölçülmek
 * istendiğinde koşulur.
 *
 * Kullanım: tsx scripts/research/polyblep-alias-report.ts [--json]
 */
import { powerSpectrum } from '../../src/analysis/spectrum';
import { downsample2x } from '../../src/engine/render';
import { synthesize } from '../../src/engine/synthesize';
import { renderRetro, waveformFields, type RetroWaveform } from '../../src/synthesis/retro';

const RATE = 44100;

/** Kafes dışı / kafes gücü (dB): harmonik olmayan her enerji katlanmadır. */
function aliasDb(x: Float32Array, f: number): number {
  const size = 16384;
  const power = powerSpectrum(x, Math.floor(0.25 * RATE), size);
  const binHz = RATE / size;
  const top = Math.floor((0.4535 * RATE) / binHz);
  const on = new Uint8Array(top + 1);
  for (let k = 0; k <= 5; k++) on[k] = 1;
  for (let m = 1; m * f <= 0.4535 * RATE + 5 * binHz; m++) {
    const c = Math.round((m * f) / binHz);
    for (let k = c - 5; k <= c + 5; k++) if (k >= 0 && k <= top) on[k] = 1;
  }
  let signal = 0;
  let alias = 0;
  for (let k = 0; k <= top; k++) {
    if (on[k]) signal += power[k];
    else alias += power[k];
  }
  return 10 * Math.log10(Math.max(alias / signal, 1e-30));
}

function engineSample(wave: 'sawtooth' | 'square', f: number): Float32Array {
  return synthesize({
    sampleRate: RATE,
    duration: 0.7,
    wave,
    frequency: f,
    normalize: false,
    envelope: { attack: 0, sustain: 1, release: 0, sustainLevel: 1 },
  }).channels[0];
}

function retroSample(wave: RetroWaveform, f: number, syncRatio = 1): Float32Array {
  const duty = wave === 'pulse' ? 0.25 : 0.5;
  return renderRetro(
    {
      ...waveformFields(wave),
      duty,
      dutyTo: duty,
      dutySeconds: 0,
      noiseClockHz: null,
      interpolate: false,
      syncRatio,
      bits: 0,
      holdHz: 0,
    },
    { frequencyHz: f, arpeggio: null, sweep: null, vibrato: null },
    { attack: 0, decay: 0, sustain: 1, release: 0, steps: 0 },
    {
      sampleRate: RATE,
      seconds: 0.7,
      gain: 1,
      oversample: 2,
      decimate: (b) => downsample2x(b, RATE * 2, RATE),
    },
  );
}

const rows: { path: string; wave: string; frequency: number; aliasDb: number }[] = [];
for (const wave of ['sawtooth', 'square'] as const) {
  for (const f of [110, 233, 440, 917, 1760, 3600, 5500, 8000]) {
    rows.push({ path: 'engine', wave, frequency: f, aliasDb: aliasDb(engineSample(wave, f), f) });
  }
}
for (const [wave, extra] of [
  ['pulse', 1],
  ['sawtooth', 1],
  ['sawtooth', 2.5],
  ['triangle-4bit', 1],
  ['table-organ', 1],
] as [RetroWaveform, number][]) {
  for (const f of [233, 917, 3600, 5500]) {
    const x = retroSample(wave, f, extra);
    rows.push({
      path: 'retro',
      wave: extra !== 1 ? `${wave}@${extra}` : wave,
      frequency: f,
      aliasDb: aliasDb(x, f),
    });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows }, null, 1));
} else {
  let prev = '';
  for (const r of rows) {
    if (r.path !== prev) console.log(`— ${r.path}`);
    prev = r.path;
    console.log(
      `  ${r.wave.padEnd(16)} ${String(r.frequency).padStart(5)} Hz  ${r.aliasDb.toFixed(1)} dB`,
    );
  }
}
