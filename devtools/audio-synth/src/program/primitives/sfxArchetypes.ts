import type { Random } from '@volstudio/core/random';
import type { AcousticDimension, NumberParamSpec } from '../params';
import type { ArchetypeEntry, ArchetypeLayer, ArchetypeProfiles } from '../registry';

/**
 * SFX archetype'ları — genel katmanları (temas, basınç, blast, elektrik,
 * materyal gövdesi, kuyruk bus'ı) birleştiren AİLE tanımları. Oyuna özel DSP
 * yoktur: tank topu, arcade taret ve bilimkurgu fırlatıcı AYNI archetype'ın
 * farklı makro + stil/materyal profilli programlarıdır. Makro 0'a çekilen
 * isteğe bağlı katman (charge, mekanizma, döküntü, deşarj, kuyruk) programa
 * HİÇ girmez; topoloji sözleşmesi zorunlu katmanları ve isteğe bağlıları
 * ayrı sayar.
 */
type Params = Readonly<Record<string, number>>;

const macro = (description: string, fallback = 0.5): NumberParamSpec => ({
  type: 'number',
  unit: 'normalized',
  min: 0,
  max: 1,
  default: fallback,
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
const vary = (random: Random, spread: number) => Math.pow(2, spread * random.bipolar());
const round = (x: number) => Number(x.toFixed(6));

function head(p: Params, random: Random, sampleRate: number, profiles: ArchetypeProfiles) {
  return {
    schema: 'AcousticProgramV1',
    sampleRate,
    channels: 1,
    durationSeconds: p.durationSeconds,
    seed: Math.floor(random.next() * 0xffff_ffff),
    ...(profiles.style === undefined ? {} : { style: profiles.style }),
    master: { normalize: 'peak', peakDbfs: -3, fadeOutSeconds: 0.05 },
  };
}

function sfx(
  name: string,
  description: string,
  params: Readonly<Record<string, NumberParamSpec>>,
  causal: readonly (readonly [string, AcousticDimension, 1 | -1, string])[],
  topology: readonly ArchetypeLayer[],
  profiles: readonly ('style' | 'material')[],
  expand: ArchetypeEntry['expand'],
  constraint: ArchetypeEntry['constraint'] = () => null,
): ArchetypeEntry {
  return {
    id: `archetype.${name}`,
    kind: 'archetype',
    version: 1,
    description,
    capabilities: ['archetype', 'sfx', 'deterministic-variation'],
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
    macros: [],
    variation: {
      policy:
        'k. varyasyon archetype:<id>/variation:<k> alt akışından: frekans/süre için 2^(±0.1…0.2) ' +
        'sınırlı sapma ve program tohumu; isteğe bağlı katman kümesi makrolarla belirlenir, varyasyonla değil.',
      guaranteed: 8,
    },
    profiles,
    constraint,
    expand,
  };
}

function tailBus(tail: number, size: number, random: Random) {
  return {
    space: {
      effects: [
        node('effect.eq-pass', { response: 'highpass', frequency: 90 }),
        node('effect.reverb', {
          decay: round((0.9 + 3 * size) * vary(random, 0.1)),
          roomSize: 0.8,
          damp: 0.45,
          amount: 1,
          preDelay: round(0.01 + 0.03 * size),
        }),
      ],
      gainDb: round(-12 + 10 * tail),
    },
  };
}

const sends = (on: boolean, levelDb: number) => (on ? { sends: [{ bus: 'space', levelDb }] } : {});

export const PRESSURE_EVENT = sfx(
  'pressure-event',
  'PressureEvent: şok (transient) + Friedlander gövde (low-end) + türbülanslı blast + döküntü + ' +
    'deşarj + kuyruk bus’ı AYRI katmanlar. Tank/havan atışı, büyük patlama ve enerji deşarjı ' +
    'aynı ailenin programlarıdır; `transient` ve `body` birbirinden bağımsız ölçülür.',
  {
    size: macro('Olay ölçeği: pozitif faz, gövde perdesi, blast ve kuyruk süresi.'),
    transient: macro('Şok cephesi sertliği (yalnız şok katmanı).'),
    body: macro('Alçak frekans gövde seviyesi (yalnız gövde katmanı).'),
    blast: macro('Türbülanslı blast seviyesi (0 → katman yok).'),
    debris: macro('Döküntü olayları (0 → katman yok).', 0.3),
    discharge: macro('Elektrik deşarjı (0 → katman yok).', 0),
    tail: macro('Kuyruk send seviyesi (0 → bus yok).', 0.4),
    durationSeconds: duration(2.5),
  },
  [
    ['size', 'low-end', 1, 'Uzun pozitif faz, pes gövde.'],
    ['transient', 'transient', 1, 'Keskin şok.'],
    ['body', 'low-end', 1, 'Gövde seviyesi.'],
    ['blast', 'noisiness', 1, 'Blast seviyesi.'],
    ['debris', 'density', 1, 'Döküntü.'],
    ['discharge', 'roughness', 1, 'Ark çatırtısı.'],
    ['tail', 'wetness', 1, 'Kuyruk.'],
    ['durationSeconds', 'duration', 1, 'Süre.'],
  ],
  [
    { layer: 'shock', chain: ['source.pressure-wave'] },
    { layer: 'body', chain: ['source.pressure-wave'] },
    { layer: 'blast?', chain: ['source.blast'] },
    { layer: 'debris?', chain: ['source.micro-events', 'articulation.envelope'] },
    { layer: 'discharge?', chain: ['source.electrical', 'articulation.envelope'] },
  ],
  ['style'],
  (p, random, sampleRate, profiles) => {
    const d = p.durationSeconds;
    const positive = round(0.004 * Math.pow(2, 5 * p.size) * vary(random, 0.1));
    const tail = p.tail > 0;
    const layers: Record<string, unknown>[] = [
      {
        name: 'shock',
        role: 'transient',
        mechanism: 'pressure',
        source: node('source.pressure-wave', {
          positive: round(Math.min(0.01, positive / 3)),
          decay: 3,
          rise: round(0.004 * (1 - p.transient) ** 2),
          body: 0,
        }),
        gainDb: round(-12 + 12 * p.transient),
        ...sends(tail, -6),
      },
      {
        name: 'body',
        role: 'body',
        mechanism: 'pressure',
        source: node('source.pressure-wave', {
          positive,
          decay: 1.2,
          rise: 0.004,
          body: round(p.body),
          bodyHz: round(90 * Math.pow(2, -1.5 * p.size) * vary(random, 0.1)),
          bodyDecay: round(0.3 + 1.5 * p.size),
        }),
        ...sends(tail, -9),
      },
    ];
    if (p.blast > 0) {
      layers.push({
        name: 'blast',
        role: 'texture',
        mechanism: 'explosion',
        source: node('source.blast', {
          decay: round(Math.min(d, 0.3 * Math.pow(2, 3 * p.size)) * vary(random, 0.1)),
          brightness: round(0.45 + 0.3 * p.transient),
          darkening: 0.7,
          crackle: round(0.2 + 0.3 * p.debris),
        }),
        gainDb: round(-30 + 30 * p.blast),
        ...sends(tail, -3),
      });
    }
    if (p.debris > 0) {
      layers.push({
        name: 'debris',
        role: 'detail',
        mechanism: 'debris',
        startSeconds: round(Math.min(d * 0.5, 0.05 + 0.1 * p.size)),
        source: node('source.micro-events', {
          event: 'click',
          rate: round(40 + 260 * p.debris),
          clustering: 0.4,
          pitch: round(0.6 * vary(random, 0.15)),
        }),
        articulation: node('articulation.envelope', {
          attack: 0.002,
          decay: round(0.4 + 0.8 * p.size),
          sustainLevel: 0,
          release: 0.1,
          curve: 'exponential',
        }),
        gainDb: round(-26 + 12 * p.debris),
      });
    }
    if (p.discharge > 0) {
      layers.push({
        name: 'discharge',
        role: 'transient',
        mechanism: 'discharge',
        durationSeconds: round(Math.min(d, 0.25 + 0.5 * p.discharge)),
        source: node('source.electrical', {
          mains: round(120 * vary(random, 0.15)),
          charge: -1,
          arcs: round(0.4 + 0.6 * p.discharge),
          buzz: 0.7,
          ring: 0.4,
        }),
        articulation: node('articulation.envelope', {
          attack: 0.001,
          decay: 0.2,
          sustainLevel: 0.3,
          release: 0.1,
          curve: 'exponential',
        }),
        gainDb: round(-18 + 14 * p.discharge),
      });
    }
    return {
      ...head(p, random, sampleRate, profiles),
      layers,
      ...(tail ? { buses: tailBus(p.tail, p.size, random) } : {}),
    };
  },
  (p) =>
    p.durationSeconds < 0.4 + 0.6 * p.size
      ? 'süre ölçeğe göre çok kısa (≥ 0.4 + 0.6·size sn)'
      : null,
);

export const LAUNCHER = sfx(
  'launcher',
  'Launcher: isteğe bağlı charge + tetik + namlu (Friedlander + blast) + materyal gövdesi + ' +
    'sürgü/mekanizma + kovan döküntüsü + kuyruk bus’ı. Tank topu, arcade taret ve bilimkurgu ' +
    'fırlatıcı aynı archetype’ın stil/materyal profilli programlarıdır; oyuna özel DSP yok.',
  {
    caliber: macro('Kalibre: namlu pozitif fazı, gövde boyutu, blast süresi.'),
    charge: macro('Atış öncesi elektrik şarjı (0 → katman yok).', 0),
    mechanism: macro('Tetik + sürgü mekanizması (0 → katmanlar yok).'),
    debris: macro('Kovan/döküntü (0 → katman yok).', 0.3),
    tail: macro('Kuyruk send seviyesi (0 → bus yok).', 0.4),
    durationSeconds: duration(2.5),
  },
  [
    ['caliber', 'low-end', 1, 'Büyük kalibre: pes, uzun.'],
    ['charge', 'duration', 1, 'Şarj süresi.'],
    ['mechanism', 'density', 1, 'Mekanizma sesleri.'],
    ['debris', 'density', 1, 'Kovan döküntüsü.'],
    ['tail', 'wetness', 1, 'Kuyruk.'],
    ['durationSeconds', 'duration', 1, 'Süre.'],
  ],
  [
    { layer: 'charge?', chain: ['source.electrical', 'articulation.envelope'] },
    { layer: 'trigger?', chain: ['source.contact'] },
    { layer: 'muzzle', chain: ['source.pressure-wave'] },
    { layer: 'blast', chain: ['source.blast'] },
    { layer: 'body', chain: ['exciter.impact', 'resonator.material'] },
    { layer: 'bolt?', chain: ['source.contact'] },
    { layer: 'shell?', chain: ['source.contact'] },
  ],
  ['style', 'material'],
  (p, random, sampleRate, profiles) => {
    const material = profiles.material ?? 'metal';
    const chargeSeconds = p.charge > 0 ? round(0.15 + 0.6 * p.charge) : 0;
    const shot = round(chargeSeconds + (p.mechanism > 0 ? 0.05 : 0));
    const tail = p.tail > 0;
    const layers: Record<string, unknown>[] = [];
    if (p.charge > 0) {
      layers.push({
        name: 'charge',
        role: 'tonal',
        mechanism: 'electrical',
        durationSeconds: round(chargeSeconds + 0.05),
        source: node('source.electrical', {
          mains: round(90 * vary(random, 0.15)),
          charge: round(0.5 + 0.5 * p.charge),
          hum: 0.7,
          buzz: 0.5,
          arcs: 0.1,
          ring: 0.3,
          ringHz: round(900 * vary(random, 0.15)),
        }),
        articulation: node('articulation.envelope', {
          attack: round(chargeSeconds * 0.8),
          decay: 0.02,
          sustainLevel: 0.5,
          release: 0.03,
          curve: 'cosine',
        }),
        gainDb: round(-10 + 6 * p.charge),
      });
    }
    if (p.mechanism > 0) {
      layers.push({
        name: 'trigger',
        role: 'mechanism',
        mechanism: 'mechanical',
        startSeconds: round(Math.max(0, shot - 0.045)),
        source: node('source.contact', {
          materialA: 'metal',
          materialB: material,
          mass: 0.02,
          velocity: round(1 + 1.5 * p.mechanism),
          size: 0.08,
          debris: 0,
        }),
        gainDb: round(-24 + 10 * p.mechanism),
      });
    }
    layers.push(
      {
        name: 'muzzle',
        role: 'transient',
        mechanism: 'pressure',
        startSeconds: shot,
        source: node('source.pressure-wave', {
          positive: round(0.003 * Math.pow(2, 4 * p.caliber) * vary(random, 0.1)),
          decay: 1.4,
          rise: 0.0002,
          body: round(0.3 + 0.6 * p.caliber),
          bodyHz: round(110 * Math.pow(2, -1.5 * p.caliber) * vary(random, 0.1)),
          bodyDecay: round(0.2 + 0.8 * p.caliber),
        }),
        ...sends(tail, -6),
      },
      {
        name: 'blast',
        role: 'body',
        mechanism: 'explosion',
        startSeconds: shot,
        source: node('source.blast', {
          decay: round((0.15 + 0.9 * p.caliber) * vary(random, 0.1)),
          brightness: round(0.75 - 0.3 * p.caliber),
          darkening: 0.6,
          crackle: 0.15,
        }),
        gainDb: round(-14 + 6 * p.caliber),
        ...sends(tail, -3),
      },
      {
        name: 'body',
        role: 'body',
        mechanism: 'impact',
        startSeconds: shot,
        source: node('exciter.impact', { contactTime: 0.0006, roughness: 0.3 }),
        resonators: [
          node('resonator.material', {
            material,
            size: round((0.3 + 1.5 * p.caliber) * vary(random, 0.1)),
            thickness: 0.04,
            modes: 16,
          }),
        ],
        gainDb: -8,
        ...sends(tail, -10),
      },
    );
    if (p.mechanism > 0) {
      layers.push({
        name: 'bolt',
        role: 'mechanism',
        mechanism: 'mechanical',
        startSeconds: round(shot + 0.12 + 0.25 * p.caliber),
        source: node('source.contact', {
          materialA: 'metal',
          materialB: material,
          mass: round(0.1 + 0.6 * p.caliber),
          velocity: round(1.5 + 1.5 * p.mechanism),
          size: round(0.15 + 0.3 * p.caliber),
          debris: 0.05,
        }),
        gainDb: round(-20 + 8 * p.mechanism),
      });
    }
    if (p.debris > 0) {
      layers.push({
        name: 'shell',
        role: 'detail',
        mechanism: 'debris',
        startSeconds: round(shot + 0.35 + 0.2 * p.caliber),
        source: node('source.contact', {
          materialA: 'metal',
          materialB: 'stone',
          mass: round(0.01 + 0.2 * p.caliber),
          velocity: 2.5,
          size: 0.1,
          debris: round(0.4 + 0.6 * p.debris),
        }),
        gainDb: round(-26 + 10 * p.debris),
      });
    }
    return {
      ...head(p, random, sampleRate, profiles),
      layers,
      ...(tail ? { buses: tailBus(p.tail, p.caliber, random) } : {}),
    };
  },
  (p) => {
    const need = (p.charge > 0 ? 0.15 + 0.6 * p.charge : 0) + 0.8 + 0.4 * p.caliber;
    return p.durationSeconds < need
      ? `süre en az ${need.toFixed(2)} sn olmalı (şarj + atış + mekanizma)`
      : null;
  },
);

export const SFX_ARCHETYPES = [PRESSURE_EVENT, LAUNCHER] as const;
