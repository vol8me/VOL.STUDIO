import { createNoiseSource } from '../../synthesis/noise';
import { StateVariableFilter } from '../../synthesis/svf';
import { choiceOf, numberOf, sampleAt, signalOf } from '../params';
import type { SourceEntry } from '../registry';

/**
 * Döngüsel makine: motor / fan-rotor / dişli AYNI temelden. Mil fazı
 * θ(t) = ∫ rpm/60 dt örnek başına biriktirilir; baskın döngü frekansı
 * mekanizmaya göre mil hızının katıdır:
 *
 * - `engine` (4 zamanlı): ateşleme = rpm/60 · silindir / 2
 * - `fan` (rotor): kanat geçişi = rpm/60 · kanat
 * - `gear`: diş kavrama = rpm/60 · diş
 *
 * Döngü harmonik serisiyle (eğim + yük parlaklığı) üretilir, Nyquist
 * yakınında susturulur; `imbalance` mil hızında (1×) genlik modülasyonu ve
 * 1× bileşen, `bearing` rulman bilye geçişinde (≈4.1× mil) modüle edilen
 * yüksek bant gürültüsü, `noise` yükle ölçeklenen mekanik gürültüdür. RPM
 * iki katına çıkınca bütün döngüsel bileşenler iki kat kayar (testte ölçülür).
 */
const FIRING: Readonly<Record<string, number>> = { engine: 0.5, fan: 1, gear: 1 };
const BALL_PASS = 4.1;

export function cycleHz(mechanism: string, rpm: number, count: number): number {
  return (rpm / 60) * count * FIRING[mechanism];
}

export const MACHINE: SourceEntry = {
  id: 'source.machine',
  kind: 'source',
  version: 1,
  description:
    'Döngüsel makine: mil fazı ∫rpm/60; baskın döngü = mil hızı × (silindir/2 | kanat | diş). ' +
    'Harmonik seri (eğim, yük), dengesizlik (1× AM), rulman bandı (≈4.1×) ve mekanik gürültü. ' +
    'RPM gesture ile hızlanma/yavaşlama.',
  capabilities: ['motor', 'mechanism', 'cyclic', 'time-varying', 'stochastic'],
  params: {
    rpm: {
      type: 'number',
      unit: 'rpm',
      min: 60,
      max: 20000,
      default: 1800,
      automatable: true,
      description: 'Mil hızı (dakikada devir).',
    },
    mechanism: {
      type: 'choice',
      choices: ['engine', 'fan', 'gear'],
      default: 'engine',
      description: 'Döngü katı: silindir/2 (4 zaman), kanat, diş.',
    },
    count: {
      type: 'number',
      unit: 'count',
      min: 1,
      max: 64,
      default: 4,
      integer: true,
      description: 'Silindir / kanat / diş sayısı.',
    },
    harmonics: {
      type: 'number',
      unit: 'count',
      min: 1,
      max: 48,
      default: 16,
      integer: true,
      description: 'Döngü harmonik sayısı (Nyquist yakınında susar).',
    },
    tilt: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      description: 'Harmonik eğimi: a_k = k^(−2·tilt) (0 parlak, 1 koyu).',
    },
    load: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      automatable: true,
      description: 'Yük: seviye, üst harmonik ve gürültü artar.',
    },
    noise: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.2,
      description: 'Mekanik gürültü payı (döngüyle modüle).',
    },
    imbalance: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.1,
      description: 'Mil dengesizliği: 1× bileşen ve genlik modülasyonu.',
    },
    bearing: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.15,
      description: 'Rulman/sürtünme bandı (bilye geçişiyle modüle).',
    },
  },
  causal: [
    { param: 'rpm', dimension: 'pitch', direction: 1, note: 'Döngü frekansı ∝ rpm.' },
    { param: 'count', dimension: 'pitch', direction: 1, note: 'Döngü katı.' },
    { param: 'harmonics', dimension: 'brightness', direction: 1, note: 'Üst harmonikler.' },
    { param: 'tilt', dimension: 'brightness', direction: -1, note: 'Koyu seri.' },
    { param: 'load', dimension: 'loudness', direction: 1, note: 'Yük seviyesi.' },
    { param: 'noise', dimension: 'noisiness', direction: 1, note: 'Mekanik gürültü.' },
    { param: 'imbalance', dimension: 'irregularity', direction: 1, note: '1× salınım.' },
    { param: 'bearing', dimension: 'noisiness', direction: 1, note: 'Rulman bandı.' },
  ],
  determinism: { stochastic: true, substreams: ['mechanics'] },
  resource: {
    model: 'O(kare·harmonik)',
    workPerFrame: (p) => 3 * Number(p.harmonics) + 14,
    stateBytes: () => 128,
  },
  render(out, params, ctx) {
    const sr = ctx.sampleRate;
    const rpm = signalOf(params, 'rpm');
    const load = signalOf(params, 'load');
    const factor = numberOf(params, 'count') * FIRING[choiceOf(params, 'mechanism')];
    const harmonics = numberOf(params, 'harmonics');
    const tilt = numberOf(params, 'tilt');
    const noiseAmount = numberOf(params, 'noise');
    const imbalance = numberOf(params, 'imbalance');
    const bearing = numberOf(params, 'bearing');
    const gear = choiceOf(params, 'mechanism') === 'gear';
    const noise = createNoiseSource('noise', ctx.seed('mechanics'));
    const bearingBand = new StateVariableFilter(sr);
    const mechBand = new StateVariableFilter(sr);
    let shaft = 0;
    let norm = 0;
    for (let k = 1; k <= harmonics; k++) norm += Math.pow(k, -2 * tilt);
    for (let i = 0; i < out.length; i++) {
      const shaftHz = sampleAt(rpm, i) / 60;
      const l = sampleAt(load, i);
      const cycle = shaftHz * factor;
      const cyclePhase = 2 * Math.PI * shaft * factor;
      let tone = 0;
      for (let k = 1; k <= harmonics; k++) {
        const f = k * cycle;
        if (f >= 0.45 * sr) break;
        const fade = f > 0.4 * sr ? (0.45 * sr - f) / (0.05 * sr) : 1;
        const bright = 1 + l * (k / harmonics);
        tone += (Math.pow(k, -2 * tilt) * bright * fade * Math.sin(k * cyclePhase)) / norm;
      }
      const shaftPhase = 2 * Math.PI * shaft;
      const wobble = 1 + imbalance * 0.6 * Math.sin(shaftPhase);
      const sidebands = gear ? 1 + 0.3 * imbalance * Math.cos(shaftPhase) : 1;
      const x = noise.next();
      const mech = mechBand.bandpass(x, Math.min(0.45 * sr, 300 + 2 * cycle), 0.8);
      const pulse = 0.5 + 0.5 * Math.cos(cyclePhase);
      const ball = 0.5 + 0.5 * Math.sin(2 * Math.PI * shaft * BALL_PASS);
      const race = bearingBand.bandpass(x, Math.min(0.45 * sr, 6000), 3) * ball;
      out[i] =
        (0.4 + 0.6 * l) *
        (tone * wobble * sidebands +
          imbalance * 0.3 * Math.sin(shaftPhase) +
          noiseAmount * (0.3 + l) * mech * pulse +
          bearing * 0.6 * race);
      shaft += shaftHz / sr;
      if (shaft >= 1_000_000) shaft -= 1_000_000;
    }
  },
};
