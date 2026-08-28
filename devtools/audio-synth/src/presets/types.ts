import type { SynthParams } from '../types';

/** Preset kategorileri. */
export type PresetCategory = 'combat' | 'ui' | 'movement' | 'reward' | 'texture' | 'instrument';

/** Enstrüman / sesin orkestral rolü. */
export type InstrumentRole =
  | 'bass'
  | 'pad'
  | 'lead'
  | 'pluck'
  | 'keys'
  | 'bell'
  | 'texture'
  | 'percussion';

/** Preset'in estetik/genre etiketi. */
export type PresetGenre = 'retro' | 'sci-fi' | 'fantasy' | 'realistic';

/** Bir presetin ajanlar için keşfedilebilir metadata'sı. */
export interface PresetMetadata {
  /** Hangi kategoriye ait. */
  category: PresetCategory;
  /** Orkestral rol — agent'in doğru enstrümanı seçmesi için. */
  role?: InstrumentRole;
  /** Estetik/genre. */
  genre?: PresetGenre;
  /** Kısa açıklama. */
  description: string;
  /** Tipik başlangıç frekansı (Hz). */
  typicalFrequency: number;
  /** Tipik süre (saniye). */
  typicalDuration: number;
  /** Kullanım senaryosu. */
  useCase: string;
  /** Arama etiketleri. */
  tags: string[];
  /** İlgili diğer presetler. */
  related?: string[];
}

/** Preset fonksiyon imzası: frekans ve süre ile özelleştirilebilir. */
export type PresetFn = (frequency?: number, duration?: number) => SynthParams;
