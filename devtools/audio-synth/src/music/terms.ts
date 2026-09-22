import { AudioParamError } from '../guard/errors';
import { checkChoice, checkNumber, checkObject, type ParamObject } from '../guard/read';

/**
 * Müzik katmanının ortak sözlüğü: brief, ThemeBook, program ve analiz aynı
 * kapalı terim kümesini kullanır. Oyun alanı kavramı (düşman, boss, seviye)
 * burada YOKTUR; roller ve kullanım biçimleri geneldir.
 */
export const MUSIC_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const MUSIC_KEY = /^[a-z0-9][a-z0-9-]{0,31}$/;

/**
 * Çalma modeli mastering yolunu BELİRLER (bkz. `mastering.ts`): tek seferlik
 * cue sönümlenip sınırlanır, loop dikişsiz kalır, adaptive stem'ler yalnız
 * ortak doğrusal kazanç alır.
 */
export const PLAYBACK_MODES = ['loop', 'playlistOneShot', 'adaptiveLoop'] as const;
export type MusicPlayback = (typeof PLAYBACK_MODES)[number];

/** Parçanın çalma bağlamı: zemin, öne çıkan cue ya da state'e tepki veren yatak. */
export const MUSIC_USAGES = ['bed', 'cue', 'interactive'] as const;
export type MusicUsage = (typeof MUSIC_USAGES)[number];

/** Ölçünün alt birimi; 3 ya da 5 gibi bir birim notasyonda yoktur. */
export const METER_UNITS = [2, 4, 8, 16] as const;

export const SECTION_ROLES = [
  'intro',
  'build',
  'peak',
  'release',
  'body',
  'bridge',
  'outro',
] as const;
export type SectionRole = (typeof SECTION_ROLES)[number];

export const DENSITY_LEVELS = ['sparse', 'moderate', 'dense'] as const;
export type DensityLevel = (typeof DENSITY_LEVELS)[number];

/** Preset kataloğundaki `InstrumentRole` ile aynı küme; müzik tarafı onu kapalı sözlük sayar. */
export const MUSIC_ROLES = [
  'bass',
  'pad',
  'lead',
  'pluck',
  'keys',
  'bell',
  'texture',
  'percussion',
] as const;
export type MusicRole = (typeof MUSIC_ROLES)[number];

/** Program bir notayı ancak enstrümanın desteklediği artikülasyonla isteyebilir. */
export const ARTICULATIONS = ['sustain', 'short'] as const;
export type Articulation = (typeof ARTICULATIONS)[number];

export const MUSIC_RULE_KINDS = [
  'forbid-interval',
  'forbid-system',
  'forbid-instrument',
  'forbid-role',
  'max-density',
  'max-polyphony',
  'register-limit',
] as const;
export type MusicRuleKind = (typeof MUSIC_RULE_KINDS)[number];

export type MusicRuleV1 =
  | {
      readonly kind: 'forbid-interval';
      readonly semitones: number;
      readonly scope: 'harmonic' | 'melodic';
    }
  | { readonly kind: 'forbid-system'; readonly system: string }
  | { readonly kind: 'forbid-instrument'; readonly instrument: string }
  | { readonly kind: 'forbid-role'; readonly role: MusicRole }
  | {
      readonly kind: 'max-density';
      readonly notesPerBar: number;
      readonly scope: 'program' | 'lane';
    }
  | { readonly kind: 'max-polyphony'; readonly voices: number }
  | {
      readonly kind: 'register-limit';
      readonly role: MusicRole;
      readonly lowMidi: number;
      readonly highMidi: number;
    };

export function checkText(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new AudioParamError(path, 'type', `boş olmayan, en çok ${max} karakterlik metin`, value);
  }
  return value;
}

export function checkPattern(value: unknown, path: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new AudioParamError(path, 'type', `${pattern.source} kalıbına uymalı`, value);
  }
  return value;
}

/**
 * Kuralın kararlı kimliği: override bir kurala ADIYLA değil kimliğiyle
 * başvurur, böylece kitapta sıra değişince override başka bir kurala kaymaz.
 */
export function ruleId(rule: MusicRuleV1): string {
  switch (rule.kind) {
    case 'forbid-interval':
      return `forbid-interval:${rule.scope}:${rule.semitones}`;
    case 'forbid-system':
      return `forbid-system:${rule.system}`;
    case 'forbid-instrument':
      return `forbid-instrument:${rule.instrument}`;
    case 'forbid-role':
      return `forbid-role:${rule.role}`;
    case 'max-density':
      return `max-density:${rule.scope}`;
    case 'max-polyphony':
      return 'max-polyphony';
    case 'register-limit':
      return `register-limit:${rule.role}`;
  }
}

const RULE_KEYS: Record<MusicRuleKind, readonly string[]> = {
  'forbid-interval': ['kind', 'semitones', 'scope'],
  'forbid-system': ['kind', 'system'],
  'forbid-instrument': ['kind', 'instrument'],
  'forbid-role': ['kind', 'role'],
  'max-density': ['kind', 'notesPerBar', 'scope'],
  'max-polyphony': ['kind', 'voices'],
  'register-limit': ['kind', 'role', 'lowMidi', 'highMidi'],
};

export function validateRule(value: unknown, path: string): MusicRuleV1 {
  const head = checkObject(value, path, [
    'kind',
    'semitones',
    'scope',
    'system',
    'instrument',
    'role',
    'notesPerBar',
    'voices',
    'lowMidi',
    'highMidi',
  ]);
  const kind = checkChoice(head.kind, `${path}.kind`, MUSIC_RULE_KINDS);
  const o: ParamObject = checkObject(value, path, RULE_KEYS[kind]);
  switch (kind) {
    case 'forbid-interval':
      return {
        kind,
        semitones: checkNumber(o.semitones, `${path}.semitones`, {
          min: 1,
          max: 11,
          integer: true,
        }),
        scope: checkChoice(o.scope, `${path}.scope`, ['harmonic', 'melodic'] as const),
      };
    case 'forbid-system':
      return { kind, system: checkText(o.system, `${path}.system`, 40) };
    case 'forbid-instrument':
      return { kind, instrument: checkText(o.instrument, `${path}.instrument`, 80) };
    case 'forbid-role':
      return { kind, role: checkChoice(o.role, `${path}.role`, MUSIC_ROLES) };
    case 'max-density':
      return {
        kind,
        notesPerBar: checkNumber(o.notesPerBar, `${path}.notesPerBar`, { above: 0, max: 512 }),
        scope: checkChoice(o.scope, `${path}.scope`, ['program', 'lane'] as const),
      };
    case 'max-polyphony':
      return {
        kind,
        voices: checkNumber(o.voices, `${path}.voices`, { min: 1, max: 64, integer: true }),
      };
    case 'register-limit': {
      const low = checkNumber(o.lowMidi, `${path}.lowMidi`, { min: 0, max: 127, integer: true });
      return {
        kind,
        role: checkChoice(o.role, `${path}.role`, MUSIC_ROLES),
        lowMidi: low,
        highMidi: checkNumber(o.highMidi, `${path}.highMidi`, {
          min: low,
          max: 127,
          integer: true,
        }),
      };
    }
  }
}

/** İnsan okunur kural özeti — rapor ve hata metinlerinde aynı cümle kullanılır. */
export function describeRule(rule: MusicRuleV1): string {
  switch (rule.kind) {
    case 'forbid-interval':
      return `${rule.scope === 'harmonic' ? 'aynı anda' : 'ardışık'} ${
        rule.semitones
      } yarım ton yasak`;
    case 'forbid-system':
      return `${rule.system} dizisi yasak`;
    case 'forbid-instrument':
      return `${rule.instrument} yasak`;
    case 'forbid-role':
      return `${rule.role} rolü yasak`;
    case 'max-density':
      return `${rule.scope === 'lane' ? 'şerit' : 'parça'} başına en çok ${
        rule.notesPerBar
      } nota/ölçü`;
    case 'max-polyphony':
      return `en çok ${rule.voices} eşzamanlı ses`;
    case 'register-limit':
      return `${rule.role} rolü MIDI ${rule.lowMidi}–${rule.highMidi} aralığında kalmalı`;
  }
}
