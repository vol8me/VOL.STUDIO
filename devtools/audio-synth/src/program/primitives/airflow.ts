import { createNoiseSource } from '../../synthesis/noise';
import { StateVariableFilter } from '../../synthesis/svf';
import { numberOf, sampleAt, signalOf } from '../params';
import type { SourceEntry } from '../registry';
import { helmholtzFrequency } from './resonance';

/**
 * Hava/gaz akışı — beyaz gürültü + alçak geçirenden öte, akışın fiziğinden
 * türeyen bantlar (yaklaşımlar DESIGN "SFX mekanizmaları"nda):
 *
 * - Akış hızı Bernoulli: U = U_max·√basınç (U_max 80 m/sn ≈ 3.9 kPa hava).
 * - Jet gürültüsünün tepe frekansı Strouhal ölçeği: f ≈ St·U/d, St ≈ 0.2
 *   (d = ağız çapı). Küçük ağız + hızlı akış → tiz tıslama.
 * - Kenar tonu/ıslık aynı frekansta dar banttır; `turbulence` 0'a indikçe
 *   bant daralır (tutarlı jet), 1'de geniş bant türbülanstır.
 * - Genlik U³ ile ölçeklenir (dipol akustik gücü ∝ U⁶, Lighthill/Curle).
 * - `sibilance` 1.7·f_jet civarında (3–11 kHz) dar bir rezonans, `cavity`
 *   akışın beslediği Helmholtz boşluğudur (ağız kesiti boyun olarak).
 */
export const MAX_FLOW_SPEED = 80;
const STROUHAL = 0.2;

export function jetPeakHz(flowSpeed: number, apertureMm: number): number {
  return (STROUHAL * flowSpeed) / (apertureMm * 1e-3);
}

export const AIRFLOW: SourceEntry = {
  id: 'source.airflow',
  kind: 'source',
  version: 1,
  description:
    'Akış kaynağı: basınç → Bernoulli akış hızı, ağız çapı → Strouhal jet bandı (f ≈ 0.2·U/d), ' +
    'türbülans tutarlı ıslık ile geniş bant arasında, spektral eğim, sibilans rezonansı ve ' +
    'Helmholtz boşluğu. Basınç gesture ile sürülür; genlik U³.',
  capabilities: ['airflow', 'hiss', 'turbulence', 'breath', 'stochastic', 'time-varying'],
  params: {
    pressure: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.6,
      automatable: true,
      description: 'Sürücü basınç (U = 80·√p m/sn).',
    },
    aperture: {
      type: 'number',
      unit: 'mm',
      min: 0.5,
      max: 100,
      default: 6,
      description: 'Ağız/orifis çapı d.',
    },
    turbulence: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.8,
      description: '0 tutarlı jet (ıslık), 1 geniş bant türbülans.',
    },
    tilt: {
      type: 'number',
      unit: 'normalized',
      min: -1,
      max: 1,
      default: 0,
      description: 'Spektral eğim: −1 koyu, +1 parlak (±12 dB raf).',
    },
    sibilance: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.3,
      description: 'Sibilans rezonansının payı (1.7·f_jet, 3–11 kHz).',
    },
    cavity: {
      type: 'number',
      unit: 'L',
      min: 0.0005,
      max: 50,
      default: 0.5,
      description: 'Akışın beslediği boşluğun hacmi (Helmholtz).',
    },
    cavityMix: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.25,
      description: 'Boşluk rezonansının payı.',
    },
  },
  causal: [
    { param: 'pressure', dimension: 'loudness', direction: 1, note: 'U³ genlik, tizleşir.' },
    { param: 'aperture', dimension: 'pitch', direction: -1, note: 'f_jet ∝ 1/d.' },
    { param: 'turbulence', dimension: 'noisiness', direction: 1, note: 'Islık → gürültü.' },
    { param: 'tilt', dimension: 'brightness', direction: 1, note: 'Raf eğimi.' },
    { param: 'sibilance', dimension: 'brightness', direction: 1, note: 'Tiz rezonans.' },
    { param: 'cavity', dimension: 'pitch', direction: -1, note: 'f ∝ 1/√V.' },
    { param: 'cavityMix', dimension: 'bandwidth', direction: -1, note: 'Rezonanslı renk.' },
  ],
  determinism: { stochastic: true, substreams: ['flow'] },
  resource: {
    model: 'O(kare) — 4 SVF',
    workPerFrame: (_p, automated) => 16 + 8 * automated.size,
    stateBytes: () => 128,
  },
  render(out, params, ctx) {
    const sr = ctx.sampleRate;
    const pressure = signalOf(params, 'pressure');
    const aperture = numberOf(params, 'aperture');
    const turbulence = numberOf(params, 'turbulence');
    const tilt = numberOf(params, 'tilt');
    const sibilance = numberOf(params, 'sibilance');
    const cavityMix = numberOf(params, 'cavityMix');
    const areaCm2 = Math.PI * (aperture / 20) ** 2;
    const cavityHz = helmholtzFrequency(numberOf(params, 'cavity'), Math.max(0.05, areaCm2), 1);
    const noise = createNoiseSource('noise', ctx.seed('flow'));
    const jet = new StateVariableFilter(sr);
    const whistle = new StateVariableFilter(sr);
    const sib = new StateVariableFilter(sr);
    const cav = new StateVariableFilter(sr);
    const shelf = new StateVariableFilter(sr);
    const whistleQ = 1 + 60 * (1 - turbulence) ** 2;
    const shelfGain = Math.pow(10, (12 * tilt) / 20);
    for (let i = 0; i < out.length; i++) {
      const p = Math.max(0, sampleAt(pressure, i));
      const u = MAX_FLOW_SPEED * Math.sqrt(p);
      const amplitude = Math.pow(u / MAX_FLOW_SPEED, 3);
      if (amplitude <= 0) {
        out[i] = 0;
        continue;
      }
      const peak = Math.min(0.45 * sr, Math.max(40, jetPeakHz(u, aperture)));
      const x = noise.next();
      const broad = jet.bandpass(x, peak, 0.6);
      const tone = whistle.bandpass(x, peak, whistleQ) * Math.sqrt(whistleQ);
      const sibilant = sib.bandpass(x, Math.min(11000, Math.max(3000, 1.7 * peak)), 4);
      const body = cav.bandpass(x, cavityHz, 8);
      const mixed =
        turbulence * broad + (1 - turbulence) * tone + sibilance * sibilant + cavityMix * body;
      const high = shelf.step(mixed, 2000, Math.SQRT1_2);
      out[i] = amplitude * (high.low + shelfGain * (mixed - high.low));
    }
  },
};
