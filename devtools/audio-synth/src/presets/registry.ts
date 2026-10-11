import type { PresetFn } from './types';
import * as combat from './combat';
import * as ui from './ui';
import * as movement from './movement';
import * as rewards from './rewards';
import * as fm from './fm';
import * as instruments from './instruments';
import * as plucked from './plucked';
import * as piano from './piano';
import * as bowed from './bowed';
import * as airColumn from './airColumn';
import * as brass from './brass';
import * as choir from './choir';
import * as acoustic from './acoustic';
import * as textures from './textures';

/**
 * İsimle çağrılabilen presetler.
 *
 * `sequences` BİLİNÇLİ olarak dışarıdadır: `SequenceParams` döner, `SynthParams`
 * değil — `getPreset`in sözleşmesine girmez. Bir aileyi buraya eklemek onu aynı
 * anda `PRESET_CATALOG`a da eklemeyi gerektirir; `tests/presets/presets.test.ts`
 * içindeki bütünlük bekçisi ikisinin ayrışmasına izin vermez.
 */
const all = {
  ...combat,
  ...ui,
  ...movement,
  ...rewards,
  ...fm,
  ...instruments,
  ...plucked,
  ...piano,
  ...bowed,
  ...airColumn,
  ...brass,
  ...choir,
  ...acoustic,
  ...textures,
} as const;

/** `getPreset` ile çağrılabilen preset adları — bütünlük bekçisinin girdisi. */
export function callablePresetNames(): string[] {
  return Object.keys(all).sort();
}

export function getPreset(name: string, frequency?: number, duration?: number) {
  const fn = all[name as keyof typeof all] as PresetFn | undefined;
  if (!fn) throw new Error(`Bilinmeyen preset: ${name}`);
  return fn(frequency, duration);
}
