import type { AcousticDimension } from '../params';
import type { ControlEntry, ControlTarget } from '../registry';

/**
 * Agent-facing makro akustik kontroller. Bir makro yeni DSP taşımaz ve
 * yalnız bir takma ad da değildir: registry'de yazılı NEDENSEL eşlemesiyle
 * programdaki yapı taşlarının fiziksel parametrelerini birlikte sürer.
 * Değer c ∈ [0, 1], 0.5 nötrdür; gesture ile zamanla değişebilir (hedef
 * parametre otomasyon alıyorsa). Programda hiçbir hedefi olmayan makro
 * render'dan önce reddedilir — sessizce etkisiz kalmaz.
 */
interface Effect {
  readonly dimension: AcousticDimension;
  readonly direction: 1 | -1;
  readonly note: string;
}

function control(
  name: string,
  macro: string,
  description: string,
  effects: readonly Effect[],
  targets: readonly ControlTarget[],
  modulationDepth?: { readonly span: number },
): ControlEntry {
  return {
    id: `control.${name}`,
    kind: 'control',
    version: 1,
    description: `${macro}: ${description}`,
    capabilities: ['macro', 'semantic', ...(modulationDepth ? ['modulation-depth'] : [])],
    params: {
      value: {
        type: 'number',
        unit: 'normalized',
        min: 0,
        max: 1,
        default: 0.5,
        automatable: true,
        description: 'Makro konumu; 0.5 nötr (hedefler değişmez).',
      },
    },
    causal: effects.map((effect) => ({ param: 'value', ...effect })),
    determinism: { stochastic: false, substreams: [] },
    resource: {
      model: 'O(kare·hedef) otomasyonda',
      workPerFrame: () => targets.length,
      stateBytes: () => 0,
    },
    targets,
    ...(modulationDepth ? { modulationDepth } : {}),
  };
}

const effect = (dimension: AcousticDimension, direction: 1 | -1, note: string): Effect => ({
  dimension,
  direction,
  note,
});

const t = (
  primitive: string,
  param: string,
  law: 'octaves' | 'linear',
  span: number,
): ControlTarget => ({
  primitive,
  param,
  law,
  span,
});

export const CONTROLS: readonly ControlEntry[] = [
  control(
    'body-size',
    'bodySize',
    'gövde büyüdükçe modlar, boşluk, tüp ve ses perdesi pesleşir, çınlama uzar, formantlar ve kabarcıklar büyür.',
    [effect('pitch', -1, 'Mod, boşluk, tüp ve glottal perde düşer.')],
    [
      t('resonator.modal', 'frequency', 'octaves', -1),
      t('resonator.modal', 'decay', 'octaves', 0.5),
      t('resonator.cavity', 'volume', 'octaves', 2),
      t('resonator.formant', 'tract', 'octaves', 0.5),
      t('resonator.tube', 'length', 'octaves', 1),
      t('source.glottal', 'frequency', 'octaves', -1),
      t('source.bubble', 'radius', 'octaves', 1),
      t('source.bubbles', 'radius', 'octaves', 1),
      t('source.gurgle', 'radius', 'octaves', 1),
    ],
  ),
  control(
    'tension',
    'tension',
    'gerilim arttıkça modlar ve ses tizleşir, zar tıkı ve glottal eğim parlaklaşır.',
    [effect('pitch', 1, 'Mod ve glottal perde yükselir.')],
    [
      t('resonator.modal', 'frequency', 'octaves', 0.5),
      t('exciter.membrane', 'tension', 'linear', 0.4),
      t('source.glottal', 'frequency', 'octaves', 0.3),
      t('source.glottal', 'tension', 'linear', 0.4),
    ],
  ),
  control(
    'pressure',
    'pressure',
    'basınç arttıkça akış gürültüsü ve genlik yükselir.',
    [effect('loudness', 1, 'Türbülans basıncı ve artikülasyon seviyesi.')],
    [
      t('exciter.turbulence', 'pressure', 'linear', 0.45),
      t('articulation.amplitude', 'level', 'linear', 6),
    ],
  ),
  control(
    'wetness',
    'wetness',
    'ıslaklık arttıkça üst modlar hızlı söner, akış koyulaşır, kabarcık/damla sıklaşır.',
    [
      effect('brightness', -1, 'Modal üst mod sönümü artar.'),
      effect('density', 1, 'Kabarcık nüfusu ve nabız kümesi sıklaşır.'),
    ],
    [
      t('resonator.modal', 'damping', 'linear', 1),
      t('exciter.turbulence', 'brightness', 'linear', -0.3),
      t('source.bubbles', 'rate', 'octaves', 2),
      t('source.gurgle', 'bubblesPerPulse', 'linear', 8),
    ],
  ),
  control(
    'viscosity',
    'viscosity',
    'viskozite arttıkça çınlama, boşluk rezonansı ve kabarcık kuyruğu kısalır.',
    [effect('decay', -1, 'T60 ve kabarcık sönümü.')],
    [
      t('resonator.modal', 'decay', 'octaves', -1.5),
      t('resonator.cavity', 'q', 'octaves', -1),
      t('source.bubble', 'damping', 'octaves', 1.5),
      t('source.bubbles', 'damping', 'octaves', 1.5),
      t('source.gurgle', 'damping', 'octaves', 1.5),
    ],
  ),
  control(
    'roughness',
    'roughness',
    'pürüzlülük arttıkça temas gürültülü, akış parlak, ses alt-harmonikli olur.',
    [
      effect('noisiness', 1, 'Temas pürüzü ve akış bandı genişler.'),
      effect('roughness', 1, 'Glottal alt-harmonik (f₀/2) artar.'),
    ],
    [
      t('exciter.impact', 'roughness', 'linear', 0.45),
      t('exciter.turbulence', 'brightness', 'linear', 0.3),
      t('resonator.modal', 'inharmonicity', 'linear', 0.01),
      t('source.glottal', 'subharmonic', 'linear', 0.45),
    ],
  ),
  control(
    'cavity-size',
    'cavitySize',
    'boşluk büyüdükçe Helmholtz, tüp ve formant rezonansları düşer.',
    [effect('pitch', -1, 'Boşluk/tüp rezonansı düşer.')],
    [
      t('resonator.cavity', 'volume', 'octaves', 3),
      t('resonator.formant', 'tract', 'octaves', 0.5),
      t('resonator.tube', 'length', 'octaves', 1),
    ],
  ),
  control(
    'airiness',
    'airiness',
    'havalılık arttıkça nefes gürültüsü artar ve parlaklaşır.',
    [effect('noisiness', 1, 'Türbülans ve glottal aspirasyon.')],
    [
      t('exciter.turbulence', 'brightness', 'linear', 0.4),
      t('exciter.turbulence', 'pressure', 'linear', 0.3),
      t('source.glottal', 'breath', 'linear', 0.4),
    ],
  ),
  control(
    'instability',
    'instability',
    'kararsızlık arttıkça bütün stokastik modülasyon derinlikleri ve glottal jitter büyür.',
    [effect('irregularity', 1, 'Modülasyon derinliği ve periyot sapması.')],
    [t('source.glottal', 'jitter', 'octaves', 2)],
    { span: 2 },
  ),
];

/** Makro çarpanı/ofseti: c = 0.5'te nötr. */
export function applyLaw(law: 'octaves' | 'linear', span: number, base: number, c: number): number {
  const x = 2 * c - 1;
  return law === 'octaves' ? base * Math.pow(2, span * x) : base + span * x;
}
