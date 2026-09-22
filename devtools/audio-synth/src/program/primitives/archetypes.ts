import type { Random } from '@volstudio/core/random';
import type { AcousticDimension, NumberParamSpec } from '../params';
import type { ArchetypeEntry, ArchetypeLayer } from '../registry';

/**
 * AcousticArchetype: ham preset değil, bir AİLE. Topoloji (katman → yapı
 * taşı zinciri) sabittir; makro parametreleri kontrol/parametrelere eşlenir;
 * varyasyon `archetype:<id>/variation:<k>` alt akışından türeyen sınırlı
 * sapmalardır (perde konturu, oranlar, formant hedefleri, tohum). Varyasyon
 * topolojiyi ASLA değiştirmez — yapısal sözleşme testlerle kilitlidir.
 * Hiçbir archetype "gerçek bir hayvan gibi" iddiası taşımaz; ölçülen
 * özellikleri testlerde, dinleme dosyaları `archetype-audition` betiğindedir.
 */
type Params = Readonly<Record<string, number>>;

const macro = (description: string): NumberParamSpec => ({
  type: 'number',
  unit: 'normalized',
  min: 0,
  max: 1,
  default: 0.5,
  description,
});

const duration = (fallback: number): NumberParamSpec => ({
  type: 'number',
  unit: 's',
  min: 0.3,
  max: 8,
  default: fallback,
  description: 'Program süresi.',
});

const node = (primitive: string, params: Record<string, unknown> = {}) => ({
  primitive,
  version: 1,
  params,
});
const curve = (name: string, points: (readonly [number, number])[]) => ({
  curve: `curve.${name}`,
  version: 1,
  points,
});
const control = (name: string, value: number) => ({
  control: `control.${name}`,
  version: 1,
  value,
});
/** Sınırlı oran sapması: 2^(±spread). */
const vary = (random: Random, spread: number) => Math.pow(2, spread * random.bipolar());
const pick = <T>(random: Random, options: readonly T[]): T =>
  options[Math.min(options.length - 1, Math.floor(random.next() * options.length))];

function head(p: Params, random: Random, sampleRate: number) {
  return {
    schema: 'AcousticProgramV1',
    sampleRate,
    channels: 1,
    durationSeconds: p.durationSeconds,
    seed: Math.floor(random.next() * 0xffff_ffff),
    master: { normalize: 'peak', peakDbfs: -3, fadeOutSeconds: 0.02 },
  };
}

function archetype(
  name: string,
  description: string,
  params: Readonly<Record<string, NumberParamSpec>>,
  causal: readonly (readonly [string, AcousticDimension, 1 | -1, string])[],
  topology: readonly ArchetypeLayer[],
  macros: readonly string[],
  expand: ArchetypeEntry['expand'],
  constraint: ArchetypeEntry['constraint'] = () => null,
): ArchetypeEntry {
  return {
    id: `archetype.${name}`,
    kind: 'archetype',
    version: 1,
    description,
    capabilities: ['archetype', 'organic', 'deterministic-variation'],
    params,
    causal: causal.map(([param, dimension, direction, note]) => ({
      param,
      dimension,
      direction,
      note,
    })),
    determinism: { stochastic: true, substreams: ['variation:<k>'] },
    resource: {
      model: 'genişletilen programın bütçesi',
      workPerFrame: () => 0,
      stateBytes: () => 0,
    },
    topology,
    macros: macros.map((m) => `control.${m}`),
    variation: {
      policy:
        'k. varyasyon archetype:<id>/variation:<k> alt akışından: perde/oran/formant için ' +
        '2^(±0.1…0.5) sınırlı sapma, kontur seçimi ve program tohumu; topoloji sabit.',
      guaranteed: 8,
    },
    constraint,
    expand,
  };
}

const SIZE = macro('Gövde boyutu → control.body-size.');

export const FLUID_CREATURE = archetype(
  'fluid-creature',
  'FluidCreature: kabarcık nüfusu + akışkan nabzı + kısık, formantlı glottal ses. Islaklık ' +
    'kabarcık sıklığını, viskozite kabarcık sönümünü, etkinlik nabız ve olay hızını sürer.',
  {
    size: SIZE,
    wetness: macro('Islaklık → control.wetness.'),
    viscosity: macro('Viskozite → control.viscosity.'),
    activity: macro('Olay ve nabız hızı.'),
    durationSeconds: duration(2.5),
  },
  [
    ['size', 'pitch', -1, 'Gövde büyür, perde düşer.'],
    ['wetness', 'density', 1, 'Daha çok kabarcık.'],
    ['viscosity', 'decay', -1, 'Kabarcık kuyruğu kısalır.'],
    ['activity', 'density', 1, 'Daha sık nabız/olay.'],
    ['durationSeconds', 'duration', 1, 'Süre.'],
  ],
  [
    { layer: 'bubbles', chain: ['source.bubbles'] },
    { layer: 'gurgle', chain: ['source.gurgle'] },
    { layer: 'voice', chain: ['source.glottal', 'resonator.formant', 'articulation.amplitude'] },
  ],
  ['body-size', 'wetness', 'viscosity'],
  (p, random, sampleRate) => {
    const d = p.durationSeconds;
    const f0 = 70 * vary(random, 0.3);
    const [a, b, c] = pick(random, [
      [1, 1.3, 0.9],
      [0.9, 1.1, 1.4],
      [1.2, 0.95, 1],
    ]);
    return {
      ...head(p, random, sampleRate),
      gestures: {
        pitch: curve('spline', [
          [0, f0 * a],
          [d / 2, f0 * b],
          [d, f0 * c],
        ]),
        swell: curve('cosine', [
          [0, -30],
          [d * 0.3, -6 + 2 * random.bipolar()],
          [d, -24],
        ]),
      },
      controls: [
        control('body-size', p.size),
        control('wetness', p.wetness),
        control('viscosity', p.viscosity),
      ],
      layers: [
        {
          name: 'bubbles',
          source: node('source.bubbles', {
            rate: (5 + 40 * p.activity) * vary(random, 0.3),
            radius: 2,
            sizeSpread: 0.5,
          }),
        },
        {
          name: 'gurgle',
          source: node('source.gurgle', {
            pulseRate: (0.8 + 3 * p.activity) * vary(random, 0.3),
            bubblesPerPulse: 5,
          }),
          gainDb: -3,
        },
        {
          name: 'voice',
          source: node('source.glottal', {
            frequency: { gesture: 'pitch' },
            breath: 0.4,
            subharmonic: 0.2,
            jitter: 0.01,
          }),
          resonators: [
            node('resonator.formant', {
              f1: 400 * vary(random, 0.15),
              f2: 900 * vary(random, 0.15),
              f3: 2200,
              f4: 3100,
            }),
          ],
          articulation: node('articulation.amplitude', { level: { gesture: 'swell' } }),
          gainDb: -6,
        },
      ],
    };
  },
  (p) =>
    p.durationSeconds * (0.8 + 3 * p.activity) * Math.pow(2, -0.3) < 1.5
      ? 'süre en düşük nabız hızında en az 1.5 nabız taşımalı (durationSeconds ya da activity artırılmalı)'
      : null,
);

export const MEMBRANE_CREATURE = archetype(
  'membrane-creature',
  'MembraneCreature: burkulan zar (timbal) tık dizisi → gerilmiş zar modal gövde → genlik ' +
    'eğrisi; arkada boşluktan geçen hafif nefes. Etkinlik tık hızını, gerilim modları sürer.',
  {
    size: SIZE,
    tension: macro('Gerilim → control.tension.'),
    activity: macro('Timbal tık hızı.'),
    durationSeconds: duration(2),
  },
  [
    ['size', 'pitch', -1, 'Zar büyür, modlar düşer.'],
    ['tension', 'pitch', 1, 'Gerilim modları yükseltir.'],
    ['activity', 'density', 1, 'Daha hızlı tık dizisi.'],
    ['durationSeconds', 'duration', 1, 'Süre.'],
  ],
  [
    {
      layer: 'tymbal',
      chain: ['exciter.membrane', 'resonator.modal', 'articulation.amplitude'],
    },
    { layer: 'breath', chain: ['exciter.turbulence', 'resonator.cavity'] },
  ],
  ['body-size', 'tension'],
  (p, random, sampleRate) => {
    const d = p.durationSeconds;
    const rate = (20 + 120 * p.activity) * vary(random, 0.25);
    return {
      ...head(p, random, sampleRate),
      gestures: {
        pulse: curve('spline', [
          [0, rate * 0.8],
          [d, rate * 1.2 * vary(random, 0.1)],
        ]),
        env: curve('linear', [
          [0, -40],
          [0.05 * d, 0],
          [0.8 * d, -2 + random.bipolar()],
          [d, -40],
        ]),
      },
      controls: [control('body-size', p.size), control('tension', p.tension)],
      layers: [
        {
          name: 'tymbal',
          source: node('exciter.membrane', {
            rate: { gesture: 'pulse' },
            tension: 0.5,
            buckleDecay: 0.003,
          }),
          resonators: [
            node('resonator.modal', {
              layout: 'membrane',
              frequency: 1800 * vary(random, 0.2),
              modes: 8,
              decay: 0.08,
              brightness: 0.6,
            }),
          ],
          articulation: node('articulation.amplitude', { level: { gesture: 'env' } }),
        },
        {
          name: 'breath',
          source: node('exciter.turbulence', { pressure: 0.3, brightness: 0.6 }),
          resonators: [
            node('resonator.cavity', {
              volume: 0.05 * vary(random, 0.3),
              neckArea: 1,
              neckLength: 1,
              q: 8,
            }),
          ],
          gainDb: -18,
        },
      ],
    };
  },
);

export const AIR_SAC_CREATURE = archetype(
  'air-sac-creature',
  'AirSacCreature: düşük perdeli glottal ses → şişip inen hava kesesi (Helmholtz boşluk, hacim ' +
    'gesture’ı) → formant; keseden geçen hava akışı. Şişme boşluk makrosunu, pürüz alt-harmoniği sürer.',
  {
    size: SIZE,
    inflation: macro('Kese büyüklüğü → control.cavity-size.'),
    roughness: macro('Pürüz → control.roughness (alt-harmonik).'),
    durationSeconds: duration(1.8),
  },
  [
    ['size', 'pitch', -1, 'Gövde büyür, perde düşer.'],
    ['inflation', 'pitch', -1, 'Büyük kese, düşük rezonans.'],
    ['roughness', 'roughness', 1, 'Alt-harmonik artar.'],
    ['durationSeconds', 'duration', 1, 'Süre.'],
  ],
  [
    {
      layer: 'call',
      chain: ['source.glottal', 'resonator.cavity', 'resonator.formant', 'articulation.amplitude'],
    },
    { layer: 'rush', chain: ['exciter.turbulence', 'resonator.cavity'] },
  ],
  ['body-size', 'cavity-size', 'roughness'],
  (p, random, sampleRate) => {
    const d = p.durationSeconds;
    const f0 = 90 * vary(random, 0.25);
    const sac = curve('cosine', [
      [0, 0.2],
      [0.6 * d, 1.2 * vary(random, 0.2)],
      [d, 0.4],
    ]);
    return {
      ...head(p, random, sampleRate),
      gestures: {
        pitch: curve('spline', [
          [0, f0],
          [0.4 * d, f0 * 1.25 * vary(random, 0.1)],
          [d, f0 * 0.8],
        ]),
        sac,
        env: curve('cosine', [
          [0, -40],
          [0.15 * d, 0],
          [0.85 * d, -3],
          [d, -40],
        ]),
      },
      controls: [
        control('body-size', p.size),
        control('cavity-size', p.inflation),
        control('roughness', p.roughness),
      ],
      layers: [
        {
          name: 'call',
          source: node('source.glottal', {
            frequency: { gesture: 'pitch' },
            subharmonic: 0.35,
            breath: 0.25,
            tension: 0.3,
            jitter: 0.008,
          }),
          resonators: [
            node('resonator.cavity', {
              volume: { gesture: 'sac' },
              neckArea: 6,
              neckLength: 3,
              q: 6,
            }),
            node('resonator.formant', { f1: 350, f2: 800, f3: 2000, f4: 2900 }),
          ],
          articulation: node('articulation.amplitude', { level: { gesture: 'env' } }),
        },
        {
          name: 'rush',
          source: node('exciter.turbulence', { pressure: 0.25, brightness: 0.3 }),
          resonators: [node('resonator.cavity', { volume: { gesture: 'sac' }, q: 4 })],
          gainDb: -20,
        },
      ],
    };
  },
);

export const CHITIN_CLICKER = archetype(
  'chitin-clicker',
  'ChitinClicker: kümelenebilen tık olayları → yüksek, kısa sönümlü serbest-çubuk modları ' +
    '(kitin plaka). Etkinlik olay hızını, patlamalılık kümelenmeyi, sertlik sönüm/parlaklığı sürer.',
  {
    size: SIZE,
    activity: macro('Tık olay hızı.'),
    burstiness: macro('Kümelenme.'),
    hardness: macro('Plaka sertliği: çınlama ve parlaklık.'),
    durationSeconds: duration(1.5),
  },
  [
    ['size', 'pitch', -1, 'Büyük plaka, düşük mod.'],
    ['activity', 'density', 1, 'Daha çok tık.'],
    ['burstiness', 'density', 1, 'Kalabalık kümeler.'],
    ['hardness', 'brightness', 1, 'Sert plaka parlak çınlar.'],
    ['durationSeconds', 'duration', 1, 'Süre.'],
  ],
  [{ layer: 'clicks', chain: ['source.micro-events', 'resonator.modal'] }],
  ['body-size'],
  (p, random, sampleRate) => ({
    ...head(p, random, sampleRate),
    controls: [control('body-size', p.size)],
    layers: [
      {
        name: 'clicks',
        source: node('source.micro-events', {
          event: 'click',
          rate: (4 + 40 * p.activity) * vary(random, 0.3),
          clustering: 0.1 + 0.8 * p.burstiness,
          regularity: 0.3 * random.next(),
          sizeSpread: 0.4,
        }),
        resonators: [
          node('resonator.modal', {
            layout: 'bar',
            frequency: 2500 * vary(random, 0.2),
            modes: 5,
            decay: 0.03 + 0.2 * p.hardness,
            brightness: 0.4 + 0.5 * p.hardness,
          }),
        ],
      },
    ],
  }),
);

export const RESONANT_SHELL = archetype(
  'resonant-shell',
  'ResonantShell: tek vuruş → paralel modal gövde (çubuk ya da zar yerleşimi) + iç boşluk; ' +
    'küçük oda. Sertlik temas süresini, sönüm viskozite makrosunu, pürüz temas gürültüsünü sürer.',
  {
    size: SIZE,
    hardness: macro('Tokmak sertliği: kısa temas.'),
    damping: macro('Sönüm → control.viscosity.'),
    roughness: macro('Temas pürüzü → control.roughness.'),
    durationSeconds: duration(2),
  },
  [
    ['size', 'pitch', -1, 'Büyük kabuk, düşük mod.'],
    ['hardness', 'brightness', 1, 'Kısa temas, geniş bant.'],
    ['damping', 'decay', -1, 'Çınlama kısalır.'],
    ['roughness', 'noisiness', 1, 'Pürüzlü temas.'],
    ['durationSeconds', 'duration', 1, 'Süre.'],
  ],
  [{ layer: 'strike', chain: ['exciter.impact', 'resonator.modal', 'resonator.cavity'] }],
  ['body-size', 'viscosity', 'roughness'],
  (p, random, sampleRate) => ({
    ...head(p, random, sampleRate),
    controls: [
      control('body-size', p.size),
      control('viscosity', p.damping),
      control('roughness', p.roughness),
    ],
    layers: [
      {
        name: 'strike',
        source: node('exciter.impact', {
          contactTime: 0.004 - 0.0035 * p.hardness,
          roughness: 0.2,
        }),
        routing: 'parallel',
        resonators: [
          node('resonator.modal', {
            layout: pick(random, ['bar', 'membrane']),
            frequency: 400 * vary(random, 0.25),
            modes: 12,
            decay: 1.2,
            brightness: 0.4,
          }),
          node('resonator.cavity', { volume: 0.3 * vary(random, 0.3), q: 20 }),
        ],
      },
    ],
    effects: [node('effect.reverb', { decay: 0.6 * vary(random, 0.2), amount: 0.12 })],
  }),
);

export const VOCAL_TUBE = archetype(
  'vocal-tube',
  'VocalTube: glottal kaynak → açık/kapalı tüp dalga kılavuzu (ses yolu benzeri tek harmonik ' +
    'rezonanslar) → genlik eğrisi. Boyut tüpü uzatıp perdeyi düşürür, gerilim ve havalılık kaynağı sürer.',
  {
    size: SIZE,
    tension: macro('Gerilim → control.tension.'),
    airiness: macro('Havalılık → control.airiness.'),
    durationSeconds: duration(1.2),
  },
  [
    ['size', 'pitch', -1, 'Uzun tüp, düşük perde.'],
    ['tension', 'pitch', 1, 'Gergin kaynak, yüksek perde.'],
    ['airiness', 'noisiness', 1, 'Nefes artar.'],
    ['durationSeconds', 'duration', 1, 'Süre.'],
  ],
  [{ layer: 'voice', chain: ['source.glottal', 'resonator.tube', 'articulation.amplitude'] }],
  ['body-size', 'tension', 'airiness'],
  (p, random, sampleRate) => {
    const d = p.durationSeconds;
    const f0 = 180 * vary(random, 0.3);
    const [a, b, c] = pick(random, [
      [1, 1.2, 0.85],
      [0.85, 1, 1.2],
      [1.1, 0.9, 0.95],
    ]);
    return {
      ...head(p, random, sampleRate),
      gestures: {
        pitch: curve('spline', [
          [0, f0 * a],
          [d / 2, f0 * b],
          [d, f0 * c],
        ]),
        env: curve('cosine', [
          [0, -40],
          [0.1 * d, 0],
          [0.8 * d, -2],
          [d, -40],
        ]),
      },
      controls: [
        control('body-size', p.size),
        control('tension', p.tension),
        control('airiness', p.airiness),
      ],
      layers: [
        {
          name: 'voice',
          source: node('source.glottal', {
            frequency: { gesture: 'pitch' },
            jitter: 0.006,
            breath: 0.1,
            tension: 0.35,
          }),
          resonators: [
            node('resonator.tube', {
              length: 0.17 * vary(random, 0.15),
              ends: 'open-closed',
              loss: 0.5,
              decay: 0.05,
            }),
          ],
          articulation: node('articulation.amplitude', { level: { gesture: 'env' } }),
        },
      ],
    };
  },
);

export const ARCHETYPES: readonly ArchetypeEntry[] = [
  FLUID_CREATURE,
  MEMBRANE_CREATURE,
  AIR_SAC_CREATURE,
  CHITIN_CLICKER,
  RESONANT_SHELL,
  VOCAL_TUBE,
];
