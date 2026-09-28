import { synthesize } from '../../engine/synthesize';
import { getPreset } from '../../presets';
import { choiceOf, numberOf } from '../params';
import type { SourceEntry } from '../registry';

const INSTRUMENTS = ['cello', 'preparedPiano', 'doubleBass', 'additivePad'] as const;
const INSTRUMENTS_V2 = [
  ...INSTRUMENTS,
  'brightLead',
  'crystalBell',
  'electricPiano2',
  'subBass',
] as const;

export const INSTRUMENT: SourceEntry = {
  id: 'source.instrument',
  kind: 'source',
  version: 1,
  description:
    'Sürümlü kısa enstrüman olayı: mevcut preset sentezi, nota süresi ve velocity. ' +
    'Preset stereo çıkışı mono toplanır; konum ve oda programın kararıdır.',
  capabilities: ['pitched', 'instrument', 'transient', 'deterministic-variation'],
  renderContract: Object.fromEntries(
    INSTRUMENTS.map((instrument) => [instrument, getPreset(instrument, 220, 1)]),
  ),
  params: {
    instrument: {
      type: 'choice',
      choices: INSTRUMENTS,
      default: 'preparedPiano',
      description: 'Mevcut sentez preset’i; render sözleşmesinde parametreleri kilitlidir.',
    },
    frequency: {
      type: 'number',
      unit: 'Hz',
      min: 40,
      max: 2000,
      default: 220,
      belowNyquist: true,
      description: 'Notanın temel perdesi.',
    },
    noteSeconds: {
      type: 'number',
      unit: 's',
      min: 0.01,
      max: 30,
      default: 0.2,
      description: 'Preset zarfını belirleyen nota süresi; program kuyruğu ayrıca sınırlar.',
    },
    velocity: {
      type: 'number',
      unit: 'normalized',
      min: 0.05,
      max: 1,
      default: 0.7,
      description: 'Kaynak genliği; normalize edilmez.',
    },
    articulation: {
      type: 'choice',
      choices: ['natural', 'struck'],
      default: 'natural',
      description: 'Preset zarfı ya da kısa, vurulmuş tel zarfı; tını kaynağı aynı kalır.',
    },
  },
  causal: [
    { param: 'frequency', dimension: 'pitch', direction: 1, note: 'Notanın temel perdesi.' },
    { param: 'noteSeconds', dimension: 'decay', direction: 1, note: 'Nota zarfı uzar.' },
    { param: 'velocity', dimension: 'loudness', direction: 1, note: 'Doğrusal kaynak genliği.' },
  ],
  determinism: { stochastic: true, substreams: ['voice'] },
  resource: {
    model: 'O(kare·preset harmonikleri)',
    workPerFrame: () => 1,
    setupWork: (params, sampleRate) => (Number(params.noteSeconds) + 2) * sampleRate * 1000,
    stateBytes: (params, sampleRate) => (Number(params.noteSeconds) + 2) * sampleRate * 64,
    bytesPerFrame: () => 64,
  },
  render(out, params, ctx) {
    const preset = getPreset(
      choiceOf(params, 'instrument'),
      numberOf(params, 'frequency'),
      numberOf(params, 'noteSeconds'),
    );
    const rendered = synthesize({
      ...preset,
      sampleRate: ctx.sampleRate,
      seed: ctx.seed('voice'),
      normalize: false,
      reverb: undefined,
      delay: undefined,
      ...(choiceOf(params, 'articulation') === 'struck'
        ? {
            envelope: {
              attack: 0.002,
              decay: numberOf(params, 'noteSeconds') * 0.6,
              sustain: 0,
              release: 0.03,
              sustainLevel: 0,
              curve: 'exponential' as const,
            },
          }
        : {}),
    });
    const velocity = numberOf(params, 'velocity');
    for (let i = 0; i < out.length; i++) {
      let sample = 0;
      for (const channel of rendered.channels) sample += channel[i] ?? 0;
      out[i] = (sample / rendered.channels.length) * velocity;
    }
  },
};

/** Parlak presetler yeni sürümde açılır; v1'in render sözleşmesi değişmez. */
export const INSTRUMENT_V2: SourceEntry = {
  ...INSTRUMENT,
  version: 2,
  renderContract: Object.fromEntries(
    INSTRUMENTS_V2.map((instrument) => [instrument, getPreset(instrument, 220, 1)]),
  ),
  params: {
    ...INSTRUMENT.params,
    instrument: {
      type: 'choice',
      choices: INSTRUMENTS_V2,
      default: 'preparedPiano',
      description: 'Sürümlü preset; v2 parlak elektronik enstrümanları da kapsar.',
    },
  },
};
