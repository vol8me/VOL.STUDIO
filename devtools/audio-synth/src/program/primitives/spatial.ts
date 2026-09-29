import { AIR_TAPS, applyAirAbsorption, applyWidth } from '../../effects/air';
import { convolutionWork } from '../../effects/convolution';
import { numberOf } from '../params';
import type { EffectEntry } from '../registry';

/**
 * Uzaklık ve yerleşim ilkelleri: kaynağı değiştirmeden onu
 * uzağa ya da dar bir görüntüye taşır. İşleme katmanının (`treatment`)
 * profilleri bunlarla kurulur; bus ve master zincirinde de kullanılabilir.
 */
const DETERMINISTIC = { stochastic: false, substreams: [] } as const;

const AIR_ABSORPTION: EffectEntry = {
  id: 'effect.air-absorption',
  kind: 'effect',
  version: 1,
  timeBased: false,
  linear: true,
  description:
    'ISO 9613-1 atmosferik soğurma: α(f)·mesafe dB zayıflatan minimum fazlı FIR (homomorfik ' +
    'tasarım, 1024 dal). Yalnız havanın frekansa bağlı soğurması; mesafe zayıflaması (1/r) ' +
    've yansıma ayrıdır. 20 °C, 101.325 kPa.',
  capabilities: ['space', 'distance', 'filter', 'processing'],
  params: {
    distance: {
      type: 'number',
      unit: 'm',
      min: 0,
      max: 2000,
      default: 50,
      description: 'Kaynak–dinleyici mesafesi.',
    },
    humidity: {
      type: 'number',
      unit: 'normalized',
      min: 0.1,
      max: 1,
      default: 0.5,
      description: 'Bağıl nem (0–1); 20 °C’de nem arttıkça tiz soğurması azalır.',
    },
  },
  causal: [
    { param: 'distance', dimension: 'brightness', direction: -1, note: 'Tizler söner.' },
    { param: 'humidity', dimension: 'brightness', direction: 1, note: 'Tiz soğurması azalır.' },
  ],
  determinism: DETERMINISTIC,
  resource: {
    model: 'O(kare·(log B + dal/B))',
    workPerFrame: () => convolutionWork(AIR_TAPS),
    stateBytes: () => 32 * 2 * AIR_TAPS,
    bytesPerFrame: () => 8,
  },
  probe: { params: { distance: 400 } },
  process(channels, params, ctx) {
    applyAirAbsorption(
      channels,
      numberOf(params, 'distance'),
      numberOf(params, 'humidity'),
      ctx.sampleRate,
    );
  },
};

const WIDTH: EffectEntry = {
  id: 'effect.width',
  kind: 'effect',
  version: 1,
  timeBased: false,
  linear: true,
  description:
    'Orta/yan stereo genişliği: orta korunur, yan ölçeklenir (0 aynı iki kanal, 1 etkisiz, ' +
    '>1 genişler). Mono tamponda etkisiz; mono uyumunu yerleşim QA’sı ölçer.',
  capabilities: ['stereo', 'processing'],
  params: {
    width: {
      type: 'number',
      unit: 'ratio',
      min: 0,
      max: 2,
      default: 1,
      description: 'Yan kanal çarpanı.',
    },
  },
  causal: [{ param: 'width', dimension: 'width', direction: 1, note: 'Görüntü genişler.' }],
  determinism: DETERMINISTIC,
  resource: { model: 'O(kare)', workPerFrame: () => 1, stateBytes: () => 0 },
  probe: { channels: 2, params: { width: 0.3 } },
  process(channels, params) {
    applyWidth(channels, numberOf(params, 'width'));
  },
};

export const SPATIAL = [AIR_ABSORPTION, WIDTH] as const;
