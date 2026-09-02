/**
 * VOL.ARACHNID fiziksel/foley ses paleti.
 *
 * İlk palet tek bir osilatör + filtreli gürültü katmanlarından oluşuyordu.
 * Ölçümde tüm çıktılar MONO'ydu; kısa efektler tek bir sentez notası gibi,
 * ambiyans ise baştan/sondan sessizliğe inen bir gürültü duvarı gibi
 * okunuyordu. Bu sürüm farklı bir yöntem kullanır:
 *
 * - temaslar: mikro-zamanlanmış darbeler + inharmonik modal rezonatörler,
 * - kütle: sürekli perde düşüren, kısa ve doygun gövde impulsu,
 * - hava/toz: bağımsız stereo gürültü kaynaklarının hareketli bantları,
 * - mekân: fiziksel gecikmeli stereo oda kuyruğu,
 * - ambiyans: uzun ham kayıt üzerinde overlap/crossfade ile gerçek loop.
 *
 * İşlem build-time'dır; runtime yalnız gönderilmiş OGG dosyalarını çalar.
 */

import {
  BiquadFilter,
  BrownNoise,
  PinkNoise,
  Reverb,
  WhiteNoise,
  type SynthesisResult,
} from '@volstudio/audio-synth';
import { createRandom } from '@volstudio/core/random';

const SAMPLE_RATE = 48_000;
const TAU = Math.PI * 2;

interface StereoResult extends SynthesisResult {
  channels: [Float32Array, Float32Array];
}

interface NoiseSource {
  next(): number;
}

interface ModalMode {
  frequency: number;
  decaySeconds: number;
  gain: number;
}

interface NoiseBurstOptions {
  startSeconds: number;
  durationSeconds: number;
  gain: number;
  seed: number;
  noise: 'white' | 'pink' | 'brown';
  highpassHz: number;
  lowpassHz: number;
  pan: number;
  attackSeconds?: number;
  decayCurve?: number;
}

interface MasterOptions {
  peakCeiling: number;
  targetRms?: number;
  drive?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  highpass?: boolean;
}

function stereo(durationSeconds: number): StereoResult {
  const sampleCount = Math.max(1, Math.round(durationSeconds * SAMPLE_RATE));
  return {
    channels: [new Float32Array(sampleCount), new Float32Array(sampleCount)],
    sampleRate: SAMPLE_RATE,
    duration: sampleCount / SAMPLE_RATE,
  };
}

function panGains(pan: number): readonly [number, number] {
  const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

function noiseSource(kind: NoiseBurstOptions['noise'], seed: number): NoiseSource {
  if (kind === 'pink') return new PinkNoise(seed);
  if (kind === 'brown') return new BrownNoise(seed);
  return new WhiteNoise(seed);
}

/** Bant sınırlı, doğal sönümlü bir yüzey teması ekler. */
function addNoiseBurst(result: StereoResult, options: NoiseBurstOptions): void {
  const start = Math.max(0, Math.round(options.startSeconds * SAMPLE_RATE));
  const length = Math.max(1, Math.round(options.durationSeconds * SAMPLE_RATE));
  const end = Math.min(result.channels[0].length, start + length);
  const source = noiseSource(options.noise, options.seed);
  const highpass = new BiquadFilter(SAMPLE_RATE, 'highpass', 0.707);
  const lowpass = new BiquadFilter(SAMPLE_RATE, 'lowpass', 0.82);
  const [leftGain, rightGain] = panGains(options.pan);
  const attack = Math.max(1 / SAMPLE_RATE, options.attackSeconds ?? 0.0008);
  const decayCurve = Math.max(1, options.decayCurve ?? 6.5);

  for (let index = start; index < end; index++) {
    const elapsed = (index - start) / SAMPLE_RATE;
    const progress = elapsed / options.durationSeconds;
    const attackGain = Math.min(1, elapsed / attack);
    const decay = Math.exp(-decayCurve * progress);
    const tail = Math.sin(Math.min(1, progress) * Math.PI * 0.5) ** 0.2;
    const filtered = lowpass.process(
      highpass.process(source.next(), options.highpassHz),
      options.lowpassHz,
    );
    const sample = filtered * options.gain * attackGain * decay * tail;
    result.channels[0][index]! += sample * leftGain;
    result.channels[1][index]! += sample * rightGain;
  }
}

/** İnce bir yüzeyin tek nota olmayan, inharmonik çınlaması. */
function addModalBank(
  result: StereoResult,
  startSeconds: number,
  modes: readonly ModalMode[],
  gain: number,
  pan: number,
  seed: number,
): void {
  const start = Math.max(0, Math.round(startSeconds * SAMPLE_RATE));
  const [leftGain, rightGain] = panGains(pan);
  const random = createRandom(seed);

  for (const mode of modes) {
    const duration = Math.min(result.duration - startSeconds, mode.decaySeconds * 5.5);
    const length = Math.max(0, Math.round(duration * SAMPLE_RATE));
    const phase = random.next() * TAU;
    const detune = 1 + random.bipolar() * 0.006;
    for (let offset = 0; offset < length; offset++) {
      const index = start + offset;
      if (index >= result.channels[0].length) break;
      const time = offset / SAMPLE_RATE;
      const attack = Math.min(1, time / 0.0007);
      const envelope = Math.exp(-time / mode.decaySeconds) * attack;
      const sample =
        Math.sin(TAU * mode.frequency * detune * time + phase) * mode.gain * gain * envelope;
      result.channels[0][index]! += sample * leftGain;
      result.channels[1][index]! += sample * rightGain;
    }
  }
}

/** Kütlenin temas anında zemine aktardığı, aşağı kayan gövde impulsu. */
function addBodyPulse(
  result: StereoResult,
  startSeconds: number,
  durationSeconds: number,
  startHz: number,
  endHz: number,
  gain: number,
  pan = 0,
): void {
  const start = Math.max(0, Math.round(startSeconds * SAMPLE_RATE));
  const length = Math.max(1, Math.round(durationSeconds * SAMPLE_RATE));
  const [leftGain, rightGain] = panGains(pan);
  let phase = 0;

  for (let offset = 0; offset < length; offset++) {
    const index = start + offset;
    if (index >= result.channels[0].length) break;
    const progress = offset / length;
    const frequency = startHz * Math.pow(endHz / startHz, progress);
    phase += (TAU * frequency) / SAMPLE_RATE;
    const attack = Math.min(1, offset / (SAMPLE_RATE * 0.002));
    const envelope = Math.exp(-6.8 * progress) * attack;
    const fundamental = Math.sin(phase);
    const texture = fundamental + Math.sin(phase * 2.03 + 0.4) * 0.16;
    const sample = Math.tanh(texture * 1.25) * gain * envelope;
    result.channels[0][index]! += sample * leftGain;
    result.channels[1][index]! += sample * rightGain;
  }
}

function addClawContact(
  result: StereoResult,
  startSeconds: number,
  gain: number,
  pan: number,
  seed: number,
  brightness = 1,
): void {
  addNoiseBurst(result, {
    startSeconds,
    durationSeconds: 0.038,
    gain: gain * 0.72,
    seed,
    noise: 'white',
    highpassHz: 620 * brightness,
    lowpassHz: 7_200 * brightness,
    pan,
    attackSeconds: 0.00035,
    decayCurve: 9,
  });
  addModalBank(
    result,
    startSeconds + 0.0015,
    [
      { frequency: 740 * brightness, decaySeconds: 0.016, gain: 0.8 },
      { frequency: 1_370 * brightness, decaySeconds: 0.023, gain: 0.52 },
      { frequency: 2_430 * brightness, decaySeconds: 0.012, gain: 0.28 },
    ],
    gain * 0.42,
    pan,
    seed + 17,
  );
}

function applyRoom(
  result: StereoResult,
  amount: number,
  decay: number,
  roomSize: number,
  damp: number,
  preDelay: number,
): void {
  const room = new Reverb({ amount, decay, roomSize, damp, preDelay }, SAMPLE_RATE);
  const [left, right] = result.channels;
  for (let index = 0; index < left.length; index++) {
    const [wetLeft, wetRight] = room.processStereo(left[index]!, right[index]!);
    left[index] = wetLeft;
    right[index] = wetRight;
  }
}

function highpassResult(result: StereoResult, cutoffHz: number): void {
  for (const channel of result.channels) {
    const filter = new BiquadFilter(SAMPLE_RATE, 'highpass', 0.707);
    for (let index = 0; index < channel.length; index++) {
      channel[index] = filter.process(channel[index]!, cutoffHz);
    }
  }
}

/** DC, uç fade, yumuşak doygunluk ve ortak headroom uygulayan son kat. */
function master(result: StereoResult, options: MasterOptions): StereoResult {
  if (options.highpass !== false) highpassResult(result, 18);
  const fadeInSamples = Math.round((options.fadeInSeconds ?? 0) * SAMPLE_RATE);
  const fadeOutSamples = Math.round((options.fadeOutSeconds ?? 0) * SAMPLE_RATE);
  const drive = Math.max(0, options.drive ?? 0.75);
  const driveNorm = drive > 0 ? Math.tanh(drive) : 1;

  let peak = 0;
  let sumSquares = 0;
  let sampleTotal = 0;
  for (const channel of result.channels) {
    let mean = 0;
    for (const sample of channel) mean += sample;
    mean /= channel.length;

    for (let index = 0; index < channel.length; index++) {
      let sample = channel[index]! - mean;
      if (fadeInSamples > 0 && index < fadeInSamples) {
        sample *= Math.sin((index / fadeInSamples) * Math.PI * 0.5) ** 2;
      }
      const fromEnd = channel.length - 1 - index;
      if (fadeOutSamples > 0 && fromEnd < fadeOutSamples) {
        sample *= Math.sin((fromEnd / fadeOutSamples) * Math.PI * 0.5) ** 2;
      }
      if (drive > 0) sample = Math.tanh(sample * drive) / driveNorm;
      channel[index] = sample;
      peak = Math.max(peak, Math.abs(sample));
      sumSquares += sample * sample;
      sampleTotal++;
    }
  }

  const rms = sampleTotal > 0 ? Math.sqrt(sumSquares / sampleTotal) : 0;
  const peakGain = peak > 0 ? options.peakCeiling / peak : 1;
  const rmsGain = options.targetRms && rms > 0 ? options.targetRms / rms : peakGain;
  const gain = Math.min(peakGain, rmsGain);
  for (const channel of result.channels) {
    for (let index = 0; index < channel.length; index++) channel[index]! *= gain;
  }
  return result;
}

/** Pençenin sert zemindeki çift mikro-teması; her seed gerçek bir varyanttır. */
export function clawStep(seed: number, brightness = 1): SynthesisResult {
  const result = stereo(0.18);
  const random = createRandom(seed);
  const pan = random.bipolar() * 0.32;
  addClawContact(result, 0.004, 0.82, pan, seed, brightness);
  addClawContact(result, 0.013 + random.next() * 0.004, 0.25, pan * -0.5, seed + 101, 0.9);
  addNoiseBurst(result, {
    startSeconds: 0.012,
    durationSeconds: 0.09,
    gain: 0.16,
    seed: seed + 211,
    noise: 'pink',
    highpassHz: 720,
    lowpassHz: 3_900 * brightness,
    pan,
    decayCurve: 5.5,
  });
  addBodyPulse(result, 0.006, 0.105, 112 * brightness, 64, 0.13, pan * 0.4);
  applyRoom(result, 0.1, 0.45, 0.28, 0.82, 0.004);
  return master(result, {
    peakCeiling: 0.43,
    drive: 0.92,
    fadeInSeconds: 0.001,
    fadeOutSeconds: 0.022,
  });
}

/** Atılım kalkışı: sekiz pençe itişi, kütle impulsu ve stereo hava yarılması. */
export function dashLaunch(seed: number): SynthesisResult {
  const result = stereo(0.44);
  const random = createRandom(seed);
  for (let contact = 0; contact < 5; contact++) {
    addClawContact(
      result,
      0.004 + contact * 0.004 + random.next() * 0.002,
      0.2 + random.next() * 0.09,
      -0.8 + contact * 0.4,
      seed + contact * 97,
      0.78 + random.next() * 0.3,
    );
  }
  addBodyPulse(result, 0.002, 0.23, 126, 47, 0.44);

  const leftNoise = new PinkNoise(seed + 601);
  const rightNoise = new PinkNoise(seed + 907);
  const leftBand = new BiquadFilter(SAMPLE_RATE, 'bandpass', 0.9);
  const rightBand = new BiquadFilter(SAMPLE_RATE, 'bandpass', 0.82);
  const start = Math.round(0.018 * SAMPLE_RATE);
  const length = Math.round(0.37 * SAMPLE_RATE);
  for (let offset = 0; offset < length; offset++) {
    const index = start + offset;
    const progress = offset / length;
    const swell = Math.sin(progress * Math.PI) ** 0.72;
    const center = 380 * Math.pow(12.5, progress);
    const airLeft = leftBand.process(leftNoise.next(), center);
    const airRight = rightBand.process(rightNoise.next(), center * 1.07);
    const motionPan = Math.sin(progress * Math.PI * 0.9) * 0.18;
    result.channels[0][index]! += airLeft * 0.68 * swell * (1 - motionPan);
    result.channels[1][index]! += airRight * 0.68 * swell * (1 + motionPan);
  }
  applyRoom(result, 0.13, 0.65, 0.42, 0.72, 0.009);
  return master(result, {
    peakCeiling: 0.7,
    drive: 1.05,
    fadeInSeconds: 0.001,
    fadeOutSeconds: 0.032,
  });
}

/** Atılım inişi: mikro-zamanlanmış çoklu pençe, toz ve ağır gövde aktarımı. */
export function dashLand(seed: number): SynthesisResult {
  const result = stereo(0.62);
  const random = createRandom(seed);
  for (let contact = 0; contact < 8; contact++) {
    addClawContact(
      result,
      0.006 + contact * 0.0043 + random.next() * 0.0025,
      0.2 + random.next() * 0.13,
      -0.9 + (contact / 7) * 1.8,
      seed + contact * 131,
      0.76 + random.next() * 0.36,
    );
  }
  addNoiseBurst(result, {
    startSeconds: 0.012,
    durationSeconds: 0.28,
    gain: 0.48,
    seed: seed + 1_101,
    noise: 'brown',
    highpassHz: 120,
    lowpassHz: 2_600,
    pan: -0.12,
    decayCurve: 5.2,
  });
  addNoiseBurst(result, {
    startSeconds: 0.02,
    durationSeconds: 0.24,
    gain: 0.31,
    seed: seed + 1_507,
    noise: 'pink',
    highpassHz: 680,
    lowpassHz: 6_300,
    pan: 0.22,
    decayCurve: 5.8,
  });
  addBodyPulse(result, 0.004, 0.39, 94, 35, 0.62);
  addModalBank(
    result,
    0.01,
    [
      { frequency: 176, decaySeconds: 0.13, gain: 0.42 },
      { frequency: 311, decaySeconds: 0.09, gain: 0.28 },
      { frequency: 557, decaySeconds: 0.07, gain: 0.16 },
    ],
    0.34,
    0.08,
    seed + 1_901,
  );
  applyRoom(result, 0.23, 1.05, 0.58, 0.68, 0.013);
  return master(result, {
    peakCeiling: 0.8,
    drive: 1.2,
    fadeInSeconds: 0.001,
    fadeOutSeconds: 0.045,
  });
}

/** Duvar çarpması: geniş bant darbe, kabuk modları, sürtünme ve oda kuyruğu. */
export function wallImpact(seed: number): SynthesisResult {
  const result = stereo(0.78);
  addNoiseBurst(result, {
    startSeconds: 0.003,
    durationSeconds: 0.17,
    gain: 0.84,
    seed,
    noise: 'brown',
    highpassHz: 75,
    lowpassHz: 3_800,
    pan: -0.1,
    attackSeconds: 0.00045,
    decayCurve: 7.2,
  });
  addNoiseBurst(result, {
    startSeconds: 0.006,
    durationSeconds: 0.12,
    gain: 0.46,
    seed: seed + 409,
    noise: 'white',
    highpassHz: 900,
    lowpassHz: 8_800,
    pan: 0.18,
    decayCurve: 8.5,
  });
  addBodyPulse(result, 0.002, 0.46, 78, 31, 0.72, -0.04);
  addModalBank(
    result,
    0.006,
    [
      { frequency: 137, decaySeconds: 0.31, gain: 0.65 },
      { frequency: 239, decaySeconds: 0.24, gain: 0.44 },
      { frequency: 397, decaySeconds: 0.18, gain: 0.31 },
      { frequency: 683, decaySeconds: 0.13, gain: 0.22 },
      { frequency: 1_113, decaySeconds: 0.08, gain: 0.12 },
    ],
    0.58,
    0.1,
    seed + 811,
  );
  applyRoom(result, 0.3, 1.45, 0.7, 0.62, 0.018);
  return master(result, {
    peakCeiling: 0.88,
    drive: 1.35,
    fadeInSeconds: 0.001,
    fadeOutSeconds: 0.055,
  });
}

/** Ambiyans ham kaydına derin, bağımsız stereo hava katmanları yazar. */
function renderAmbienceBed(seed: number, durationSeconds: number): StereoResult {
  const result = stereo(durationSeconds);
  const leftBrown = new BrownNoise(seed);
  const rightBrown = new BrownNoise(seed + 1_009);
  const leftPink = new PinkNoise(seed + 2_003);
  const rightPink = new PinkNoise(seed + 3_001);
  const leftLow = new BiquadFilter(SAMPLE_RATE, 'lowpass', 0.72);
  const rightLow = new BiquadFilter(SAMPLE_RATE, 'lowpass', 0.68);
  const leftDraft = new BiquadFilter(SAMPLE_RATE, 'bandpass', 0.78);
  const rightDraft = new BiquadFilter(SAMPLE_RATE, 'bandpass', 0.73);
  const [left, right] = result.channels;

  for (let index = 0; index < left.length; index++) {
    const time = index / SAMPLE_RATE;
    const slowA = Math.sin(TAU * 0.021 * time + 0.8);
    const slowB = Math.sin(TAU * 0.033 * time + 2.1);
    const slowC = Math.sin(TAU * 0.014 * time + 4.2);
    const lowCutoffLeft = 82 + slowA * 20 + slowC * 11;
    const lowCutoffRight = 88 + slowB * 18 - slowC * 9;
    const draftCutoffLeft = 420 + (slowB + 1) * 310;
    const draftCutoffRight = 470 + (slowA + 1) * 360;
    const breathLeft = 0.72 + slowB * 0.2;
    const breathRight = 0.7 - slowA * 0.18;

    left[index] =
      leftLow.process(leftBrown.next(), lowCutoffLeft) * 0.54 +
      leftDraft.process(leftPink.next(), draftCutoffLeft) * 0.2 * breathLeft;
    right[index] =
      rightLow.process(rightBrown.next(), lowCutoffRight) * 0.54 +
      rightDraft.process(rightPink.next(), draftCutoffRight) * 0.2 * breathRight;
  }

  const random = createRandom(seed + 4_001);
  const eventRatios = [0.11, 0.24, 0.39, 0.57, 0.73, 0.88];
  for (const [eventIndex, ratio] of eventRatios.entries()) {
    const at = durationSeconds * ratio + random.bipolar() * 0.45;
    const pan = random.bipolar() * 0.72;
    addNoiseBurst(result, {
      startSeconds: Math.max(0, at),
      durationSeconds: 1.2 + random.next() * 0.7,
      gain: 0.055 + random.next() * 0.025,
      seed: seed + 5_000 + eventIndex * 211,
      noise: 'brown',
      highpassHz: 45,
      lowpassHz: 520 + random.next() * 320,
      pan,
      attackSeconds: 0.035,
      decayCurve: 4.2,
    });
    addModalBank(
      result,
      Math.max(0, at + 0.04),
      [
        { frequency: 94 + random.next() * 38, decaySeconds: 0.55, gain: 0.45 },
        { frequency: 181 + random.next() * 71, decaySeconds: 0.38, gain: 0.24 },
      ],
      0.055,
      pan,
      seed + 7_000 + eventIndex * 307,
    );
  }

  applyRoom(result, 0.32, 2.4, 0.86, 0.78, 0.037);
  return result;
}

/**
 * Ham kaydın son bölümünü başlangıç üstüne eş-güçle bindirir.
 *
 * Çıktının son örneği ham akıştaki N-1, ilk örneği N'dir; yani loop sınırı
 * aynı sürekli kayıttaki iki komşu örnektir. İlk `crossfade` bölümü de ham
 * başlangıca yumuşakça döner. Sessizliğe fade edip yeniden yükselme yoktur.
 */
export function crossfadeLoop(
  raw: StereoResult,
  loopDurationSeconds: number,
  crossfadeSeconds: number,
): StereoResult {
  const loopSamples = Math.round(loopDurationSeconds * raw.sampleRate);
  const crossfadeSamples = Math.min(
    Math.round(crossfadeSeconds * raw.sampleRate),
    loopSamples - 1,
    raw.channels[0].length - loopSamples,
  );
  if (loopSamples <= 1 || crossfadeSamples <= 1) {
    throw new Error('Loop ve crossfade süreleri pozitif, ham kayıt yeterince uzun olmalı');
  }

  const output = stereo(loopDurationSeconds);
  for (let channelIndex = 0; channelIndex < 2; channelIndex++) {
    const source = raw.channels[channelIndex]!;
    const target = output.channels[channelIndex]!;
    target.set(source.subarray(0, loopSamples));
    for (let index = 0; index < crossfadeSamples; index++) {
      const phase = (index / (crossfadeSamples - 1)) * Math.PI * 0.5;
      const tailGain = Math.cos(phase);
      const headGain = Math.sin(phase);
      target[index] = source[loopSamples + index]! * tailGain + source[index]! * headGain;
    }
  }
  return output;
}

/** Karanlık temayı koruyan, uzun ve gerçekten dikişsiz stereo mağara yatağı. */
export function darkAmbience(seed: number, durationSeconds: number): SynthesisResult {
  const crossfadeSeconds = Math.min(4, durationSeconds * 0.2);
  const raw = renderAmbienceBed(seed, durationSeconds + crossfadeSeconds);
  // Durum taşıyan filtre loop oluşturulduktan SONRA çalışırsa çıkışın ilk
  // örneğinde sıfır durumundan başlar ve dikişi yeniden bozar. Önce uzun,
  // sürekli ham kaydı filtrele; ardından aynı akışın N-1/N komşuluğunu sar.
  highpassResult(raw, 18);
  const loop = crossfadeLoop(raw, durationSeconds, crossfadeSeconds);
  return master(loop, {
    peakCeiling: 0.48,
    targetRms: 0.09,
    drive: 0.58,
    highpass: false,
  });
}
