import {
  choiceOf,
  numberOf,
  sampleAt,
  signalOf,
  type NumberParamSpec,
  type ParamSignal,
} from '../params';
import type { ProcessorEntry } from '../registry';

/**
 * Karmaşık tek kutuplu rezonatör (faz döndürücü): s ← r·e^{iω}·s + g·x,
 * çıkış Im(s). Frekans ya da sönüm örnek başına değişse bile durum
 * vektörünün BÜYÜKLÜĞÜ korunur; katsayı değişimi enerji sıçraması (tık)
 * üretmez. Direkt-form biquad'da aynı değişiklik durum değişkenlerinin
 * anlamını değiştirir. `r < 1` her T60 > 0 için sağlandığından kararlıdır.
 * Im çıkışı darbede sıfırdan başlar (sinüs fazı) — başlangıçta tık yoktur.
 */
const LN_1000 = Math.log(1000);
/** Nyquist'e yaklaşan mod kosinüsle susturulur; kapı eşiği geçen mod sessizdir. */
const FADE_START = 0.4;
const FADE_END = 0.46;

export interface ModeSpec {
  /** Temel frekansa oran — frekans sinyaliyle çarpılır. */
  readonly ratio: number;
  /** Temel T60'a bölünecek katsayı (yüksek mod daha hızlı söner). */
  readonly decayDivisor: number;
  readonly amplitude: number;
}

export type GainLaw = 'impulse' | 'bandpass';

function nyquistFade(frequency: number, sampleRate: number): number {
  const x = frequency / sampleRate;
  if (x <= FADE_START) return 1;
  if (x >= FADE_END) return 0;
  return 0.5 + 0.5 * Math.cos((Math.PI * (x - FADE_START)) / (FADE_END - FADE_START));
}

/**
 * `input`u mod kümesinden geçirip `output`a TOPLAR. `impulse` yasası girişe
 * birim kazanç verir (darbeyle uyarılan modun genliği sönümden bağımsız —
 * fiziksel vuruş); `bandpass` yasası tepe kazancını 1'e çeker (süzgeç gibi
 * davranan formant). Sabit parametrede katsayılar bir kez hesaplanır;
 * otomasyonlu parametrede örnek başına — yine ayırma yapılmaz.
 */
export function runModes(
  input: Float32Array,
  output: Float32Array,
  modes: readonly ModeSpec[],
  frequency: ParamSignal,
  t60: ParamSignal,
  sampleRate: number,
  law: GainLaw,
): void {
  const re = new Float64Array(modes.length);
  const im = new Float64Array(modes.length);
  const coefC = new Float64Array(modes.length);
  const coefS = new Float64Array(modes.length);
  const gain = new Float64Array(modes.length);
  const constant = typeof frequency === 'number' && typeof t60 === 'number';
  const update = (i: number) => {
    const f0 = sampleAt(frequency, i);
    const decay = sampleAt(t60, i);
    for (let m = 0; m < modes.length; m++) {
      const f = f0 * modes[m].ratio;
      const r = Math.exp(-LN_1000 / ((decay / modes[m].decayDivisor) * sampleRate));
      const w = (2 * Math.PI * f) / sampleRate;
      coefC[m] = r * Math.cos(w);
      coefS[m] = r * Math.sin(w);
      const fade = nyquistFade(f, sampleRate);
      gain[m] = modes[m].amplitude * fade * (law === 'impulse' ? 1 : 2 * (1 - r));
    }
  };
  update(0);
  for (let i = 0; i < input.length; i++) {
    if (!constant && i > 0) update(i);
    const x = input[i];
    let y = 0;
    for (let m = 0; m < modes.length; m++) {
      const nextRe = coefC[m] * re[m] - coefS[m] * im[m] + gain[m] * x;
      const nextIm = coefS[m] * re[m] + coefC[m] * im[m];
      re[m] = nextRe;
      im[m] = nextIm;
      y += nextIm;
    }
    output[i] += y;
  }
}

/** Dairesel gerilmiş zar (kenarı tutturulmuş): ilk 32 Bessel sıfırı j_mn (sıralı), j_01e oranlanır. */
const BESSEL_ZEROS = [
  2.4048, 3.8317, 5.1356, 5.5201, 6.3802, 7.0156, 7.5883, 8.4172, 8.6537, 8.7715, 9.761, 9.9361,
  10.1735, 11.0647, 11.0864, 11.6198, 11.7915, 12.2251, 12.3386, 13.0152, 13.3237, 13.3543, 13.5893,
  14.3725, 14.4755, 14.796, 14.8213, 14.9309, 15.5898, 15.7002, 16.0378, 16.2235,
];
/** Serbest-serbest çubuk (Euler–Bernoulli): β_n·L; f_n ∝ (β_n·L)². */
const BAR_BETA = [4.73, 7.8532, 10.9956, 14.1372, 17.2788];

export type ModalLayout = 'string' | 'bar' | 'membrane';

export function layoutRatio(layout: ModalLayout, k: number, inharmonicity: number): number {
  const n = k + 1;
  switch (layout) {
    case 'bar': {
      const beta = n <= BAR_BETA.length ? BAR_BETA[n - 1] : ((2 * n + 1) * Math.PI) / 2;
      return (beta / BAR_BETA[0]) ** 2;
    }
    case 'membrane':
      return BESSEL_ZEROS[Math.min(k, BESSEL_ZEROS.length - 1)] / BESSEL_ZEROS[0];
    default:
      return (n * Math.sqrt(1 + inharmonicity * n * n)) / Math.sqrt(1 + inharmonicity);
  }
}

const DETERMINISTIC = { stochastic: false, substreams: [] } as const;

const hz = (description: string, fallback: number, max = 12000): NumberParamSpec => ({
  type: 'number',
  unit: 'Hz',
  min: 20,
  max,
  default: fallback,
  automatable: true,
  belowNyquist: true,
  description,
});

const perModeWork = (automated: ReadonlySet<string>) => (automated.size > 0 ? 12 : 5);

export const MODAL: ProcessorEntry = {
  id: 'resonator.modal',
  kind: 'resonator',
  version: 1,
  description:
    'Zamanla değişebilen modal banka: her mod karmaşık faz döndürücüdür; frekans ve T60 ' +
    'otomasyonu örnek başına uygulanır, tık/kararsızlık üretmez. Yerleşim tel (esneklikli), ' +
    'serbest çubuk ya da gerilmiş dairesel zar oranlarını kullanır. Darbe-normalize.',
  capabilities: ['modal', 'resonant', 'time-varying', 'pitched'],
  params: {
    layout: {
      type: 'choice',
      choices: ['string', 'bar', 'membrane'],
      default: 'string',
      description: 'Mod oranları: k·√(1+Bk²), (β_n/β_1)², j_mn/j_01.',
    },
    frequency: hz('Temel mod frekansı.', 220),
    modes: {
      type: 'number',
      unit: 'count',
      min: 1,
      max: 32,
      default: 8,
      integer: true,
      description: 'Mod sayısı (Nyquist yakınındaki modlar yumuşakça susar).',
    },
    decay: {
      type: 'number',
      unit: 's',
      min: 0.005,
      max: 30,
      default: 0.8,
      automatable: true,
      description: 'Temel modun T60 süresi.',
    },
    damping: {
      type: 'number',
      unit: 'ratio',
      min: 0,
      max: 3,
      default: 1,
      description: 'Yüksek mod sönümü: T60_k = decay / oran_k^damping.',
    },
    brightness: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      description: 'Mod genlik eğimi: a_k = oran_k^(−2·(1−brightness)).',
    },
    inharmonicity: {
      type: 'number',
      unit: 'ratio',
      min: 0,
      max: 0.05,
      default: 0.0005,
      description:
        'Tel yerleşiminde esneklik katsayısı B (0 → harmonik). Diğer yerleşimlerde etkisiz.',
    },
  },
  causal: [
    { param: 'frequency', dimension: 'pitch', direction: 1, note: 'Bütün modlar orantılı.' },
    { param: 'modes', dimension: 'brightness', direction: 1, note: 'Üst modlar eklenir.' },
    { param: 'decay', dimension: 'decay', direction: 1, note: 'T60 doğrudan.' },
    { param: 'damping', dimension: 'brightness', direction: -1, note: 'Üst modlar hızlı söner.' },
    { param: 'brightness', dimension: 'brightness', direction: 1, note: 'Üst mod genliği.' },
    { param: 'inharmonicity', dimension: 'roughness', direction: 1, note: 'Oranlar gerilir.' },
  ],
  determinism: DETERMINISTIC,
  resource: {
    model: 'O(kare·mod)',
    workPerFrame: (p, automated) => Number(p.modes) * perModeWork(automated),
    stateBytes: (p) => 40 * Number(p.modes),
  },
  process(buffer, params, ctx) {
    const layout = choiceOf(params, 'layout') as ModalLayout;
    const count = numberOf(params, 'modes');
    const damping = numberOf(params, 'damping');
    const tilt = 2 * (1 - numberOf(params, 'brightness'));
    const inharmonicity = numberOf(params, 'inharmonicity');
    const modes: ModeSpec[] = [];
    let total = 0;
    for (let k = 0; k < count; k++) {
      const ratio = layoutRatio(layout, k, inharmonicity);
      const amplitude = Math.pow(ratio, -tilt);
      total += amplitude;
      modes.push({ ratio, decayDivisor: Math.pow(ratio, damping), amplitude });
    }
    const normalized = modes.map((m) => ({ ...m, amplitude: m.amplitude / total }));
    const input = buffer.slice();
    buffer.fill(0);
    runModes(
      input,
      buffer,
      normalized,
      signalOf(params, 'frequency'),
      signalOf(params, 'decay'),
      ctx.sampleRate,
      'impulse',
    );
  },
};

/** Ses hızı (m/sn), 20 °C kuru hava. */
const SPEED_OF_SOUND = 343;

/**
 * Helmholtz rezonansı: f = (c/2π)·√(A / (V·L_eff)), L_eff = L + 1.7·a
 * (flanşlı boyun uç düzeltmesi, a = √(A/π)). Tek mod yaklaşımıdır —
 * boşluğun daha yüksek duran-dalga modları modellenmez.
 */
export function helmholtzFrequency(
  volumeLiters: number,
  neckAreaCm2: number,
  neckLengthCm: number,
): number {
  const area = neckAreaCm2 * 1e-4;
  const volume = volumeLiters * 1e-3;
  const effective = neckLengthCm * 1e-2 + 1.7 * Math.sqrt(area / Math.PI);
  return (SPEED_OF_SOUND / (2 * Math.PI)) * Math.sqrt(area / (volume * effective));
}

export const CAVITY: ProcessorEntry = {
  id: 'resonator.cavity',
  kind: 'resonator',
  version: 1,
  description:
    'Helmholtz boşluk rezonatörü (tek mod): hacim, boyun kesiti ve boyun uzunluğundan ' +
    'frekans hesaplanır; hacim otomasyonu frekansı sürekli kaydırır. Nyquist yakınında susar.',
  capabilities: ['cavity', 'resonant', 'time-varying', 'physical'],
  params: {
    volume: {
      type: 'number',
      unit: 'L',
      min: 0.0005,
      max: 200,
      default: 0.5,
      automatable: true,
      description: 'Boşluk hacmi.',
    },
    neckArea: {
      type: 'number',
      unit: 'cm2',
      min: 0.05,
      max: 500,
      default: 3,
      description: 'Boyun kesit alanı.',
    },
    neckLength: {
      type: 'number',
      unit: 'cm',
      min: 0.1,
      max: 100,
      default: 2,
      description: 'Boyun uzunluğu.',
    },
    q: {
      type: 'number',
      unit: 'Q',
      min: 1,
      max: 80,
      default: 12,
      description: 'Kalite çarpanı; T60 ≈ 2.2·Q / f.',
    },
  },
  causal: [
    { param: 'volume', dimension: 'pitch', direction: -1, note: 'f ∝ 1/√V.' },
    { param: 'neckArea', dimension: 'pitch', direction: 1, note: 'f ∝ √A (uç düzeltmesiyle).' },
    { param: 'neckLength', dimension: 'pitch', direction: -1, note: 'f ∝ 1/√L_eff.' },
    { param: 'q', dimension: 'decay', direction: 1, note: 'Dar bant, uzun çınlama.' },
  ],
  determinism: DETERMINISTIC,
  resource: {
    model: 'O(kare)',
    workPerFrame: (_p, automated) => (automated.size > 0 ? 14 : 5),
    stateBytes: () => 64,
  },
  process(buffer, params, ctx) {
    const volume = signalOf(params, 'volume');
    const area = numberOf(params, 'neckArea');
    const length = numberOf(params, 'neckLength');
    const q = numberOf(params, 'q');
    const frequency =
      typeof volume === 'number'
        ? helmholtzFrequency(volume, area, length)
        : volume.map((v) => helmholtzFrequency(v, area, length));
    const t60 =
      typeof frequency === 'number'
        ? (LN_1000 * q) / (Math.PI * frequency)
        : frequency.map((f) => (LN_1000 * q) / (Math.PI * f));
    const input = buffer.slice();
    buffer.fill(0);
    runModes(
      input,
      buffer,
      [{ ratio: 1, decayDivisor: 1, amplitude: 1 }],
      frequency,
      t60,
      ctx.sampleRate,
      'bandpass',
    );
  },
};

/** Formant bantgenişliği (Hz) ve göreli seviye — erişkin ünlü ortalamaları mertebesinde. */
const FORMANT_BANDWIDTH = [80, 90, 120, 130];
const FORMANT_LEVEL = [1, 0.7, 0.4, 0.25];

export const FORMANT: ProcessorEntry = {
  id: 'resonator.formant',
  kind: 'resonator',
  version: 1,
  description:
    'Paralel dört formant rezonatörü (bant geçiren yasası, tepe kazancı ≈ 1). F1–F4 ayrı ' +
    'otomasyon alır (dinamik formant); `tract` bütün formantları ölçekler (uzun yol → düşük ' +
    'formant). Kaynaktan bağımsızdır: her exciter/kaynakla birleşir.',
  capabilities: ['formant', 'resonant', 'time-varying', 'vocal'],
  params: {
    f1: hz('Birinci formant.', 700, 4000),
    f2: hz('İkinci formant.', 1220, 6000),
    f3: hz('Üçüncü formant.', 2600, 8000),
    f4: hz('Dördüncü formant.', 3300, 10000),
    bandwidth: {
      type: 'number',
      unit: 'ratio',
      min: 0.25,
      max: 4,
      default: 1,
      description: 'Bantgenişliği çarpanı (80/90/120/130 Hz tabanı).',
    },
    tract: {
      type: 'number',
      unit: 'ratio',
      min: 0.5,
      max: 2,
      default: 1,
      automatable: true,
      description: 'Ses yolu uzunluğu çarpanı; formantlar 1/tract ile ölçeklenir.',
    },
  },
  causal: [
    { param: 'f1', dimension: 'brightness', direction: 1, note: 'Açıklık/kapalılık ekseni.' },
    { param: 'f2', dimension: 'brightness', direction: 1, note: 'Ön/arka ekseni.' },
    { param: 'f3', dimension: 'brightness', direction: 1, note: 'Tını rengi.' },
    { param: 'f4', dimension: 'brightness', direction: 1, note: 'Tını rengi.' },
    { param: 'bandwidth', dimension: 'bandwidth', direction: 1, note: 'Rezonans genişler.' },
    { param: 'tract', dimension: 'brightness', direction: -1, note: 'Uzun yol, düşük formant.' },
  ],
  determinism: DETERMINISTIC,
  resource: {
    model: 'O(kare·4)',
    workPerFrame: (_p, automated) => (automated.size > 0 ? 50 : 20),
    stateBytes: () => 256,
  },
  process(buffer, params, ctx) {
    const input = buffer.slice();
    buffer.fill(0);
    const tract = signalOf(params, 'tract');
    const scale = numberOf(params, 'bandwidth');
    ['f1', 'f2', 'f3', 'f4'].forEach((key, k) => {
      const f = signalOf(params, key);
      const frequency =
        typeof f === 'number' && typeof tract === 'number'
          ? f / tract
          : Float32Array.from(
              { length: buffer.length },
              (_, i) => sampleAt(f, i) / sampleAt(tract, i),
            );
      // −3 dB bant B için kutup yarıçapı e^(−πB/fs) → T60 = ln(1000)/(πB) ≈ 2.2/B.
      const t60 = LN_1000 / (Math.PI * FORMANT_BANDWIDTH[k] * scale);
      runModes(
        input,
        buffer,
        [{ ratio: 1, decayDivisor: 1, amplitude: FORMANT_LEVEL[k] }],
        frequency,
        t60,
        ctx.sampleRate,
        'bandpass',
      );
    });
  },
};

export const RESONATORS = [MODAL, CAVITY, FORMANT] as const;
