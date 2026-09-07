export type {
  PresetCategory,
  PresetGenre,
  PresetMetadata,
  PresetFn,
  InstrumentRole,
} from './types';

export * from './combat';
export * from './ui';
export * from './movement';
export * from './rewards';
export * from './fm';
export * from './instruments';
export * from './plucked';
export * from './piano';
export * from './bowed';
export * from './airColumn';
export * from './brass';
export * from './choir';
export * from './acoustic';
export * from './sequences';
export * from './textures';

export { PRESET_CATALOG, findPresets } from './catalog';
export type { FindPresetsQuery } from './catalog';

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
 * anda `PRESET_CATALOG`a da eklemeyi gerektirir; `tests/presets.test.ts`
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
