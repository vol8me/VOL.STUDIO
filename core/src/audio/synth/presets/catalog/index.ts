import type { PresetCategory, PresetGenre, PresetMetadata, InstrumentRole } from '../types';
import { COMBAT_CATALOG } from './combat';
import { UI_CATALOG } from './ui';
import { MOVEMENT_CATALOG } from './movement';
import { REWARDS_CATALOG } from './rewards';
import { FM_CATALOG } from './fm';
import { TEXTURES_CATALOG } from './textures';
import { INSTRUMENTS_CATALOG } from './instruments';

/**
 * Tüm presetlerin keşfedilebilir metadata kataloğu.
 *
 * Kategori başına ayrı dosya: katalog preset dosyalarıyla (`combat.ts`,
 * `ui.ts`, …) birebir aynı bölümlemeyi izler, böylece yeni bir preset
 * eklerken metadata'sının nereye yazılacağı aranmaz.
 */
export const PRESET_CATALOG: Record<string, PresetMetadata> = {
  ...COMBAT_CATALOG,
  ...UI_CATALOG,
  ...MOVEMENT_CATALOG,
  ...REWARDS_CATALOG,
  ...FM_CATALOG,
  ...TEXTURES_CATALOG,
  ...INSTRUMENTS_CATALOG,
};

export interface FindPresetsQuery {
  category?: PresetCategory;
  role?: InstrumentRole;
  genre?: PresetGenre;
  tags?: string[];
  minFrequency?: number;
  maxDuration?: number;
}

/** Katalog içinde preset arar. */
export function findPresets(query: FindPresetsQuery = {}): string[] {
  return Object.entries(PRESET_CATALOG)
    .filter(([, meta]) => {
      if (query.category && meta.category !== query.category) return false;
      if (query.role && meta.role !== query.role) return false;
      if (query.genre && meta.genre !== query.genre) return false;
      if (query.tags && !query.tags.some((t) => meta.tags.includes(t))) return false;
      if (query.minFrequency && meta.typicalFrequency < query.minFrequency) return false;
      if (query.maxDuration && meta.typicalDuration > query.maxDuration) return false;
      return true;
    })
    .map(([name]) => name);
}
