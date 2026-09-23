import { compress } from '../effects/dynamics';
import { applyBiquad, passCascade } from '../effects/eq';
import { crush, saturate } from '../effects/saturation';
import { shapeTransients } from '../effects/dynamics';
import { AudioParamError } from '../guard/errors';
import { checkNumber, checkObject } from '../guard/read';
import type { ControlFactor } from './bindings';
import type { NumberParamSpec } from './params';
import type { ProgramEntry } from './registry';
import { LAYER_ROLES, type LayerRole } from './roles';
import { NEUTRAL_STYLE, STYLE_PROFILES, type StyleControlsV1 } from './styles';

export { NEUTRAL_STYLE, STYLE_PROFILES } from './styles';
export type { StyleControlsV1, StyleProfileV1 } from './styles';

/**
 * Programın stil başvurusu: hazır profil (kimlik + sürüm) ya da İSİMSİZ özel
 * kontrol kümesi. Özel stilin ad alanı yoktur — adlandırılmış bir referans
 * kalıcı profile isim olarak kopyalanamaz, yalnız nitelikleriyle yazılır.
 */
export type StyleRefV1 =
  | { readonly profile: string; readonly version: number }
  | { readonly controls: Partial<StyleControlsV1> };

export interface ResolvedStyle {
  /** Hazır profil kimliği; özel stilde `null`. */
  readonly profile: string | null;
  readonly controls: StyleControlsV1;
  /** Programın kanal sayısı yüzünden uygulanamayan profil alanları (ör. mono'da `width`). */
  readonly notApplied: readonly string[];
}

const RANGES: Readonly<Record<Exclude<keyof StyleControlsV1, 'roleBalanceDb'>, [number, number]>> =
  {
    transient: [-1, 1],
    lowCutHz: [20, 500],
    highCutHz: [2000, 20000],
    saturation: [0, 1],
    digital: [0, 1],
    dynamics: [0, 1],
    width: [0, 2],
    pitchOctaves: [-1, 1],
    spaceDb: [-24, 12],
  };
const ROLE_RANGE = { min: -24, max: 12 };

function checkControls(value: unknown, path: string): StyleControlsV1 {
  const o = checkObject(value, path, [...Object.keys(RANGES), 'roleBalanceDb']);
  const out: Record<string, unknown> = { ...NEUTRAL_STYLE };
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    if (o[key] !== undefined) out[key] = checkNumber(o[key], `${path}.${key}`, { min, max });
  }
  if (o.roleBalanceDb !== undefined) {
    const roles = checkObject(o.roleBalanceDb, `${path}.roleBalanceDb`, LAYER_ROLES);
    const balance: Partial<Record<LayerRole, number>> = {};
    for (const role of LAYER_ROLES) {
      if (roles[role] !== undefined) {
        balance[role] = checkNumber(roles[role], `${path}.roleBalanceDb.${role}`, ROLE_RANGE);
      }
    }
    out.roleBalanceDb = balance;
  }
  return out as unknown as StyleControlsV1;
}

/** Stil başvurusunu çözer; bilinmeyen profil/sürüm ve aralık dışı alan render'dan önce düşer. */
export function resolveStyle(value: unknown, channels: 1 | 2): ResolvedStyle | null {
  if (value === undefined) return null;
  const head = checkObject(value, 'style', ['profile', 'version', 'controls']);
  if (head.controls !== undefined) {
    checkObject(value, 'style', ['controls']);
    const controls = checkControls(head.controls, 'style.controls');
    if (channels === 1 && controls.width !== 1) {
      const detail = 'mono programda stereo genişlik uygulanamaz';
      throw new AudioParamError('style.controls.width', 'combination', detail, controls.width);
    }
    return { profile: null, controls, notApplied: [] };
  }
  checkObject(value, 'style', ['profile', 'version']);
  const entry = STYLE_PROFILES.find((p) => p.id === head.profile);
  if (!entry)
    throw new AudioParamError('style.profile', 'unknown-id', 'stil profili yok', head.profile);
  if (head.version !== entry.version) {
    const detail = `${entry.id} sürümü ${entry.version}`;
    throw new AudioParamError('style.version', 'version', detail, head.version);
  }
  const notApplied = channels === 1 && entry.controls.width !== 1 ? ['width'] : [];
  const controls = notApplied.length > 0 ? { ...entry.controls, width: 1 } : entry.controls;
  return { profile: entry.id, controls, notApplied };
}

/**
 * Perde dili: kaynak/rezonatör düğümlerinin perde-nedenli parametrelerine
 * oktav çarpanı — registry'nin `causal` kaydından okunur. Frekans (Hz, yön +1)
 * 2^oct, uzunluk (mm/cm/m, yön −1; f ∝ 1/L) 2^(−oct) ile ölçeklenir; diğer
 * birimler (hacim, oran) dokunulmaz.
 */
export function stylePitchFactors(
  style: ResolvedStyle | null,
): ((entry: ProgramEntry, key: string, spec: NumberParamSpec) => ControlFactor[]) | undefined {
  const octaves = style?.controls.pitchOctaves ?? 0;
  if (octaves === 0) return undefined;
  return (entry, key, spec) => {
    const pitch = entry.causal.find((c) => c.param === key && c.dimension === 'pitch');
    if (!pitch) return [];
    const frequency = pitch.direction === 1 && spec.unit === 'Hz';
    const length = pitch.direction === -1 && ['mm', 'cm', 'm'].includes(spec.unit);
    if (!frequency && !length) return [];
    return [
      { control: 'style.pitch', law: 'octaves', span: frequency ? octaves : -octaves, value: 1 },
    ];
  };
}

/** Rol dengesinin katman kazancına eklediği dB (rolsüz katman ve 0 → 0). */
export function roleGainDb(style: ResolvedStyle | null, role: LayerRole | null): number {
  if (!style || !role) return 0;
  return style.controls.roleBalanceDb[role] ?? 0;
}

function peakOf(channels: readonly Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) for (const v of channel) peak = Math.max(peak, Math.abs(v));
  return peak;
}

/**
 * Stil zinciri master veriyolunda, program efektlerinden SONRA ve master
 * seviyesinden ÖNCE çalışır: kesimler → transient → doygunluk → sıkıştırma
 * → dijital indirgeme → genişlik. Doğrusal olmayan aşamalar sinyali tepeye
 * göre birim ölçeğe getirip geri ölçekler: stil kararı katman kazançlarından
 * bağımsız aynı karakteri verir. Nötr alanlar aşamayı ATLAR; bütün alanları
 * nötr bir stil çıktıyı bit-eşit bırakır.
 */
export function applyStyleChain(
  channels: readonly Float32Array[],
  sampleRate: number,
  controls: StyleControlsV1,
): void {
  const cut = (type: 'highpass' | 'lowpass', frequency: number) => {
    const stages = passCascade(
      type,
      Math.min(frequency, 0.45 * sampleRate),
      Math.SQRT1_2,
      1,
      sampleRate,
    );
    for (const channel of channels) stages.forEach((c) => applyBiquad(channel, c));
  };
  if (controls.lowCutHz > 20) cut('highpass', controls.lowCutHz);
  if (controls.highCutHz < 20000) cut('lowpass', controls.highCutHz);
  if (controls.transient !== 0) {
    shapeTransients(channels, sampleRate, {
      attackDb: 12 * controls.transient,
      sustainDb: -6 * controls.transient,
      speedSeconds: 0.002,
    });
  }
  const nonlinear = controls.saturation > 0 || controls.dynamics < 1 || controls.digital > 0;
  const peak = nonlinear ? peakOf(channels) : 0;
  if (peak > 0) {
    for (const channel of channels) for (let i = 0; i < channel.length; i++) channel[i] /= peak;
    if (controls.saturation > 0) {
      saturate(channels, {
        driveDb: 24 * controls.saturation,
        character: 'tanh',
        mix: 1,
        outputDb: 0,
      });
    }
    if (controls.dynamics < 1) {
      compress(channels, sampleRate, {
        thresholdDb: -12,
        ratio: 1 + 7 * (1 - controls.dynamics),
        kneeDb: 6,
        attackSeconds: 0.004,
        releaseSeconds: 0.12,
        makeupDb: 0,
        detector: 'peak',
        rmsSeconds: 0,
        link: 'linked',
      });
    }
    if (controls.digital > 0) {
      crush(channels, {
        bits: Math.round(16 - 10 * controls.digital),
        hold: 1 + Math.round(5 * controls.digital),
        mix: 1,
      });
    }
    for (const channel of channels) for (let i = 0; i < channel.length; i++) channel[i] *= peak;
  }
  if (controls.width !== 1 && channels.length === 2) {
    const [left, right] = channels;
    for (let i = 0; i < left.length; i++) {
      const mid = 0.5 * (left[i] + right[i]);
      const side = 0.5 * (left[i] - right[i]) * controls.width;
      left[i] = mid + side;
      right[i] = mid - side;
    }
  }
}
