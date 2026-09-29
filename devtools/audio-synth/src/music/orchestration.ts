import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject } from '../guard/read';
import type { ResolvedInstrumentV1 } from './instrumentResolve';
import { MUSIC_KEY, checkPattern, checkText } from './terms';

/**
 * Orkestrasyon: şeridin MÜZİKAL görevi (bas, zemin, ritim, armoni, karşı
 * ezgi, ezgi, doku, vurgu) enstrümanın adından ayrıdır. Palet görevleri
 * enstrümana bağlar; aynı score başka bir paletle çalındığında yazılan
 * notalar, armoni ve olay kimlikleri değişmez, yalnız seslendiren değişir.
 *
 * Görev bantları (register ve yoğunluk) yönlendiricidir: analiz sapmayı
 * raporlar ama kapıyı düşürmez — "bas bu aralıkta çalar" bir kural değil,
 * besteciye ve agent'a verilen ölçülü bir işarettir.
 */
export const ORCHESTRATION_ROLES = [
  'bass',
  'foundation',
  'rhythm',
  'harmony',
  'counterline',
  'lead',
  'texture',
  'accent',
] as const;
export type OrchestrationRole = (typeof ORCHESTRATION_ROLES)[number];

export const ORCHESTRATION_POLICY_VERSION = 1;

/** Görev başına seslenen register (MIDI, `null` perdesiz/serbest) ve nota/ölçü bandı. */
export const ROLE_BANDS: Readonly<
  Record<
    OrchestrationRole,
    {
      readonly register: readonly [number, number] | null;
      readonly density: readonly [number, number];
    }
  >
> = {
  bass: { register: [28, 55], density: [0.5, 8] },
  foundation: { register: [36, 64], density: [0.25, 4] },
  rhythm: { register: null, density: [2, 32] },
  harmony: { register: [48, 76], density: [0.5, 12] },
  counterline: { register: [52, 81], density: [1, 16] },
  lead: { register: [60, 91], density: [1, 16] },
  texture: { register: null, density: [0, 8] },
  accent: { register: null, density: [0, 4] },
};

export interface PaletteSlotV1 {
  readonly instrument: string;
  /**
   * Görevin bu paletteki seslendirme kaydırması (yarım ton) ya da `auto`:
   * yazılan notaları enstrümanın tercih ettiği register'a en iyi oturtan
   * oktav. Yazılan perde değişmez; kaydırma seslenene eklenir.
   */
  readonly transposition?: number | 'auto';
  readonly gainDb?: number;
}

export interface PaletteV1 {
  readonly id: string;
  readonly description?: string;
  readonly roles: Readonly<Partial<Record<OrchestrationRole, PaletteSlotV1>>>;
}

const MAX_PALETTES = 8;

export function validatePalettes(
  value: unknown,
  checkInstrument: (id: unknown, path: string) => string,
): PaletteV1[] {
  const list = checkArray(value, 'palettes');
  if (list.length === 0 || list.length > MAX_PALETTES) {
    throw new AudioParamError('palettes', 'range', `1–${MAX_PALETTES} palet`, list.length);
  }
  const seen = new Set<string>();
  return list.map((raw, i) => {
    const path = `palettes[${i}]`;
    const o = checkObject(raw, path, ['id', 'description', 'roles']);
    const id = checkPattern(o.id, `${path}.id`, MUSIC_KEY);
    if (seen.has(id))
      throw new AudioParamError(`${path}.id`, 'combination', 'palet tekrar etti', id);
    seen.add(id);
    const roles = checkObject(o.roles, `${path}.roles`, ORCHESTRATION_ROLES);
    const slots: Partial<Record<OrchestrationRole, PaletteSlotV1>> = {};
    for (const role of ORCHESTRATION_ROLES) {
      if (roles[role] === undefined) continue;
      const at = `${path}.roles.${role}`;
      const s = checkObject(roles[role], at, ['instrument', 'transposition', 'gainDb']);
      slots[role] = {
        instrument: checkInstrument(s.instrument, `${at}.instrument`),
        ...(s.transposition === undefined
          ? {}
          : {
              transposition:
                s.transposition === 'auto'
                  ? 'auto'
                  : checkNumber(s.transposition, `${at}.transposition`, {
                      min: -36,
                      max: 36,
                      integer: true,
                    }),
            }),
        ...(s.gainDb === undefined
          ? {}
          : { gainDb: checkNumber(s.gainDb, `${at}.gainDb`, { min: -48, max: 12 }) }),
      };
    }
    if (Object.keys(slots).length === 0) {
      throw new AudioParamError(`${path}.roles`, 'range', 'en az bir görev', 0);
    }
    return {
      id,
      ...(o.description === undefined
        ? {}
        : { description: checkText(o.description, `${path}.description`, 400) }),
      roles: slots,
    };
  });
}

export function checkRole(value: unknown, path: string): OrchestrationRole {
  return checkChoice(value, path, ORCHESTRATION_ROLES);
}

interface Orchestrated {
  readonly palettes?: readonly PaletteV1[];
  readonly orchestration?: { readonly palette: string };
}

/** Etkin paletteki görev yuvası; palet yoksa ya da görev yazılmadıysa `null`. */
export function paletteSlot(
  program: Orchestrated,
  role: OrchestrationRole | undefined,
): PaletteSlotV1 | null {
  if (!role || !program.orchestration) return null;
  const palette = program.palettes?.find((p) => p.id === program.orchestration?.palette);
  return palette?.roles[role] ?? null;
}

/**
 * Şeridin SESLENDİREN enstrümanı: açık yazılmışsa o, yoksa etkin paletteki
 * görevin enstrümanı. İkisi de yoksa şerit çalamaz ve adıyla reddedilir.
 */
export function laneInstrument(
  program: Orchestrated,
  lane: { readonly id: string; readonly instrument?: string; readonly role?: OrchestrationRole },
): string {
  if (lane.instrument) return lane.instrument;
  const slot = paletteSlot(program, lane.role);
  if (!slot) {
    throw new AudioParamError(
      `lanes.${lane.id}.instrument`,
      'required',
      lane.role
        ? `etkin palette "${lane.role}" görevi yok`
        : 'enstrüman ya da orkestrasyon görevi yazılmalı',
      undefined,
    );
  }
  return slot.instrument;
}

/**
 * `auto` kaydırma: yazılan notaları enstrüman aralığında tutan oktavlar
 * içinden tercih edilen register'a en çok notayı oturtan; eşitlikte en küçük
 * kaydırma, sonra aşağı yönlüsü. Hiçbir oktav bütün notaları aralıkta
 * tutamıyorsa kaydırma yapılmaz ve aralık denetimi notayı adıyla reddeder.
 */
export function autoShift(written: readonly number[], instrument: ResolvedInstrumentV1): number {
  if (!instrument.pitched || written.length === 0) return 0;
  let best = { shift: 0, fit: -1 };
  for (const octaves of [0, -1, 1, -2, 2, -3, 3]) {
    const shift = octaves * 12 + instrument.transposition;
    const sounding = written.map((m) => m + shift);
    if (sounding.some((m) => m < instrument.range.lowMidi || m > instrument.range.highMidi))
      continue;
    const fit = sounding.filter(
      (m) => m >= instrument.preferred.lowMidi && m <= instrument.preferred.highMidi,
    ).length;
    if (fit > best.fit) best = { shift: octaves * 12, fit };
  }
  return best.fit < 0 ? 0 : best.shift;
}
