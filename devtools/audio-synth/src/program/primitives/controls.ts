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
function control(
  name: string,
  macro: string,
  description: string,
  dimension: AcousticDimension,
  direction: 1 | -1,
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
    causal: [{ param: 'value', dimension, direction, note: description }],
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
    'gövde büyüdükçe modlar ve boşluk pesleşir, çınlama uzar, formantlar düşer.',
    'pitch',
    -1,
    [
      t('resonator.modal', 'frequency', 'octaves', -1),
      t('resonator.modal', 'decay', 'octaves', 0.5),
      t('resonator.cavity', 'volume', 'octaves', 2),
      t('resonator.formant', 'tract', 'octaves', 0.5),
    ],
  ),
  control(
    'tension',
    'tension',
    'gerilim arttıkça modlar tizleşir, zar tıkı parlaklaşır.',
    'pitch',
    1,
    [
      t('resonator.modal', 'frequency', 'octaves', 0.5),
      t('exciter.membrane', 'tension', 'linear', 0.4),
    ],
  ),
  control(
    'pressure',
    'pressure',
    'basınç arttıkça akış gürültüsü ve genlik yükselir.',
    'loudness',
    1,
    [
      t('exciter.turbulence', 'pressure', 'linear', 0.45),
      t('articulation.amplitude', 'level', 'linear', 6),
    ],
  ),
  control(
    'wetness',
    'wetness',
    'ıslaklık arttıkça üst modlar hızlı söner, akış gürültüsü koyulaşır.',
    'brightness',
    -1,
    [
      t('resonator.modal', 'damping', 'linear', 1),
      t('exciter.turbulence', 'brightness', 'linear', -0.3),
    ],
  ),
  control(
    'viscosity',
    'viscosity',
    'viskozite arttıkça çınlama ve boşluk rezonansı kısalır.',
    'decay',
    -1,
    [t('resonator.modal', 'decay', 'octaves', -1.5), t('resonator.cavity', 'q', 'octaves', -1)],
  ),
  control(
    'roughness',
    'roughness',
    'pürüzlülük arttıkça temas gürültülü, akış parlak olur.',
    'noisiness',
    1,
    [
      t('exciter.impact', 'roughness', 'linear', 0.45),
      t('exciter.turbulence', 'brightness', 'linear', 0.3),
      t('resonator.modal', 'inharmonicity', 'linear', 0.01),
    ],
  ),
  control(
    'cavity-size',
    'cavitySize',
    'boşluk büyüdükçe Helmholtz ve formant rezonansları düşer.',
    'pitch',
    -1,
    [
      t('resonator.cavity', 'volume', 'octaves', 3),
      t('resonator.formant', 'tract', 'octaves', 0.5),
    ],
  ),
  control(
    'airiness',
    'airiness',
    'havalılık arttıkça nefes gürültüsü artar ve parlaklaşır.',
    'noisiness',
    1,
    [
      t('exciter.turbulence', 'brightness', 'linear', 0.4),
      t('exciter.turbulence', 'pressure', 'linear', 0.3),
    ],
  ),
  control(
    'instability',
    'instability',
    'kararsızlık arttıkça bütün stokastik modülasyon derinlikleri büyür.',
    'irregularity',
    1,
    [],
    { span: 2 },
  ),
];

/** Makro çarpanı/ofseti: c = 0.5'te nötr. */
export function applyLaw(law: 'octaves' | 'linear', span: number, base: number, c: number): number {
  const x = 2 * c - 1;
  return law === 'octaves' ? base * Math.pow(2, span * x) : base + span * x;
}
