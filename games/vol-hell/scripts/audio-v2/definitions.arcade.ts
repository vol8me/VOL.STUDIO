import { validateBrief, type AudioBriefV1 } from '@volstudio/audio-synth/program/brief';
import type { AcousticProgramV1 } from '@volstudio/audio-synth/program/schema';
import { analyzeScore } from '@volstudio/audio-synth/music/analyze';
import { expandProgram } from '@volstudio/audio-synth/music/score';
import type { MusicBriefV1 } from '@volstudio/audio-synth/music/brief';
import type { MusicProgramV1 } from '@volstudio/audio-synth/music/programTypes';
import { soundAssets, soundKeys, type SoundEvent } from '../../src/config/sounds';
import { arcadeSignal } from './scores/arcade-signal';
import { eventHorizon } from './scores/event-horizon';
import { surgeProtocol } from './scores/surge-protocol';
import { sovereign } from './scores/sovereign';
import { terminalEcho } from './scores/terminal-echo';
import { firstLight } from './scores/first-light';
import { nullDrift } from './scores/null-drift';
import { deepCurrent } from './scores/deep-current';

/**
 * ARCADE SETİ — VOL.HELL'in yeni ses üretim tanımı.
 *
 * 38 SFX dosyası kanonik job kapısından, 8 müzik/ambiyans parçası kanonik
 * müzik kapısından geçer. Ses tasarımının çekirdeği `source.retro`dur
 * (darbe/üçgen/testere/LFSR, duty, arp, bit/oran indirgeme); tık ve gövde
 * `source.drum` ile, parlak vurgular `source.instrument@2` ile kurulur.
 * Aynı spec + aynı seed her render'da aynı PCM'i verir; yayın kapısı bunu
 * yeniden render ederek doğrular.
 */

import { SPECS, type Layer, type SfxSpec } from './sfxSpecs.arcade';

const node = (primitive: string, params: Record<string, unknown>, version = 1) => ({
  primitive,
  version,
  params,
});

function envelope(attack: number, decay: number, release = 0.025) {
  return node('articulation.envelope', {
    attack,
    hold: 0,
    decay,
    sustainLevel: 0,
    sustain: 0,
    release,
    curve: 'exponential',
  });
}

function layerOf(layer: Layer, index: number, scale: number, stretch: number) {
  const name = `${layer.kind}-${index}`;
  const start = layer.start ?? 0;
  if (layer.kind === 'retro') {
    const hz = layer.hz * scale;
    const params: Record<string, unknown> = {
      waveform: layer.wave,
      frequency: layer.to === undefined ? hz : { gesture: `pitch-${name}` },
    };
    if (layer.duty !== undefined) params.duty = layer.duty;
    if (layer.arp !== undefined) params.arpeggio = layer.arp;
    if (layer.arpRate !== undefined) params.arpRate = layer.arpRate;
    if (layer.bits !== undefined) params.bits = layer.bits;
    if (layer.hold !== undefined) params.rate = layer.hold;
    return {
      name,
      role: 'body',
      startSeconds: start,
      source: node('source.retro', params, 2),
      articulation: envelope(layer.attack ?? 0.002, layer.seconds * stretch),
      ...(layer.gainDb === undefined ? {} : { gainDb: layer.gainDb }),
    };
  }
  if (layer.kind === 'preset') {
    return {
      name,
      role: 'detail',
      startSeconds: start,
      source: node(
        'source.instrument',
        {
          instrument: layer.instrument,
          frequency: layer.hz * scale,
          noteSeconds: layer.seconds * stretch,
          velocity: layer.velocity ?? 0.6,
          articulation: layer.struck ? 'struck' : 'natural',
        },
        2,
      ),
      ...(layer.gainDb === undefined ? {} : { gainDb: layer.gainDb }),
    };
  }
  if (layer.kind === 'drum') {
    const params: Record<string, unknown> = {
      model: layer.model,
      velocity: layer.velocity ?? 0.6,
      decay: (layer.decay ?? 0.3) * stretch,
      tone: layer.tone ?? 0.5,
    };
    if (layer.tune !== undefined) params.tune = layer.tune;
    if (layer.attack !== undefined) params.attack = layer.attack;
    return {
      name,
      role: 'transient',
      startSeconds: start,
      source: node('source.drum', params, 2),
      ...(layer.gainDb === undefined ? {} : { gainDb: layer.gainDb }),
    };
  }
  return {
    name,
    role: 'tail',
    startSeconds: start,
    source: node('source.noise', { color: layer.color }),
    articulation: envelope(layer.attack ?? 0.002, layer.seconds * stretch),
    ...(layer.gainDb === undefined ? {} : { gainDb: layer.gainDb }),
  };
}

function gesturesOf(spec: SfxSpec, scale: number, stretch: number, duration: number) {
  const gestures: Record<string, unknown> = {};
  for (const [index, layer] of spec.layers.entries()) {
    if (layer.kind !== 'retro' || layer.to === undefined) continue;
    const name = `pitch-retro-${index}`;
    const span = Math.min(duration - (layer.start ?? 0) - 0.01, layer.seconds * stretch * 0.92);
    gestures[name] = {
      curve: 'curve.exponential',
      version: 1,
      points: [
        [0, layer.hz * scale],
        [Math.max(0.01, span), layer.to * scale],
      ],
    };
  }
  return gestures;
}

export function buildArcadeSfx(
  event: SoundEvent,
  variant: number,
  asset: string,
): {
  id: string;
  event: SoundEvent;
  brief: AudioBriefV1;
  program: AcousticProgramV1;
  target: unknown;
} {
  const spec = SPECS[event];
  const scale = spec.scales?.[variant] ?? 1;
  const stretch = variant === 1 ? 1.06 : variant === 2 ? 0.94 : 1;
  const layers = spec.layers.map((layer, index) => layerOf(layer, index, scale, stretch));
  const longest = spec.layers.reduce((max, layer) => {
    const tail = (layer.start ?? 0) + ('seconds' in layer ? layer.seconds : layer.decay ?? 0.3);
    return Math.max(max, tail);
  }, 0);
  const duration = spec.duration ?? Math.min(1.8, longest + 0.08);
  const ui = asset.includes('/ui/');
  const engine = asset.split('/').at(-1)!.replace('.ogg', '');
  const id = `arcade-${event.toLowerCase()}-${engine}`;
  const gestures = gesturesOf(spec, scale, stretch, duration);
  const program = {
    schema: 'AcousticProgramV1',
    description: `Arcade ${event} ${engine}: retro çip dokusu, kısa gövde ve parlak vurgu.`,
    sampleRate: 44100,
    channels: 1,
    durationSeconds: duration,
    seed: 202609300 + variant + event.length,
    ...(Object.keys(gestures).length ? { gestures } : {}),
    layers,
    effects: [node('effect.eq-pass', { response: 'highpass', frequency: ui ? 130 : 45, order: 1 })],
    master: {
      normalize: 'peak',
      peakDbfs: spec.peakDbfs ?? -3,
      fadeInSeconds: 0.0015,
      fadeOutSeconds: 0.03,
    },
  } as AcousticProgramV1;
  const brief = validateBrief({
    schema: 'AudioBriefV1',
    kind: 'acoustic',
    subtype: 'sfx',
    id,
    title: `Arcade ${event} ${engine}`,
    intent: program.description,
    provenance: { author: 'agent' },
    assetClass: ui ? 'ui' : 'sfx',
    channels: 1,
    placement: ui ? 'screen' : 'positional',
    durationSeconds: { min: duration - 0.001, max: duration + 0.001 },
    descriptors: ['arcade', 'retro'],
  });
  return {
    id,
    event,
    brief,
    program,
    target: {
      package: '@volstudio/vol-hell',
      asset: `public/${asset}`,
      integration: { runtimeKey: soundKeys[event], loop: false },
    },
  };
}

export interface ArcadeMusicEntry {
  readonly role: 'menu' | 'combat' | 'boss' | 'death' | 'victory' | 'ambience';
  readonly runtimeKey: string;
  readonly loopSeconds: number;
  readonly program: MusicProgramV1;
  readonly brief: MusicBriefV1;
}

const MUSIC_ROLES: Record<string, ArcadeMusicEntry['role']> = {
  'arcade-signal': 'menu',
  'event-horizon': 'menu',
  'surge-protocol': 'combat',
  sovereign: 'boss',
  'terminal-echo': 'death',
  'first-light': 'victory',
  'null-drift': 'ambience',
  'deep-current': 'ambience',
};

function densityLevelOf(notesPerBar: number): MusicBriefV1['rhythmicDensity'] {
  if (notesPerBar <= 4) return 'sparse';
  if (notesPerBar <= 10) return 'moderate';
  return 'dense';
}

function usageOf(program: MusicProgramV1): MusicBriefV1['usage'] {
  if (program.playback === 'adaptiveLoop') return 'interactive';
  if (program.playback === 'playlistOneShot') return 'cue';
  return 'bed';
}

/**
 * Brief alanları programdan TÜRETİLİR: sembolik kapının ölçtüğü yoğunluk ve
 * melodik öne çıkma burada beyan edilir. Elle yazılan bir sayı, kapıyı
 * programla ayrıştıran sessiz bir kopya olurdu.
 */
function musicBriefOf(program: MusicProgramV1): MusicBriefV1 {
  const report = analyzeScore({ program, score: expandProgram(program) });
  const role = MUSIC_ROLES[program.musicId];
  const ambient = role === 'ambience';
  return validateBrief({
    schema: 'AudioBriefV1',
    kind: 'music',
    id: program.musicId,
    title: program.title,
    intent: program.description,
    provenance: { author: 'agent' },
    assetClass: ambient ? 'ambience' : 'music',
    usage: usageOf(program),
    playback: program.playback,
    affect: {
      valence: ambient ? -0.2 : role === 'death' ? -0.6 : 0.3,
      arousal: ambient ? 0.12 : role === 'boss' ? 0.9 : role === 'combat' ? 0.75 : 0.45,
    },
    tempo: { bpm: { min: program.tempo.bpm, max: program.tempo.bpm } },
    meter: [program.meter[0], program.meter[1]],
    tonal: { systems: [program.tonal.system], roots: [program.tonal.root] },
    melodicSalience: report.totals.melodicSalience,
    rhythmicDensity: densityLevelOf(report.totals.notesPerBar),
    form: {
      sections: [...program.sections]
        .sort((a, b) => a.bars[0] - b.bars[0])
        .map((section) => section.role),
    },
    length: { bars: { min: program.bars, max: program.bars } },
    channels: 2,
    avoidNotes: ['arcade setinin estetik kabulü insan dinlemesi bekler'],
  }) as MusicBriefV1;
}

function beatSecondsOf(program: MusicProgramV1): number {
  return (program.bars * program.meter[0] * 60) / program.tempo.bpm;
}

export function buildArcadeMusic(): ArcadeMusicEntry[] {
  const programs = [
    arcadeSignal,
    eventHorizon,
    surgeProtocol,
    sovereign,
    terminalEcho,
    firstLight,
    nullDrift,
    deepCurrent,
  ];
  return programs.map((program) => {
    const runtimeKey =
      program.delivery.runtimeKey ?? `music-${program.musicId.replace(/[^a-z0-9-]/g, '-')}`;
    return {
      role: MUSIC_ROLES[program.musicId],
      runtimeKey,
      loopSeconds: beatSecondsOf(program),
      program,
      brief: musicBriefOf(program),
    };
  });
}

export function buildArcadeSuite() {
  const jobs: ReturnType<typeof buildArcadeSfx>[] = [];
  const coverage: { event: string; asset: string; source: 'job' }[] = [];
  for (const [event, paths] of Object.entries(soundAssets) as [SoundEvent, readonly string[]][]) {
    paths.forEach((asset, variant) => {
      const item = buildArcadeSfx(event, variant, asset);
      jobs.push(item);
      coverage.push({ event, asset: `public/${asset}`, source: 'job' });
    });
  }
  const music = buildArcadeMusic();
  for (const item of music) {
    coverage.push({
      event: item.runtimeKey,
      asset: item.program.delivery.files!.mix,
      source: 'job',
    });
  }
  return { schema: 'ArcadeSuiteV1' as const, jobs, music, coverage };
}
