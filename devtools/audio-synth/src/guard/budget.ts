import { OVERSAMPLE_FACTOR } from '../engine/constants';
import type { ResolvedSynthParams } from './synth';

const FLOAT32_BYTES = 4;

/**
 * Bir render'ın ayırmadan ÖNCE tahmin edilen maliyeti.
 *
 * `peakBytes` aynı anda canlı kalabilen tamponların üst sınırıdır (GC'nin
 * ara tamponu erken bırakacağı varsayılmaz). `workUnits` deterministik bir
 * sayımdır; referans makinede bir birim ≈ 10 ns'ye kalibre edilmiştir.
 * Duvar saati donanıma bağlıdır, birim sayısı değildir.
 */
export interface RenderCost {
  readonly peakBytes: number;
  readonly workUnits: number;
}

export interface RenderBudget {
  readonly maxPeakBytes: number;
  readonly maxWorkUnits: number;
}

/**
 * Varsayılan bütçe — ölçüm tablosu ve gerekçesi DESIGN.md "Kaynak bütçesi".
 *
 * Bellek: 1.5 GiB tahmin tavanı. 600 sn / 48 kHz stereo reverb'lü render
 * 550 MiB (ölçülen tepe RSS 628 MiB), sample katmanıyla 881 MiB tahmin
 * eder; 16 GiB'lık referans makinede dört eşzamanlı render'a yer kalır.
 * İş: 6e9 birim ≈ referans makinede 60 sn; aynı senaryo 1.15e9 birimdir.
 */
export const DEFAULT_RENDER_BUDGET: RenderBudget = {
  maxPeakBytes: 1.5 * 1024 ** 3,
  maxWorkUnits: 6e9,
};

/** Render kaynak bütçesini aştı; hiçbir tampon ayrılmadan fırlatılır. */
export class RenderBudgetError extends Error {
  readonly resource: 'memory' | 'work';
  readonly estimate: number;
  readonly limit: number;

  constructor(label: string, resource: 'memory' | 'work', estimate: number, limit: number) {
    const unit = resource === 'memory' ? 'bayt' : 'iş birimi';
    super(
      `${label}: tahmini ${resource === 'memory' ? 'bellek' : 'iş'} ${Math.round(
        estimate,
      )} ${unit}, ` +
        `bütçe ${Math.round(limit)} ${unit}. Süreyi, örnek oranını, tekrar sayısını ya da ` +
        'katman sayısını düşürün.',
    );
    this.name = 'RenderBudgetError';
    this.resource = resource;
    this.estimate = estimate;
    this.limit = limit;
  }
}

export function assertRenderBudget(
  cost: RenderCost,
  label: string,
  budget: RenderBudget = DEFAULT_RENDER_BUDGET,
): void {
  if (!(cost.peakBytes <= budget.maxPeakBytes)) {
    throw new RenderBudgetError(label, 'memory', cost.peakBytes, budget.maxPeakBytes);
  }
  if (!(cost.workUnits <= budget.maxWorkUnits)) {
    throw new RenderBudgetError(label, 'work', cost.workUnits, budget.maxWorkUnits);
  }
}

/**
 * Çok kanallı sabit maliyetli bir üretim (fiziksel model, mix tamponu,
 * writer) için maliyet: `buffersPerFrame` kanal başına eşzamanlı Float32
 * tampon sayısı, `unitsPerFrame` çerçeve başına iş.
 */
export function estimateFrameCost(
  sampleRate: number,
  duration: number,
  buffersPerFrame: number,
  unitsPerFrame: number,
): RenderCost {
  const frames = Math.ceil(sampleRate * duration);
  return {
    peakBytes: frames * buffersPerFrame * FLOAT32_BYTES,
    workUnits: frames * unitsPerFrame,
  };
}

function sampleSourceBytes(p: ResolvedSynthParams): number {
  const data = p.sample?.data;
  if (!data) return 0;
  // WAV baytından çözülen Float32 kaynak en kötü (8-bit) durumda 4 katıdır.
  return data instanceof Float32Array ? data.byteLength : data.byteLength * FLOAT32_BYTES;
}

function voiceUnits(p: ResolvedSynthParams): number {
  const unison = p.detune !== 0 ? 2 : 1;
  if (p.harmonics && p.harmonics.length > 0) return p.harmonics.length * unison;
  let units = 0;
  for (const wave of p.waves) {
    const noise = wave === 'noise' || wave === 'pink' || wave === 'brown';
    units += noise ? 1 : (p.fm && p.fm.index > 0 ? 2 : 1) * unison;
  }
  return units;
}

function filterUnits(poles: 1 | 2 | 4 | undefined): number {
  return poles === undefined ? 0 : poles === 4 ? 2 : 1;
}

/** `synthesize` için maliyet; bütün terimler çözümlenmiş parametreden gelir. */
export function estimateSynthCost(p: ResolvedSynthParams): RenderCost {
  const frames = Math.ceil(p.sampleRate * p.totalDuration);
  const internal = Math.ceil(p.sampleRate * OVERSAMPLE_FACTOR * p.totalDuration);
  const renderedInternal = p.repeat * Math.floor(p.sampleRate * OVERSAMPLE_FACTOR * p.duration);
  const { bus } = p;
  const stereo = bus.pan !== undefined || bus.stereoWidth !== undefined || bus.reverb !== undefined;

  const chainBuffers = 2 + (stereo ? 1 : 0);
  const sampleBuffers = p.sample ? 3 : 0;
  const stateSamples =
    (bus.delay ? bus.delay.time * p.sampleRate : 0) +
    (bus.reverb ? 2 * (bus.reverb.preDelay + 0.4) * p.sampleRate : 0);
  const peakBytes =
    FLOAT32_BYTES * (internal + frames * (chainBuffers + sampleBuffers) + stateSamples) +
    sampleSourceBytes(p);

  // Kalibrasyon (render-budget-bench): iç örnek başına sabit yük (zarf,
  // anlık frekans, decimator) ~120 ns, osilatör başına ~24 ns; stereo reverb
  // çıkış örneği başına ~80 ns.
  const perInternal =
    12 +
    2.5 * voiceUnits(p) +
    filterUnits(p.lowpass?.poles) +
    filterUnits(p.highpass?.poles) +
    p.lfos.length;
  const perFrame =
    1 +
    (bus.delay ? 1 : 0) +
    (bus.flanger ? 1 : 0) +
    (bus.phaser ? bus.phaser.stages : 0) +
    (bus.chorus ? 1 : 0) +
    (bus.reverb ? 8 : 0) +
    (p.sample ? 2 : 0);

  return {
    peakBytes,
    workUnits: renderedInternal * perInternal + frames * perFrame,
  };
}
