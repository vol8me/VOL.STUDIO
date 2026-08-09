import type { PresetCategory, PresetGenre, PresetMetadata } from './types';

/** Tüm presetlerin keşfedilebilir metadata kataloğu. */
export const PRESET_CATALOG: Record<string, PresetMetadata> = {
  // combat
  fire: {
    category: 'combat',
    genre: 'realistic',
    description: 'Yumuşak ateş / silah sesi, sine + pink noise.',
    typicalFrequency: 420,
    typicalDuration: 0.12,
    useCase: 'Projectile fire, soft gun shot',
    tags: ['weapon', 'fire', 'soft', 'pink-noise'],
    related: ['laser', 'bulletBounce'],
  },
  bulletBounce: {
    category: 'combat',
    genre: 'realistic',
    description: 'Mermi zıplama / sekmesi sesi.',
    typicalFrequency: 320,
    typicalDuration: 0.15,
    useCase: 'Bullet bounce, ricochet',
    tags: ['ricochet', 'bounce', 'short'],
    related: ['fire', 'hit'],
  },
  laser: {
    category: 'combat',
    genre: 'sci-fi',
    description: 'Hızlı frekans düşüşlü enerji / lazer silahı sesi.',
    typicalFrequency: 880,
    typicalDuration: 0.15,
    useCase: 'Projectile fire, sci-fi weapons, energy beams',
    tags: ['weapon', 'projectile', 'high-pitch', 'exponential-slide'],
    related: ['explosion', 'hit'],
  },
  explosion: {
    category: 'combat',
    genre: 'realistic',
    description: 'Geniş bant gürültü tabanlı patlama sesi.',
    typicalFrequency: 100,
    typicalDuration: 0.35,
    useCase: 'Explosions, destruction, heavy impacts',
    tags: ['impact', 'noise', 'low-end'],
    related: ['laser', 'hit'],
  },
  hit: {
    category: 'combat',
    genre: 'retro',
    description: 'Kısa ve keskin vuruş / darbe sesi.',
    typicalFrequency: 600,
    typicalDuration: 0.08,
    useCase: 'Enemy hit, melee impact, collision',
    tags: ['impact', 'short', 'sharp'],
    related: ['hurt', 'laser'],
  },
  hurt: {
    category: 'combat',
    genre: 'realistic',
    description: 'Hasar alma / yaralanma sesi.',
    typicalFrequency: 140,
    typicalDuration: 0.22,
    useCase: 'Player or enemy taking damage',
    tags: ['damage', 'grunt', 'low'],
    related: ['death', 'hit'],
  },
  death: {
    category: 'combat',
    genre: 'realistic',
    description: 'Ölüm / yenilgi sesi, sentez + gürültü katmanlı.',
    typicalFrequency: 220,
    typicalDuration: 0.7,
    useCase: 'Player or enemy death',
    tags: ['death', 'fail', 'long', 'noise'],
    related: ['hurt', 'explosion'],
  },

  // ui
  blip: {
    category: 'ui',
    genre: 'retro',
    description: 'Kısa ve tiz menü / buton tık sesi.',
    typicalFrequency: 1200,
    typicalDuration: 0.06,
    useCase: 'Menu hover, button click, confirm blip',
    tags: ['ui', 'short', 'high-pitch'],
  },
  pause: {
    category: 'ui',
    genre: 'retro',
    description: 'Menüyü duraklatma sesi (aşağı kaymalı).',
    typicalFrequency: 320,
    typicalDuration: 0.22,
    useCase: 'Pause menu, slow down',
    tags: ['ui', 'pause', 'downward'],
    related: ['resume'],
  },
  resume: {
    category: 'ui',
    genre: 'retro',
    description: 'Oyuna devam etme sesi (yukarı kaymalı).',
    typicalFrequency: 120,
    typicalDuration: 0.22,
    useCase: 'Resume game, speed up',
    tags: ['ui', 'resume', 'upward'],
    related: ['pause'],
  },
  restart: {
    category: 'ui',
    genre: 'retro',
    description: 'Yeniden başlatma sesi (yukarı frekans kaymalı, detuned).',
    typicalFrequency: 440,
    typicalDuration: 0.18,
    useCase: 'Restart level, try again',
    tags: ['ui', 'restart', 'detuned'],
  },

  // movement
  jump: {
    category: 'movement',
    genre: 'retro',
    description: 'Yukarı doğru frekans kaymalı zıplama sesi.',
    typicalFrequency: 250,
    typicalDuration: 0.2,
    useCase: 'Player jump, bounce',
    tags: ['jump', 'upward', 'short'],
    related: ['dash', 'whoosh'],
  },
  dash: {
    category: 'movement',
    genre: 'sci-fi',
    description: 'Hızlı sürüklenme / dash sesi.',
    typicalFrequency: 800,
    typicalDuration: 0.2,
    useCase: 'Dash, dodge, quick movement',
    tags: ['dash', 'fast', 'sweep'],
    related: ['whoosh', 'jump'],
  },
  whoosh: {
    category: 'movement',
    genre: 'fantasy',
    description: 'Hızlı geçiş / hava kesme sesi.',
    typicalFrequency: 600,
    typicalDuration: 0.25,
    useCase: 'Swipe, melee swing, fast pass-by',
    tags: ['swoosh', 'swing', 'air'],
    related: ['dash', 'jump'],
  },

  // rewards
  coin: {
    category: 'reward',
    genre: 'retro',
    description: 'Kısa zıplamalı coin / puan toplama sesi.',
    typicalFrequency: 987,
    typicalDuration: 0.12,
    useCase: 'Collect coin, score pickup',
    tags: ['collectible', 'reward', 'high-pitch'],
    related: ['powerup'],
  },
  powerup: {
    category: 'reward',
    genre: 'sci-fi',
    description: 'Yukarı frekans kaymalı güç kazanma sesi.',
    typicalFrequency: 440,
    typicalDuration: 0.3,
    useCase: 'Power-up, ability unlock, positive feedback',
    tags: ['reward', 'power-up', 'upward'],
    related: ['coin'],
  },

  // fm
  bell: {
    category: 'reward',
    genre: 'fantasy',
    description: 'FM zil sesi.',
    typicalFrequency: 440,
    typicalDuration: 0.6,
    useCase: 'Bell, item shine, magical ding',
    tags: ['fm', 'bell', 'metallic'],
    related: ['electricPiano', 'metallicClang'],
  },
  electricPiano: {
    category: 'reward',
    genre: 'retro',
    description: 'FM elektrik piyano / rhodes tarzı.',
    typicalFrequency: 440,
    typicalDuration: 0.5,
    useCase: 'Piano stabs, level-up melody, chords',
    tags: ['fm', 'piano', 'warm'],
    related: ['bell', 'dubBass'],
  },
  metallicClang: {
    category: 'combat',
    genre: 'sci-fi',
    description: 'FM metalik vuruş / clang sesi.',
    typicalFrequency: 800,
    typicalDuration: 0.25,
    useCase: 'Shield hit, metal impact, energy clang',
    tags: ['fm', 'metallic', 'impact'],
    related: ['bell', 'fmLaser'],
  },
  dubBass: {
    category: 'movement',
    genre: 'sci-fi',
    description: 'FM dub bas / growl.',
    typicalFrequency: 80,
    typicalDuration: 0.4,
    useCase: 'Enemy engine, robot move, bass growl',
    tags: ['fm', 'bass', 'growl'],
    related: ['fmLaser'],
  },
  fmLaser: {
    category: 'combat',
    genre: 'sci-fi',
    description: 'FM retro laser (agresif varyant).',
    typicalFrequency: 880,
    typicalDuration: 0.15,
    useCase: 'Sci-fi weapon, charged shot',
    tags: ['fm', 'laser', 'weapon'],
    related: ['laser', 'metallicClang'],
  },
} as const;

export interface FindPresetsQuery {
  category?: PresetCategory;
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
      if (query.genre && meta.genre !== query.genre) return false;
      if (query.tags && !query.tags.some((t) => meta.tags.includes(t))) return false;
      if (query.minFrequency && meta.typicalFrequency < query.minFrequency) return false;
      if (query.maxDuration && meta.typicalDuration > query.maxDuration) return false;
      return true;
    })
    .map(([name]) => name);
}
