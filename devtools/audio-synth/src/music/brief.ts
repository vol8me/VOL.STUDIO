import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject, type ParamObject } from '../guard/read';
import {
  DENSITY_LEVELS,
  MUSIC_ID,
  MUSIC_KEY,
  METER_UNITS,
  MUSIC_USAGES,
  PLAYBACK_MODES,
  SECTION_ROLES,
  checkPattern,
  checkText,
  validateRule,
  type DensityLevel,
  type MusicPlayback,
  type MusicRuleV1,
  type MusicUsage,
  type SectionRole,
} from './terms';

/**
 * Müzik isteğinin makine-okunur sözleşmesi. `AudioBriefV1` zarfının
 * `kind: 'music'` dalıdır: kimlik/niyet/provenance ortaktır, alanlar burada
 * yaşar. "Seamless arcade menü loop'u" ile "tek seferlik sinematik cue" aynı
 * belirsiz isteğe düşemez, çünkü çalma modeli ve form ZORUNLU karardır ve
 * varsayılanı yoktur.
 */
export interface MusicBriefEnvelope {
  readonly schema: 'AudioBriefV1';
  readonly id: string;
  readonly title: string;
  readonly intent: string;
  readonly provenance: { readonly author: 'agent' | 'human'; readonly by?: string };
}

export interface MusicAdaptiveStateV1 {
  readonly id: string;
  readonly intensity: number;
}

export interface SpectralProtectionV1 {
  readonly fromHz: number;
  readonly toHz: number;
  readonly reason?: string;
}

export interface MusicBriefV1 extends MusicBriefEnvelope {
  readonly kind: 'music';
  readonly assetClass: 'music';
  readonly usage: MusicUsage;
  readonly playback: MusicPlayback;
  readonly affect: {
    readonly valence: number;
    readonly arousal: number;
    readonly tags?: readonly string[];
  };
  readonly tempo: { readonly bpm: { readonly min: number; readonly max: number } };
  readonly meter: readonly [number, number];
  readonly tonal: { readonly systems: readonly string[]; readonly roots?: readonly string[] };
  readonly melodicSalience: number;
  readonly rhythmicDensity: DensityLevel;
  readonly form: { readonly sections: readonly SectionRole[] };
  readonly length: { readonly bars: { readonly min: number; readonly max: number } };
  readonly channels: 1 | 2;
  /** SFX'e bırakılacak spektral yer; sembolik analiz bunu vekil ölçüyle sınar. */
  readonly spectralPriority?: { readonly protect: readonly SpectralProtectionV1[] };
  /** Yalnız `adaptiveLoop` için: runtime'ın süreceği state'ler. */
  readonly adaptive?: { readonly states: readonly MusicAdaptiveStateV1[] };
  readonly themeBook?: { readonly id: string };
  readonly avoid?: readonly MusicRuleV1[];
  /** Makineyle DENETLENMEYEN kaçınma notları; rapor onları "denetlenmedi" diye işaretler. */
  readonly avoidNotes?: readonly string[];
}

export interface MusicDecisionV1 {
  readonly field: string;
  readonly question: string;
  readonly options?: readonly string[];
}

/**
 * Zorunlu bir KARAR eksik olduğunda atılır. Varsayılanla doldurmak müzik
 * isteğini sessizce başka bir isteğe çevirirdi; bu hata makine-okunur bir
 * karar isteğidir.
 */
export class MusicDecisionError extends AudioParamError {
  readonly decisions: readonly MusicDecisionV1[];

  constructor(decisions: readonly MusicDecisionV1[]) {
    super(
      'brief',
      'required',
      `karar bekleniyor: ${decisions.map((d) => d.field).join(', ')}`,
      decisions.length,
    );
    this.name = 'MusicDecisionError';
    this.decisions = decisions;
  }
}

export const MUSIC_BRIEF_KEYS = [
  'assetClass',
  'usage',
  'playback',
  'affect',
  'tempo',
  'meter',
  'tonal',
  'melodicSalience',
  'rhythmicDensity',
  'form',
  'length',
  'channels',
  'spectralPriority',
  'adaptive',
  'themeBook',
  'avoid',
  'avoidNotes',
];

const DECISIONS: readonly MusicDecisionV1[] = [
  {
    field: 'playback',
    question: 'Parça nasıl çalınacak? Mastering yolu buna bağlıdır.',
    options: [...PLAYBACK_MODES],
  },
  { field: 'usage', question: 'Parçanın çalma bağlamı nedir?', options: [...MUSIC_USAGES] },
  {
    field: 'form',
    question: 'Bölüm sırası nedir? (en az bir bölüm rolü)',
    options: [...SECTION_ROLES],
  },
  { field: 'tempo', question: 'Kabul edilen BPM aralığı nedir?' },
  { field: 'meter', question: 'Ölçü nedir? (ör. [4, 4])' },
  { field: 'length', question: 'Uzunluk kaç ölçü olabilir?' },
];

const MIN_BPM = 20;
const MAX_BPM = 300;
const MAX_SECTIONS = 32;
const MAX_BARS = 512;

function checkRange(
  value: unknown,
  path: string,
  rule: { min: number; max: number; integer?: boolean },
): { min: number; max: number } {
  const o = checkObject(value, path, ['min', 'max']);
  const min = checkNumber(o.min, `${path}.min`, {
    min: rule.min,
    max: rule.max,
    integer: rule.integer,
  });
  const max = checkNumber(o.max, `${path}.max`, { min, max: rule.max, integer: rule.integer });
  return { min, max };
}

function checkMeter(value: unknown, path: string): [number, number] {
  const meter = checkArray(value, path);
  if (meter.length !== 2) {
    throw new AudioParamError(path, 'type', '[vuruş, birim] olmalı', meter.length);
  }
  const beats = checkNumber(meter[0], `${path}[0]`, { min: 1, max: 32, integer: true });
  const unit = checkNumber(meter[1], `${path}[1]`, { min: 2, max: 16, integer: true });
  if (!(METER_UNITS as readonly number[]).includes(unit)) {
    throw new AudioParamError(`${path}[1]`, 'range', `${METER_UNITS.join(', ')} olmalı`, unit);
  }
  return [beats, unit];
}

function checkAdaptive(value: unknown, path: string): { states: MusicAdaptiveStateV1[] } {
  const o = checkObject(value, path, ['states']);
  const states = checkArray(o.states, `${path}.states`);
  if (states.length < 2 || states.length > 16) {
    throw new AudioParamError(`${path}.states`, 'range', '2–16 state', states.length);
  }
  const seen = new Set<string>();
  const parsed = states.map((raw, i) => {
    const s = checkObject(raw, `${path}.states[${i}]`, ['id', 'intensity']);
    const id = checkPattern(s.id, `${path}.states[${i}].id`, MUSIC_KEY);
    if (seen.has(id)) {
      throw new AudioParamError(
        `${path}.states[${i}].id`,
        'combination',
        'state id tekrar etti',
        id,
      );
    }
    seen.add(id);
    return {
      id,
      intensity: checkNumber(s.intensity, `${path}.states[${i}].intensity`, { min: 0, max: 1 }),
    };
  });
  const sorted = [...parsed].sort((a, b) => a.intensity - b.intensity);
  if (sorted[0].intensity !== 0 || sorted[sorted.length - 1].intensity !== 1) {
    throw new AudioParamError(
      `${path}.states`,
      'combination',
      'en düşük state 0, en yüksek state 1 yoğunlukta olmalı',
      sorted.map((s) => s.intensity),
    );
  }
  return { states: parsed };
}

function checkSpectral(value: unknown, path: string): { protect: SpectralProtectionV1[] } {
  const o = checkObject(value, path, ['protect']);
  const bands = checkArray(o.protect, `${path}.protect`);
  if (bands.length === 0 || bands.length > 8) {
    throw new AudioParamError(`${path}.protect`, 'range', '1–8 bant', bands.length);
  }
  return {
    protect: bands.map((raw, i) => {
      const b = checkObject(raw, `${path}.protect[${i}]`, ['fromHz', 'toHz', 'reason']);
      const from = checkNumber(b.fromHz, `${path}.protect[${i}].fromHz`, { min: 20, max: 20000 });
      const to = checkNumber(b.toHz, `${path}.protect[${i}].toHz`, { min: from, max: 20000 });
      return {
        fromHz: from,
        toHz: to,
        ...(b.reason === undefined
          ? {}
          : { reason: checkText(b.reason, `${path}.protect[${i}].reason`, 200) }),
      };
    }),
  };
}

function missingDecisions(o: ParamObject): MusicDecisionV1[] {
  return DECISIONS.filter((d) => o[d.field] === undefined);
}

/** Zarfı doğrulanmış bir belgenin müzik alanlarını okur. */
export function checkMusicBrief(o: ParamObject, envelope: MusicBriefEnvelope): MusicBriefV1 {
  const pending = missingDecisions(o);
  if (pending.length > 0) throw new MusicDecisionError(pending);
  if (o.assetClass !== 'music') {
    throw new AudioParamError('assetClass', 'type', "'music' olmalı", o.assetClass);
  }
  const playback = checkChoice(o.playback, 'playback', PLAYBACK_MODES);
  const affectRaw = checkObject(o.affect ?? {}, 'affect', ['valence', 'arousal', 'tags']);
  const tags =
    affectRaw.tags === undefined
      ? undefined
      : checkArray(affectRaw.tags, 'affect.tags').map((t, i) =>
          checkText(t, `affect.tags[${i}]`, 40),
        );
  const tempo = checkObject(o.tempo, 'tempo', ['bpm']);
  const sections = checkArray(checkObject(o.form, 'form', ['sections']).sections, 'form.sections');
  if (sections.length === 0 || sections.length > MAX_SECTIONS) {
    throw new AudioParamError('form.sections', 'range', `1–${MAX_SECTIONS} bölüm`, sections.length);
  }
  const systems = checkArray(
    checkObject(o.tonal, 'tonal', ['systems', 'roots']).systems,
    'tonal.systems',
  );
  if (systems.length === 0) {
    throw new AudioParamError('tonal.systems', 'range', 'en az bir tonal sistem', 0);
  }
  const roots = checkObject(o.tonal, 'tonal', ['systems', 'roots']).roots;
  if (o.channels !== 1 && o.channels !== 2) {
    throw new AudioParamError('channels', 'type', '1 ya da 2 olmalı', o.channels);
  }
  if (playback === 'adaptiveLoop' && o.adaptive === undefined) {
    throw new MusicDecisionError([
      { field: 'adaptive.states', question: "adaptiveLoop hangi state'lerle sürülecek?" },
    ]);
  }
  if (playback !== 'adaptiveLoop' && o.adaptive !== undefined) {
    throw new AudioParamError(
      'adaptive',
      'combination',
      'yalnız adaptiveLoop state taşır',
      playback,
    );
  }
  return {
    ...envelope,
    kind: 'music',
    assetClass: 'music',
    usage: checkChoice(o.usage, 'usage', MUSIC_USAGES),
    playback,
    affect: {
      valence: checkNumber(affectRaw.valence, 'affect.valence', { min: -1, max: 1 }),
      arousal: checkNumber(affectRaw.arousal, 'affect.arousal', { min: 0, max: 1 }),
      ...(tags ? { tags } : {}),
    },
    tempo: { bpm: checkRange(tempo.bpm, 'tempo.bpm', { min: MIN_BPM, max: MAX_BPM }) },
    meter: checkMeter(o.meter, 'meter'),
    tonal: {
      systems: systems.map((s, i) => checkText(s, `tonal.systems[${i}]`, 40)),
      ...(roots === undefined
        ? {}
        : {
            roots: checkArray(roots, 'tonal.roots').map((r, i) =>
              checkText(r, `tonal.roots[${i}]`, 8),
            ),
          }),
    },
    melodicSalience: checkNumber(o.melodicSalience, 'melodicSalience', { min: 0, max: 1 }),
    rhythmicDensity: checkChoice(o.rhythmicDensity, 'rhythmicDensity', DENSITY_LEVELS),
    form: {
      sections: sections.map((s, i) => checkChoice(s, `form.sections[${i}]`, SECTION_ROLES)),
    },
    length: {
      bars: checkRange((o.length as ParamObject).bars, 'length.bars', {
        min: 1,
        max: MAX_BARS,
        integer: true,
      }),
    },
    channels: o.channels,
    ...(o.spectralPriority === undefined
      ? {}
      : { spectralPriority: checkSpectral(o.spectralPriority, 'spectralPriority') }),
    ...(o.adaptive === undefined ? {} : { adaptive: checkAdaptive(o.adaptive, 'adaptive') }),
    ...(o.themeBook === undefined
      ? {}
      : {
          themeBook: {
            id: checkPattern(
              checkObject(o.themeBook, 'themeBook', ['id']).id,
              'themeBook.id',
              MUSIC_ID,
            ),
          },
        }),
    ...(o.avoid === undefined
      ? {}
      : { avoid: checkArray(o.avoid, 'avoid').map((r, i) => validateRule(r, `avoid[${i}]`)) }),
    ...(o.avoidNotes === undefined
      ? {}
      : {
          avoidNotes: checkArray(o.avoidNotes, 'avoidNotes').map((n, i) =>
            checkText(n, `avoidNotes[${i}]`, 200),
          ),
        }),
  };
}
