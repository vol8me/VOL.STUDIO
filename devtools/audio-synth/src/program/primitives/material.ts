import { createNoiseSource } from '../../synthesis/noise';
import {
  fundamentalHz,
  fundamentalT60,
  MATERIAL_IDS,
  materialBrightness,
  materialById,
  materialModeRatio,
  type MaterialProfileV1,
} from '../materials';
import { choiceOf, numberOf } from '../params';
import type { ProcessorEntry } from '../registry';
import { runModes, type ModeSpec } from './resonance';

/**
 * Materyal gövdesi: `MaterialProfileV1` verisinden kurulan modal banka.
 * Aynı uyarım farklı materyalde farklı mod ARALIĞI (yerleşim + gerilme), farklı
 * mod başına çınlama (η) ve farklı parlaklık (E) verir — yalnız renk değil
 * sönüm davranışı değişir. Temas gürültüsü girişin zarfıyla açılan,
 * pürüzle ölçeklenen dar-bant gürültüdür (taş/kumaş hışırtısı).
 */
export function materialModes(
  material: MaterialProfileV1,
  count: number,
  strike: number,
): ModeSpec[] {
  const tilt = 2 * (1 - materialBrightness(material));
  const modes: ModeSpec[] = [];
  let total = 0;
  for (let k = 0; k < count; k++) {
    const ratio = materialModeRatio(material, k);
    const position = 0.15 + 0.85 * Math.abs(Math.sin(Math.PI * (k + 1) * strike));
    const amplitude = Math.pow(ratio, -tilt) * position;
    total += amplitude;
    modes.push({ ratio, decayDivisor: Math.pow(ratio, material.dampingExponent), amplitude });
  }
  return modes.map((m) => ({ ...m, amplitude: m.amplitude / total }));
}

/** Giriş zarfıyla (≈3 ms) açılan, materyal pürüzüyle ölçeklenen temas gürültüsü. */
function addContactNoise(
  input: Float32Array,
  out: Float32Array,
  amount: number,
  f1: number,
  seed: number,
  sampleRate: number,
): void {
  if (amount <= 0) return;
  const noise = createNoiseSource('noise', seed);
  const follow = Math.exp(-1 / (0.003 * sampleRate));
  const band =
    1 - Math.exp((-2 * Math.PI * Math.min(0.45 * sampleRate, 4 * f1 + 2000)) / sampleRate);
  let envelope = 0;
  let lowpassed = 0;
  for (let i = 0; i < input.length; i++) {
    envelope = Math.max(Math.abs(input[i]), follow * envelope);
    lowpassed += band * (noise.next() - lowpassed);
    out[i] += 0.5 * amount * envelope * lowpassed;
  }
}

export const MATERIAL_BODY: ProcessorEntry = {
  id: 'resonator.material',
  kind: 'resonator',
  version: 1,
  description:
    'Materyal gövdesi: MaterialProfile verisinden (E, ρ, kayıp faktörü η, yerleşim, gerilme, ' +
    'pürüz) modal banka. f₁ = K·√(E/ρ)·kalınlık/boyut; mod k T60 = 2.2/(η·f₁·oran^üs); ' +
    'darbe-normalize. Materyal adı bir EQ değil, mod/sönüm/temas verisidir.',
  capabilities: ['modal', 'resonant', 'material', 'physical'],
  params: {
    material: {
      type: 'choice',
      choices: MATERIAL_IDS,
      default: 'metal',
      description: 'Materyal profili (tablo: context → materials).',
    },
    size: {
      type: 'number',
      unit: 'm',
      min: 0.02,
      max: 3,
      default: 0.3,
      description: 'Karakteristik boyut L (bükülme: f₁ ∝ 1/L).',
    },
    thickness: {
      type: 'number',
      unit: 'ratio',
      min: 0.005,
      max: 0.3,
      default: 0.05,
      description: 'Kalınlık / boyut oranı (bükülme: f₁ ∝ kalınlık).',
    },
    modes: {
      type: 'number',
      unit: 'count',
      min: 1,
      max: 32,
      default: 12,
      integer: true,
      description: 'Mod sayısı.',
    },
    damping: {
      type: 'number',
      unit: 'ratio',
      min: 0.25,
      max: 4,
      default: 1,
      description: 'Kayıp faktörü çarpanı (materyal η × damping).',
    },
    strike: {
      type: 'number',
      unit: 'normalized',
      min: 0.05,
      max: 0.5,
      default: 0.2,
      description: 'Vuruş konumu (0.5 orta): mod genliği |sin(π·n·x)| ağırlığı.',
    },
  },
  causal: [
    { param: 'size', dimension: 'pitch', direction: -1, note: 'f₁ ∝ 1/L.' },
    { param: 'thickness', dimension: 'pitch', direction: 1, note: 'f₁ ∝ kalınlık.' },
    { param: 'modes', dimension: 'brightness', direction: 1, note: 'Üst modlar eklenir.' },
    { param: 'damping', dimension: 'decay', direction: -1, note: 'Çınlama kısalır.' },
    { param: 'strike', dimension: 'brightness', direction: 1, note: 'Kenara yakın vuruş koyu.' },
  ],
  determinism: { stochastic: true, substreams: ['contact'] },
  resource: {
    model: 'O(kare·mod)',
    workPerFrame: (p) => 5 * Number(p.modes) + 3,
    stateBytes: (p) => 40 * Number(p.modes),
  },
  process(buffer, params, ctx) {
    const material = materialById(choiceOf(params, 'material')) as MaterialProfileV1;
    const f1 = fundamentalHz(material, numberOf(params, 'size'), numberOf(params, 'thickness'));
    const t60 = fundamentalT60(material, f1, numberOf(params, 'damping'));
    const modes = materialModes(material, numberOf(params, 'modes'), numberOf(params, 'strike'));
    const input = buffer.slice();
    buffer.fill(0);
    runModes(input, buffer, modes, f1, t60, ctx.sampleRate, 'impulse');
    addContactNoise(input, buffer, material.contactNoise, f1, ctx.seed('contact'), ctx.sampleRate);
  },
};
