import type { PresetMetadata } from '../types';

export const MOVEMENT_CATALOG: Record<string, PresetMetadata> = {
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
};
