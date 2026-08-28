import type { PresetMetadata } from '../types';

export const REWARDS_CATALOG: Record<string, PresetMetadata> = {
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
};
