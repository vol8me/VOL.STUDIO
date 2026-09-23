import { DelayLine } from '../../effects/delay';
import { compress } from '../../effects/dynamics';
import { applyBiquad, eqCoefficients, passCascade } from '../../effects/eq';
import { limitTruePeak } from '../../effects/limiter';
import { crush, saturate, type SaturationCharacter } from '../../effects/saturation';
import { shapeTransients } from '../../effects/dynamics';
import { choiceOf, numberOf, type NumberParamSpec } from '../params';
import type { EffectEntry } from '../registry';

/**
 * Üretim işleme ilkelleri (Dalga 10): EQ, dinamik, doygunluk, gecikme. Hepsi
 * kanal dizisini YERİNDE işler ve bus zincirinde, program master zincirinde
 * ya da — zamana yayılmayanlar — katman insert'inde kullanılır. Sentez
 * filtresinden (`resonator.biquad`) ayrıdır: o ses ÜRETİMİNİN parçasıdır,
 * bunlar üretilmiş sesi İŞLER.
 */
const DETERMINISTIC = { stochastic: false, substreams: [] } as const;

const num = (
  unit: NumberParamSpec['unit'],
  min: number,
  max: number,
  fallback: number,
  description: string,
  extra: Partial<NumberParamSpec> = {},
): NumberParamSpec => ({
  type: 'number',
  unit,
  min,
  max,
  default: fallback,
  description,
  ...extra,
});

const frequency = (fallback: number, description: string) =>
  num('Hz', 20, 20000, fallback, description, { belowNyquist: true });

const gainDb = num('dB', -24, 24, 0, 'Bant kazancı (0 dB → etkisiz).');

function eachChannel(channels: readonly Float32Array[], run: (c: Float32Array) => void): void {
  for (const channel of channels) run(channel);
}

export const EQ_BELL: EffectEntry = {
  id: 'effect.eq-bell',
  kind: 'effect',
  version: 1,
  timeBased: false,
  linear: true,
  description:
    'Parametrik bell (RBJ peaking): merkez frekansta tam `gainDb`, Q bant genişliği. ' +
    'Sabit katsayılı float64 biquad; frekans yanıtı analitik ve testte ölçülür.',
  capabilities: ['eq', 'processing', 'tone-shaping'],
  params: {
    frequency: frequency(1000, 'Merkez frekansı.'),
    gainDb,
    q: num('Q', 0.1, 18, 1, 'Bant genişliği (yüksek Q dar bant).'),
  },
  causal: [
    { param: 'frequency', dimension: 'brightness', direction: 1, note: 'Etki bandı tizleşir.' },
    { param: 'gainDb', dimension: 'loudness', direction: 1, note: 'Bant seviyesi.' },
    { param: 'q', dimension: 'bandwidth', direction: -1, note: 'Etki bandı daralır.' },
  ],
  determinism: DETERMINISTIC,
  resource: { model: 'O(kare)', workPerFrame: () => 1, stateBytes: () => 64 },
  probe: { params: { gainDb: 6 } },
  process(channels, params, ctx) {
    const c = eqCoefficients(
      {
        type: 'bell',
        frequency: numberOf(params, 'frequency'),
        gainDb: numberOf(params, 'gainDb'),
        q: numberOf(params, 'q'),
      },
      ctx.sampleRate,
    );
    eachChannel(channels, (channel) => applyBiquad(channel, c));
  },
};

export const EQ_SHELF: EffectEntry = {
  id: 'effect.eq-shelf',
  kind: 'effect',
  version: 1,
  timeBased: false,
  linear: true,
  description:
    'Alçak ya da yüksek raf (RBJ shelf): kenar frekansının ötesinde tam `gainDb`, kenarda ' +
    'yarısı. Q 0.707 aşımsız eğimdir (S = 1); büyük Q rafın kenarında tümsek bırakır.',
  capabilities: ['eq', 'processing', 'tone-shaping'],
  params: {
    edge: {
      type: 'choice',
      choices: ['low', 'high'],
      default: 'low',
      description: 'Rafın yönü: alçak raf kenarın altını, yüksek raf üstünü değiştirir.',
    },
    frequency: frequency(200, 'Raf kenarı (yarı kazanç noktası).'),
    gainDb,
    q: num('Q', 0.3, 2, 0.707, 'Raf eğimi; 0.707 aşımsız.'),
  },
  causal: [
    { param: 'frequency', dimension: 'brightness', direction: 1, note: 'Kenar tizleşir.' },
    { param: 'gainDb', dimension: 'loudness', direction: 1, note: 'Raf seviyesi.' },
    { param: 'q', dimension: 'bandwidth', direction: -1, note: 'Geçiş dikleşir.' },
  ],
  determinism: DETERMINISTIC,
  resource: { model: 'O(kare)', workPerFrame: () => 1, stateBytes: () => 64 },
  probe: { params: { gainDb: 6 } },
  process(channels, params, ctx) {
    const c = eqCoefficients(
      {
        type: choiceOf(params, 'edge') === 'high' ? 'high-shelf' : 'low-shelf',
        frequency: numberOf(params, 'frequency'),
        gainDb: numberOf(params, 'gainDb'),
        q: numberOf(params, 'q'),
      },
      ctx.sampleRate,
    );
    eachChannel(channels, (channel) => applyBiquad(channel, c));
  },
};

export const EQ_PASS: EffectEntry = {
  id: 'effect.eq-pass',
  kind: 'effect',
  version: 1,
  timeBased: false,
  linear: true,
  description:
    'Yüksek ya da alçak geçiren Butterworth kaskadı: `order` 2. dereceli aşama (12·order ' +
    'dB/oktav), kesimde −3 dB (Q 0.707). Q son aşamada rezonans tepesi açar.',
  capabilities: ['eq', 'processing', 'filter'],
  params: {
    response: {
      type: 'choice',
      choices: ['highpass', 'lowpass'],
      default: 'highpass',
      description: 'Geçirilen bant.',
    },
    frequency: frequency(80, 'Kesim frekansı (−3 dB).'),
    q: num('Q', 0.5, 4, 0.707, 'Son aşamanın rezonansı; 0.707 düz Butterworth.'),
    order: num('count', 1, 4, 1, 'Aşama sayısı (12 dB/oktav başına).', { integer: true }),
  },
  causal: [
    { param: 'frequency', dimension: 'brightness', direction: 1, note: 'Kesim yükselir.' },
    { param: 'q', dimension: 'bandwidth', direction: -1, note: 'Kesimde tepe.' },
    { param: 'order', dimension: 'bandwidth', direction: -1, note: 'Eğim dikleşir.' },
  ],
  determinism: DETERMINISTIC,
  resource: {
    model: 'O(kare·aşama)',
    workPerFrame: (p) => Number(p.order),
    stateBytes: (p) => 32 * Number(p.order),
  },
  process(channels, params, ctx) {
    const stages = passCascade(
      choiceOf(params, 'response') === 'lowpass' ? 'lowpass' : 'highpass',
      numberOf(params, 'frequency'),
      numberOf(params, 'q'),
      numberOf(params, 'order'),
      ctx.sampleRate,
    );
    eachChannel(channels, (channel) => stages.forEach((c) => applyBiquad(channel, c)));
  },
};

export const COMPRESSOR: EffectEntry = {
  id: 'effect.compressor',
  kind: 'effect',
  version: 1,
  timeBased: false,
  linear: false,
  sidechain: true,
  description:
    'İleri beslemeli kompresör (Giannoulis–Massberg–Reiss 2012): log alanında yumuşak dizli ' +
    'statik eğri, dB alanında dallanan atak/bırakma. `detectorSeconds` 0 → tepe, > 0 → RMS ' +
    'penceresi. `sidechain` ile başka bus/katmanı dinler (ducking); sessiz sidechain çıktıyı ' +
    'bit-eşit bırakır.',
  capabilities: ['dynamics', 'processing', 'sidechain'],
  params: {
    thresholdDb: num('dBFS', -60, 0, -18, 'Eşik.'),
    ratio: num('ratio', 1, 20, 4, 'Oran (eşik üstü giriş dB : çıkış dB).'),
    kneeDb: num('dB', 0, 24, 6, 'Diz genişliği (0 sert).'),
    attackSeconds: num('s', 0.0001, 0.5, 0.005, 'Atak zaman sabiti.'),
    releaseSeconds: num('s', 0.005, 3, 0.15, 'Bırakma zaman sabiti.'),
    makeupDb: num('dB', -24, 24, 0, 'Sonrası kazanç.'),
    detectorSeconds: num('s', 0, 0.3, 0, 'Detektör: 0 tepe, > 0 RMS zaman sabiti.'),
    link: {
      type: 'choice',
      choices: ['linked', 'independent'],
      default: 'linked',
      description: 'Stereo: tek zarf (görüntü korunur) ya da kanal başına zarf.',
    },
  },
  causal: [
    { param: 'thresholdDb', dimension: 'dynamic-range', direction: 1, note: 'Daha az sıkıştırma.' },
    { param: 'ratio', dimension: 'dynamic-range', direction: -1, note: 'Daha çok sıkıştırma.' },
    { param: 'kneeDb', dimension: 'dynamic-range', direction: 1, note: 'Yumuşak geçiş.' },
    { param: 'attackSeconds', dimension: 'transient', direction: 1, note: 'Atak geçer.' },
    { param: 'releaseSeconds', dimension: 'release-time', direction: 1, note: 'Yavaş toparlanma.' },
    { param: 'makeupDb', dimension: 'loudness', direction: 1, note: 'Çıkış seviyesi.' },
    { param: 'detectorSeconds', dimension: 'transient', direction: 1, note: 'RMS tepeyi kaçırır.' },
  ],
  determinism: DETERMINISTIC,
  resource: {
    model: 'O(kare)',
    workPerFrame: () => 6,
    stateBytes: () => 64,
    bytesPerFrame: () => 4,
  },
  probe: { channels: 2 },
  process(channels, params, ctx) {
    compress(
      channels,
      ctx.sampleRate,
      {
        thresholdDb: numberOf(params, 'thresholdDb'),
        ratio: numberOf(params, 'ratio'),
        kneeDb: numberOf(params, 'kneeDb'),
        attackSeconds: numberOf(params, 'attackSeconds'),
        releaseSeconds: numberOf(params, 'releaseSeconds'),
        makeupDb: numberOf(params, 'makeupDb'),
        detector: numberOf(params, 'detectorSeconds') > 0 ? 'rms' : 'peak',
        rmsSeconds: numberOf(params, 'detectorSeconds'),
        link: choiceOf(params, 'link') === 'independent' ? 'independent' : 'linked',
      },
      ctx.sidechain,
    );
  },
};

export const LIMITER: EffectEntry = {
  id: 'effect.limiter',
  kind: 'effect',
  version: 1,
  timeBased: false,
  linear: false,
  description:
    'İleriye bakan true-peak sınırlayıcı (dinamik efekt olarak): örnekler-arası tepe 4× ' +
    'çok fazlı ara değerle okunur, kazanç ileri bakış boyunca iner ve ölçülen tepe tavanı ' +
    'aşarsa yeniden hesaplanır. Teslim güvenliği için ayrı `master.limiter` vardır.',
  capabilities: ['dynamics', 'processing', 'true-peak'],
  params: {
    ceilingDb: num('dB', -24, 0, -1, 'True-peak tavanı (dBTP).'),
    lookaheadSeconds: num('s', 0.0005, 0.02, 0.005, 'İleri bakış (kazanç inişi).'),
    releaseSeconds: num('s', 0.005, 2, 0.08, 'Bırakma zaman sabiti.'),
  },
  causal: [
    { param: 'ceilingDb', dimension: 'loudness', direction: 1, note: 'Tavan yükselir.' },
    { param: 'lookaheadSeconds', dimension: 'transient', direction: -1, note: 'Yumuşak iniş.' },
    { param: 'releaseSeconds', dimension: 'dynamic-range', direction: 1, note: 'Yavaş dönüş.' },
  ],
  determinism: DETERMINISTIC,
  resource: {
    model: 'O(kare·(ara değer 150 + tur·ölçüm))',
    workPerFrame: () => 60,
    stateBytes: () => 0,
    bytesPerFrame: () => 32,
  },
  process(channels, params, ctx) {
    limitTruePeak(channels, ctx.sampleRate, {
      ceilingDb: numberOf(params, 'ceilingDb'),
      lookaheadSeconds: numberOf(params, 'lookaheadSeconds'),
      releaseSeconds: numberOf(params, 'releaseSeconds'),
    });
  },
};

export const TRANSIENT_SHAPER: EffectEntry = {
  id: 'effect.transient-shaper',
  kind: 'effect',
  version: 1,
  timeBased: false,
  linear: false,
  description:
    'Diferansiyel zarf transient şekillendiricisi: hızlı ve yavaş tepe izleyicisinin dB ' +
    'farkı atak ve gövde bölgelerini ayırır; kazanç seviyeden bağımsızdır.',
  capabilities: ['dynamics', 'processing', 'transient'],
  params: {
    attackDb: num('dB', -24, 24, 6, 'Atak bölgesine kazanç.'),
    sustainDb: num('dB', -24, 24, -3, 'Gövde/sönüm bölgesine kazanç.'),
    speedSeconds: num('s', 0.0002, 0.02, 0.002, 'Hızlı zarfın atak süresi (yavaş ×20).'),
  },
  causal: [
    { param: 'attackDb', dimension: 'transient', direction: 1, note: 'Atak belirginleşir.' },
    { param: 'sustainDb', dimension: 'decay', direction: 1, note: 'Kuyruk kabarır.' },
    { param: 'speedSeconds', dimension: 'attack-time', direction: 1, note: 'Uzun atak bölgesi.' },
  ],
  determinism: DETERMINISTIC,
  resource: { model: 'O(kare)', workPerFrame: () => 5, stateBytes: () => 32 },
  probe: { signal: 'impulsive' },
  process(channels, params, ctx) {
    shapeTransients(channels, ctx.sampleRate, {
      attackDb: numberOf(params, 'attackDb'),
      sustainDb: numberOf(params, 'sustainDb'),
      speedSeconds: numberOf(params, 'speedSeconds'),
    });
  },
};

export const SATURATION: EffectEntry = {
  id: 'effect.saturation',
  kind: 'effect',
  version: 1,
  timeBased: false,
  linear: false,
  description:
    'Dalga şekillendirici doygunluk, 4× aşırı örnekli (Kaiser sinc, gecikmesiz): tanh ' +
    '(simetrik, tek harmonik), asymmetric (ofsetli tanh, çift harmonik), hard (kırpma). ' +
    'Tam ölçek tam ölçeğe eşlenir; sürüş karakteri değiştirir.',
  capabilities: ['distortion', 'processing', 'saturation'],
  params: {
    driveDb: num('dB', 0, 36, 6, 'Şekillendirici öncesi kazanç.'),
    character: {
      type: 'choice',
      choices: ['tanh', 'asymmetric', 'hard'],
      default: 'tanh',
      description: 'Şekillendirici eğrisi.',
    },
    mix: num('normalized', 0, 1, 1, 'Islak oran.'),
    outputDb: num('dB', -24, 12, 0, 'Çıkış kazancı.'),
  },
  causal: [
    { param: 'driveDb', dimension: 'distortion', direction: 1, note: 'Daha çok harmonik.' },
    { param: 'mix', dimension: 'distortion', direction: 1, note: 'Islak oran.' },
    { param: 'outputDb', dimension: 'loudness', direction: 1, note: 'Çıkış seviyesi.' },
  ],
  determinism: DETERMINISTIC,
  resource: {
    model: 'O(kare·(4× yukarı + aşağı sinc))',
    workPerFrame: () => 120,
    stateBytes: () => 0,
    bytesPerFrame: () => 20,
  },
  process(channels, params) {
    saturate(channels, {
      driveDb: numberOf(params, 'driveDb'),
      character: choiceOf(params, 'character') as SaturationCharacter,
      mix: numberOf(params, 'mix'),
      outputDb: numberOf(params, 'outputDb'),
    });
  },
};

export const BITCRUSH: EffectEntry = {
  id: 'effect.bitcrush',
  kind: 'effect',
  version: 1,
  timeBased: false,
  linear: false,
  description:
    'Bit ve örnek indirgeyici: 2^(bits−1) seviyeli kuantizasyon (dither YOK) ve `hold` ' +
    'örnekte bir tutma — bilinçli alias ve basamak; retro/lo-fi karakter aracı.',
  capabilities: ['retro', 'processing', 'lo-fi'],
  params: {
    bits: num('bits', 2, 24, 8, 'Kuantizasyon derinliği.', { integer: true }),
    hold: num('count', 1, 64, 1, 'Örnek tutma çarpanı (1 → yok).', { integer: true }),
    mix: num('normalized', 0, 1, 1, 'Islak oran.'),
  },
  causal: [
    {
      param: 'bits',
      dimension: 'noisiness',
      direction: -1,
      note: 'Daha az kuantizasyon gürültüsü.',
    },
    { param: 'hold', dimension: 'roughness', direction: 1, note: 'Alias ve basamak.' },
    { param: 'mix', dimension: 'distortion', direction: 1, note: 'Islak oran.' },
  ],
  determinism: DETERMINISTIC,
  resource: { model: 'O(kare)', workPerFrame: () => 1, stateBytes: () => 0 },
  process(channels, params) {
    crush(channels, {
      bits: numberOf(params, 'bits'),
      hold: numberOf(params, 'hold'),
      mix: numberOf(params, 'mix'),
    });
  },
};

export const DELAY: EffectEntry = {
  id: 'effect.delay',
  kind: 'effect',
  version: 1,
  timeBased: true,
  linear: true,
  description:
    'Geri beslemeli gecikme hattı (motorun `DelayLine`ı, kanal başına): yankı/slapback; ' +
    'zamana yayıldığı için katman insert’ine giremez, bus/send ile kullanılır.',
  capabilities: ['space', 'echo', 'tail'],
  params: {
    time: num('s', 0.001, 2, 0.25, 'Gecikme süresi.'),
    feedback: num('normalized', 0, 0.95, 0.35, 'Geri besleme oranı.'),
    mix: num('normalized', 0, 1, 0.3, 'Islak oran.'),
  },
  causal: [
    { param: 'time', dimension: 'duration', direction: 1, note: 'Yankı aralığı.' },
    { param: 'feedback', dimension: 'decay', direction: 1, note: 'Daha çok yankı.' },
    { param: 'mix', dimension: 'wetness', direction: 1, note: 'Islak oran.' },
  ],
  determinism: DETERMINISTIC,
  resource: {
    model: 'O(kare) + gecikme hattı',
    workPerFrame: () => 2,
    stateBytes: (p, sampleRate) => 4 * Number(p.time) * sampleRate,
  },
  process(channels, params, ctx) {
    for (const channel of channels) {
      const line = new DelayLine(
        {
          time: numberOf(params, 'time'),
          feedback: numberOf(params, 'feedback'),
          mix: numberOf(params, 'mix'),
        },
        ctx.sampleRate,
      );
      for (let i = 0; i < channel.length; i++) channel[i] = line.process(channel[i]);
    }
  },
};

export const PROCESSORS = [
  EQ_BELL,
  EQ_SHELF,
  EQ_PASS,
  COMPRESSOR,
  LIMITER,
  TRANSIENT_SHAPER,
  SATURATION,
  BITCRUSH,
  DELAY,
] as const;
