import { createNoiseSource } from '../../synthesis/noise';
import {
  fundamentalHz,
  fundamentalT60,
  MATERIAL_IDS,
  materialById,
  type MaterialProfileV1,
} from '../materials';
import { choiceOf, numberOf } from '../params';
import type { SourceEntry } from '../registry';
import { addGrain, scheduleEvents } from './events';
import { materialModes } from './material';
import { runModes } from './resonance';

/**
 * Fiziksel bilgili çarpma/temas (Hertz teorisi, K.L. Johnson "Contact
 * Mechanics", 1985): küresel vurucu (kütle m, materyal A yoğunluğundan
 * yarıçap R) düz gövdeye (materyal B) v hızıyla çarpar.
 *
 * - Etkin modül: 1/E* = (1−ν²)/E_A + (1−ν²)/E_B, ν = 0.3.
 * - Temas süresi: t_c = 2.87·(m² / (R·E*²·v))^(1/5).
 * - En büyük çökme: δ = (15·m·v² / (16·E*·√R))^(2/5); tepe kuvvet
 *   F = (4/3)·E*·√R·δ^(3/2) (N). Kuvvet darbesi sin(πt/t_c)^1.5.
 *
 * Kuvvet gövdenin ve vurucunun materyal modlarını uyarır; pürüz temas
 * penceresine gürültü katar; `debris` temasın ardından küçük parçacık
 * olaylarını (aynı olay motoru) ekler. `stylize` bilinçli sapmadır: temas
 * süresini 0.3 ms'e doğru kısaltır ve hız bağımlılığını sıkıştırır (abartılı
 * "snap"); 0'da tamamen fiziksel.
 */
const POISSON = 0.3;
/** Kuvveti örnek genliğine çeviren sabit ölçek (N → birim); seviye master'da verilir. */
const FORCE_REFERENCE_N = 2000;

export interface ContactPhysics {
  readonly radiusM: number;
  readonly effectiveModulusPa: number;
  readonly contactSeconds: number;
  readonly peakForceN: number;
}

export function hertzContact(
  massKg: number,
  velocity: number,
  striker: MaterialProfileV1,
  body: MaterialProfileV1,
): ContactPhysics {
  const radiusM = Math.cbrt((3 * massKg) / (4 * Math.PI * striker.densityKgM3));
  const compliance =
    (1 - POISSON * POISSON) / (striker.youngModulusGPa * 1e9) +
    (1 - POISSON * POISSON) / (body.youngModulusGPa * 1e9);
  const effectiveModulusPa = 1 / compliance;
  const contactSeconds =
    2.87 * Math.pow((massKg * massKg) / (radiusM * effectiveModulusPa ** 2 * velocity), 0.2);
  const delta = Math.pow(
    (15 * massKg * velocity * velocity) / (16 * effectiveModulusPa * Math.sqrt(radiusM)),
    0.4,
  );
  const peakForceN = (4 / 3) * effectiveModulusPa * Math.sqrt(radiusM) * Math.pow(delta, 1.5);
  return { radiusM, effectiveModulusPa, contactSeconds, peakForceN };
}

const STYLIZED_CONTACT_SECONDS = 0.0003;
const MAX_CONTACT_SECONDS = 0.05;

export const CONTACT: SourceEntry = {
  id: 'source.contact',
  kind: 'source',
  version: 1,
  description:
    'Hertz temas çarpması: hız, kütle ve iki materyalden temas süresi (t_c ∝ v^(−1/5)) ve ' +
    'tepe kuvvet (∝ v^(6/5)); kuvvet gövde (B) ve vurucu (A) materyal modlarını uyarır, ' +
    'pürüz temas gürültüsü, `debris` parçacık olayları ekler. `stylize` bilinçli sapmadır.',
  capabilities: ['impulsive', 'contact', 'physical', 'material', 'stochastic'],
  params: {
    velocity: {
      type: 'number',
      unit: 'm/s',
      min: 0.1,
      max: 30,
      default: 3,
      description: 'Çarpma hızı.',
    },
    mass: {
      type: 'number',
      unit: 'kg',
      min: 0.001,
      max: 100,
      default: 0.5,
      description: 'Vurucu kütlesi (yarıçap materyal A yoğunluğundan).',
    },
    materialA: {
      type: 'choice',
      choices: MATERIAL_IDS,
      default: 'metal',
      description: 'Vurucu materyali.',
    },
    materialB: {
      type: 'choice',
      choices: MATERIAL_IDS,
      default: 'metal',
      description: 'Gövde (çarpılan) materyali.',
    },
    size: {
      type: 'number',
      unit: 'm',
      min: 0.02,
      max: 3,
      default: 0.4,
      description: 'Gövde boyutu (bükülme: f₁ ∝ 1/L).',
    },
    debris: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.2,
      description: 'Temas sonrası parçacık/döküntü olay yoğunluğu.',
    },
    stylize: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0,
      description: 'Fizikten bilinçli sapma: kısa temas + sıkıştırılmış hız yasası.',
    },
  },
  causal: [
    { param: 'velocity', dimension: 'loudness', direction: 1, note: 'F ∝ v^(6/5), t_c kısalır.' },
    { param: 'mass', dimension: 'decay', direction: 1, note: 'Uzun temas, pes vurucu.' },
    { param: 'size', dimension: 'pitch', direction: -1, note: 'Gövde modları pesleşir.' },
    { param: 'debris', dimension: 'density', direction: 1, note: 'Daha çok parçacık.' },
    { param: 'stylize', dimension: 'transient', direction: 1, note: 'Kısa, sert temas.' },
  ],
  determinism: { stochastic: true, substreams: ['contact', 'debris-timing', 'debris-variation'] },
  resource: {
    model: 'O(kare·mod) + O(olay·tanecik)',
    workPerFrame: (p) => 5 * 18 + 4 + 40 * Number(p.debris),
    stateBytes: () => 40 * 18,
  },
  render(out, params, ctx) {
    const striker = materialById(choiceOf(params, 'materialA')) as MaterialProfileV1;
    const body = materialById(choiceOf(params, 'materialB')) as MaterialProfileV1;
    const velocity = numberOf(params, 'velocity');
    const mass = numberOf(params, 'mass');
    const stylize = numberOf(params, 'stylize');
    const physics = hertzContact(mass, velocity, striker, body);
    const tc = Math.min(
      MAX_CONTACT_SECONDS,
      physics.contactSeconds * (1 - stylize) + STYLIZED_CONTACT_SECONDS * stylize,
    );
    const physicalForce = physics.peakForceN / FORCE_REFERENCE_N;
    const force = Math.pow(physicalForce, 1 - 0.6 * stylize);
    const length = Math.max(2, Math.round(tc * ctx.sampleRate));
    const pulse = new Float32Array(out.length);
    const noise = createNoiseSource('noise', ctx.seed('contact'));
    const rough = 0.5 * (striker.contactNoise + body.contactNoise);
    for (let i = 0; i < Math.min(length, pulse.length); i++) {
      const shape = Math.pow(Math.sin((Math.PI * i) / length), 1.5);
      pulse[i] = force * shape * (1 - rough + rough * noise.next());
    }
    const size = numberOf(params, 'size');
    const bodyF1 = fundamentalHz(body, size, 0.05);
    runModes(
      pulse,
      out,
      materialModes(body, 14, 0.23),
      bodyF1,
      fundamentalT60(body, bodyF1, 1),
      ctx.sampleRate,
      'impulse',
    );
    const strikerF1 = fundamentalHz(striker, Math.max(0.02, 2 * physics.radiusM), 0.3);
    const strikerModes = materialModes(striker, 4, 0.5).map((m) => ({
      ...m,
      amplitude: 0.25 * m.amplitude,
    }));
    runModes(
      pulse,
      out,
      strikerModes,
      strikerF1,
      fundamentalT60(striker, strikerF1, 1),
      ctx.sampleRate,
      'impulse',
    );
    for (let i = 0; i < Math.min(length, out.length); i++) out[i] += 0.3 * pulse[i];
    const debris = numberOf(params, 'debris');
    if (debris <= 0) return;
    const tail = Math.min(out.length, Math.round(0.4 * ctx.sampleRate));
    const rate = new Float32Array(out.length);
    for (let i = 0; i < tail; i++) rate[i] = 180 * debris * Math.exp((-6 * i) / tail);
    const events = scheduleEvents(
      {
        rate,
        regularity: 0,
        clustering: 0.3,
        sizeSpread: 0.6,
        levelSpread: 12,
        frames: out.length,
        sampleRate: ctx.sampleRate,
      },
      ctx.random('debris-timing'),
      ctx.random('debris-variation'),
    );
    const grainF = fundamentalHz(body, 0.03, 0.2);
    const grainT60 = Math.min(0.06, fundamentalT60(body, grainF, 1));
    for (const event of events) {
      const f = Math.min(0.4 * ctx.sampleRate, grainF * Math.pow(2, event.size));
      addGrain(out, event.frame, 0.15 * force * event.gain, f, grainT60, 0, ctx.sampleRate);
    }
  },
};
