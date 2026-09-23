import { createNoiseSource } from '../../synthesis/noise';
import { StateVariableFilter } from '../../synthesis/svf';
import {
  fundamentalHz,
  fundamentalT60,
  MATERIAL_IDS,
  materialBrightness,
  materialById,
  type MaterialProfileV1,
} from '../materials';
import { choiceOf, numberOf, sampleAt, signalOf } from '../params';
import type { SourceEntry } from '../registry';
import { addGrain, scheduleEvents } from './events';
import { materialModes } from './material';
import { runModes } from './resonance';

/**
 * Sürtünme / kazıma / yuvarlanma temas sentezi. Sürekli temas gürültüsü
 * YANINDA, yüzey pürüzünün tepelerine takılmaktan doğan mikro-temas olayları
 * (van den Doel, Kry & Pai 2001 "FoleyAutomatic" modelinin olay-hızı fikri):
 *
 * - Mikro-temas hızı λ = v / tane aralığı (1 m/sn, 1 mm → 1000 olay/sn);
 *   yuvarlanmada ek olarak dönme hızı v/(2π·r) (r = 3 cm) düzenli darbe verir.
 * - Sürekli gürültünün bant merkezi hızla yükselir (300 + 4000·v^0.6 Hz,
 *   materyal parlaklığıyla ölçekli); seviyesi basınç·v^0.7.
 * - Toplam, materyalin küçük gövde modlarından geçer (renk + kuyruk).
 *
 * Hız gesture ile sürülür; zaman ve spektrum hızla birlikte değişir, bir
 * sample döngüsünün tekrarı değildir.
 */
const ROLL_RADIUS_M = 0.03;

export const FRICTION: SourceEntry = {
  id: 'source.friction',
  kind: 'source',
  version: 1,
  description:
    'Sürtünme/kazıma/yuvarlanma: sürekli temas gürültüsü (bant merkezi hızla yükselir) + ' +
    'mikro-temas olayları (λ = v / tane aralığı) + yuvarlanma darbeleri (v/2πr), materyal ' +
    'gövdesinden geçer. Hız gesture ile sürülür.',
  capabilities: [
    'friction',
    'scrape',
    'rolling',
    'contact',
    'material',
    'stochastic',
    'time-varying',
  ],
  params: {
    speed: {
      type: 'number',
      unit: 'm/s',
      min: 0,
      max: 5,
      default: 0.6,
      automatable: true,
      description: 'Bağıl kayma/yuvarlanma hızı.',
    },
    pressure: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      description: 'Normal kuvvet (temas yükü).',
    },
    roughness: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      description: 'Yüzey pürüzü: mikro-temas olaylarının payı ve sertliği.',
    },
    granularity: {
      type: 'number',
      unit: 'mm',
      min: 0.05,
      max: 20,
      default: 1,
      description: 'Yüzey tane aralığı (olay hızı = v / aralık).',
    },
    material: {
      type: 'choice',
      choices: MATERIAL_IDS,
      default: 'metal',
      description: 'Temas eden yüzeylerin materyali (gövde modları + tane rengi).',
    },
    rolling: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0,
      description: '0 kayma, 1 yuvarlanma (dönme darbeleri, az sürekli gürültü).',
    },
  },
  causal: [
    { param: 'speed', dimension: 'density', direction: 1, note: 'Olay hızı ve bant yükselir.' },
    { param: 'pressure', dimension: 'loudness', direction: 1, note: 'Temas yükü.' },
    { param: 'roughness', dimension: 'roughness', direction: 1, note: 'Takılma olayları.' },
    { param: 'granularity', dimension: 'density', direction: -1, note: 'Seyrek tane.' },
    { param: 'rolling', dimension: 'irregularity', direction: -1, note: 'Düzenli dönme darbesi.' },
  ],
  determinism: { stochastic: true, substreams: ['friction', 'timing', 'variation'] },
  resource: {
    model: 'O(kare·mod) + O(olay·tanecik)',
    workPerFrame: (p) =>
      12 + 5 * 10 + 0.12 * Math.min(4000, (Number(p.speed) * 1000) / Number(p.granularity)),
    stateBytes: () => 400,
  },
  render(out, params, ctx) {
    const sr = ctx.sampleRate;
    const speed = signalOf(params, 'speed');
    const pressure = numberOf(params, 'pressure');
    const roughness = numberOf(params, 'roughness');
    const granularity = numberOf(params, 'granularity') * 1e-3;
    const rolling = numberOf(params, 'rolling');
    const material = materialById(choiceOf(params, 'material')) as MaterialProfileV1;
    const brightness = 0.4 + materialBrightness(material);
    const rate = new Float32Array(out.length);
    for (let i = 0; i < rate.length; i++) {
      const v = sampleAt(speed, i);
      rate[i] =
        Math.min(4000, v / granularity) * (1 - 0.8 * rolling) +
        (rolling * v) / (2 * Math.PI * ROLL_RADIUS_M);
    }
    const drive = new Float32Array(out.length);
    const noise = createNoiseSource('noise', ctx.seed('friction'));
    const band = new StateVariableFilter(sr);
    for (let i = 0; i < drive.length; i++) {
      const v = sampleAt(speed, i);
      const center = (300 + 4000 * Math.pow(v, 0.6)) * brightness;
      const level = pressure * Math.pow(v, 0.7) * (1 - 0.7 * rolling);
      drive[i] = level * band.bandpass(noise.next(), center, 0.9);
    }
    const events = scheduleEvents(
      {
        rate,
        regularity: 0.6 * rolling,
        clustering: 0.2 * roughness,
        sizeSpread: 0.5,
        levelSpread: 12 * (1 - rolling),
        frames: out.length,
        sampleRate: sr,
      },
      ctx.random('timing'),
      ctx.random('variation'),
    );
    const grainF = fundamentalHz(material, Math.max(0.02, granularity * 20), 0.2);
    const grainT60 = Math.min(0.03, fundamentalT60(material, grainF, 1));
    for (const event of events) {
      const v = sampleAt(speed, event.frame);
      const gain = (0.1 + roughness) * pressure * Math.min(1, v) * event.gain;
      const f = Math.min(0.4 * sr, grainF * Math.pow(2, event.size) * (0.7 + 0.6 * Math.min(1, v)));
      addGrain(drive, event.frame, gain, f, grainT60, 0, sr);
    }
    out.set(drive);
    const bodyF1 = fundamentalHz(material, 0.25, 0.05);
    const modes = materialModes(material, 10, 0.31).map((m) => ({
      ...m,
      amplitude: 0.35 * m.amplitude,
    }));
    runModes(drive, out, modes, bodyF1, fundamentalT60(material, bodyF1, 1), sr, 'impulse');
  },
};
