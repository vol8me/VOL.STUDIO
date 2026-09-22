import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject, type ParamObject } from '../guard/read';
import { hashCanonical, type Sha256 } from '../protocol/canonical';
import { validateMotif, type MotifV1 } from './motif';
import {
  MUSIC_ID,
  MUSIC_ROLES,
  checkPattern,
  checkText,
  ruleId,
  validateRule,
  type MusicRole,
  type MusicRuleV1,
} from './terms';

/**
 * Proje başına müzik kitabı: tonal/ritmik dil, imza aralıkları ve motifler,
 * palet, register ve spektral kimlik, bilinçli kaçınmalar. İki ayrı program
 * aynı kitabı PROGRAMATİK tüketir — kitap metin değil kuraldır.
 *
 * `notes` alanı kasıtlı olarak DENETLENMEZ: "klişe olmasın" gibi bir cümleyi
 * makine sınayamaz; rapor onu "denetlenmedi" diye işaretler ve hiçbir kapı
 * ona dayanmaz.
 */
export const THEME_BOOK_SCHEMA = 'MusicThemeBookV1';

export interface RegisterBandV1 {
  readonly role: MusicRole;
  readonly lowMidi: number;
  readonly highMidi: number;
}

export interface SpectralIdentityV1 {
  readonly role: MusicRole;
  readonly centroidHz: { readonly min: number; readonly max: number };
}

export interface ThemeBookV1 {
  readonly schema: typeof THEME_BOOK_SCHEMA;
  readonly themeBookId: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly tonal: { readonly systems: readonly string[]; readonly roots: readonly string[] };
  readonly rhythm: {
    readonly meters: readonly (readonly [number, number])[];
    readonly bpm: { readonly min: number; readonly max: number };
  };
  readonly signature: {
    readonly intervals: readonly number[];
    readonly motifs: readonly MotifV1[];
  };
  readonly palette: { readonly prefer: readonly string[]; readonly forbid: readonly string[] };
  readonly register: readonly RegisterBandV1[];
  readonly spectral: readonly SpectralIdentityV1[];
  readonly avoid: readonly MusicRuleV1[];
  readonly notes?: readonly string[];
}

export interface ThemeOverrideV1 {
  readonly rule: string;
  readonly reason: string;
}

const KEYS = [
  'schema',
  'themeBookId',
  'version',
  'title',
  'description',
  'tonal',
  'rhythm',
  'signature',
  'palette',
  'register',
  'spectral',
  'avoid',
  'notes',
];

function checkMeter(value: unknown, path: string): [number, number] {
  const meter = checkArray(value, path);
  if (meter.length !== 2) throw new AudioParamError(path, 'type', '[vuruş, birim]', meter.length);
  return [
    checkNumber(meter[0], `${path}[0]`, { min: 1, max: 32, integer: true }),
    checkNumber(meter[1], `${path}[1]`, { min: 2, max: 16, integer: true }),
  ];
}

function checkInstrumentList(value: unknown, path: string): string[] {
  return checkArray(value, path).map((v, i) => checkText(v, `${path}[${i}]`, 80));
}

export function validateThemeBook(value: unknown): ThemeBookV1 {
  const o = checkObject(value, '', KEYS);
  if (o.schema !== THEME_BOOK_SCHEMA) {
    throw new AudioParamError('schema', 'type', THEME_BOOK_SCHEMA, o.schema);
  }
  const tonal = checkObject(o.tonal, 'tonal', ['systems', 'roots']);
  const systems = checkArray(tonal.systems, 'tonal.systems');
  if (systems.length === 0) {
    throw new AudioParamError('tonal.systems', 'range', 'en az bir sistem', 0);
  }
  const rhythm = checkObject(o.rhythm, 'rhythm', ['meters', 'bpm']);
  const meters = checkArray(rhythm.meters, 'rhythm.meters');
  if (meters.length === 0) throw new AudioParamError('rhythm.meters', 'range', 'en az bir ölçü', 0);
  const bpm = checkObject(rhythm.bpm, 'rhythm.bpm', ['min', 'max']);
  const bpmMin = checkNumber(bpm.min, 'rhythm.bpm.min', { min: 20, max: 300 });
  const signature = checkObject(o.signature, 'signature', ['intervals', 'motifs']);
  const palette = checkObject(o.palette, 'palette', ['prefer', 'forbid']);
  const book: ThemeBookV1 = {
    schema: THEME_BOOK_SCHEMA,
    themeBookId: checkPattern(o.themeBookId, 'themeBookId', MUSIC_ID),
    version: checkNumber(o.version, 'version', { min: 1, integer: true }),
    title: checkText(o.title, 'title', 120),
    description: checkText(o.description, 'description', 2000),
    tonal: {
      systems: systems.map((s, i) => checkText(s, `tonal.systems[${i}]`, 40)),
      roots: checkArray(tonal.roots, 'tonal.roots').map((r, i) =>
        checkText(r, `tonal.roots[${i}]`, 8),
      ),
    },
    rhythm: {
      meters: meters.map((m, i) => checkMeter(m, `rhythm.meters[${i}]`)),
      bpm: { min: bpmMin, max: checkNumber(bpm.max, 'rhythm.bpm.max', { min: bpmMin, max: 300 }) },
    },
    signature: {
      intervals: checkArray(signature.intervals, 'signature.intervals').map((v, i) =>
        checkNumber(v, `signature.intervals[${i}]`, { min: 1, max: 24, integer: true }),
      ),
      motifs: checkArray(signature.motifs, 'signature.motifs').map((m, i) =>
        validateMotif(m, `signature.motifs[${i}]`),
      ),
    },
    palette: {
      prefer: checkInstrumentList(palette.prefer, 'palette.prefer'),
      forbid: checkInstrumentList(palette.forbid, 'palette.forbid'),
    },
    register: checkArray(o.register, 'register').map((raw, i) => {
      const r = checkObject(raw, `register[${i}]`, ['role', 'lowMidi', 'highMidi']);
      const low = checkNumber(r.lowMidi, `register[${i}].lowMidi`, {
        min: 0,
        max: 127,
        integer: true,
      });
      return {
        role: checkChoice(r.role, `register[${i}].role`, MUSIC_ROLES),
        lowMidi: low,
        highMidi: checkNumber(r.highMidi, `register[${i}].highMidi`, {
          min: low,
          max: 127,
          integer: true,
        }),
      };
    }),
    spectral: checkArray(o.spectral, 'spectral').map((raw, i) => {
      const s = checkObject(raw, `spectral[${i}]`, ['role', 'centroidHz']);
      const band = checkObject(s.centroidHz, `spectral[${i}].centroidHz`, ['min', 'max']);
      const min = checkNumber(band.min, `spectral[${i}].centroidHz.min`, { min: 20, max: 20000 });
      return {
        role: checkChoice(s.role, `spectral[${i}].role`, MUSIC_ROLES),
        centroidHz: {
          min,
          max: checkNumber(band.max, `spectral[${i}].centroidHz.max`, { min, max: 20000 }),
        },
      };
    }),
    avoid: checkArray(o.avoid, 'avoid').map((r, i) => validateRule(r, `avoid[${i}]`)),
    ...(o.notes === undefined
      ? {}
      : {
          notes: checkArray(o.notes, 'notes').map((n, i) => checkText(n, `notes[${i}]`, 400)),
        }),
  };
  const duplicate = book.avoid.map(ruleId).find((id, i, all) => all.indexOf(id) !== i);
  if (duplicate) {
    throw new AudioParamError('avoid', 'combination', 'aynı kural iki kez', duplicate);
  }
  return book;
}

export function themeBookHash(book: ThemeBookV1): Sha256 {
  return hashCanonical(book);
}

/**
 * Kitabın BÜTÜN makine-denetlenebilir kuralları tek listede: açık `avoid`
 * kayıtları, paletten türeyen enstrüman yasakları ve register bantları.
 * Analizör tek bir kural yüzeyi görür.
 */
export function themeBookRules(book: ThemeBookV1): MusicRuleV1[] {
  return [
    ...book.avoid,
    ...book.palette.forbid.map(
      (instrument): MusicRuleV1 => ({ kind: 'forbid-instrument', instrument }),
    ),
    ...book.register.map(
      (band): MusicRuleV1 => ({
        kind: 'register-limit',
        role: band.role,
        lowMidi: band.lowMidi,
        highMidi: band.highMidi,
      }),
    ),
  ];
}

export function validateOverrides(value: unknown, path: string): ThemeOverrideV1[] {
  return checkArray(value, path).map((raw, i) => {
    const o: ParamObject = checkObject(raw, `${path}[${i}]`, ['rule', 'reason']);
    return {
      rule: checkText(o.rule, `${path}[${i}].rule`, 120),
      reason: checkText(o.reason, `${path}[${i}].reason`, 500),
    };
  });
}
