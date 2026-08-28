import type { PresetMetadata } from '../types';

export const UI_CATALOG: Record<string, PresetMetadata> = {
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
};
