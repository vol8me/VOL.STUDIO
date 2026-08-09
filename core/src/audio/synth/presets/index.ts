export type { PresetCategory, PresetGenre, PresetMetadata, PresetFn } from './types';

export * from './combat';
export * from './ui';
export * from './movement';
export * from './rewards';
export * from './fm';
export * from './sequences';

export { PRESET_CATALOG, findPresets } from './catalog';
export type { FindPresetsQuery } from './catalog';

import type { PresetFn } from './types';
import * as combat from './combat';
import * as ui from './ui';
import * as movement from './movement';
import * as rewards from './rewards';
import * as fm from './fm';

const all = { ...combat, ...ui, ...movement, ...rewards, ...fm } as const;

/** İsimle preset çağırma (runtime lookup). */
export const presetMap: Record<string, PresetFn> = { ...all };

export function getPreset(name: string, frequency?: number, duration?: number) {
  const fn = all[name as keyof typeof all] as PresetFn | undefined;
  if (!fn) throw new Error(`Bilinmeyen preset: ${name}`);
  return fn(frequency, duration);
}
