import type { PresetMetadata } from '../types';

/**
 * Bakır üflemeli çalgı kataloğu.
 *
 * Aralıklar gerçek enstrüman pratik yazılış aralığına göre verilir;
 * testler bu aralığın uçlarında ve tipik frekansta ses üretir.
 */
export const BRASS_CATALOG: Record<string, PresetMetadata> = {
  trumpet: {
    category: 'instrument',
    role: 'lead',
    genre: 'realistic',
    description: 'Trompet — parlak atak, yüksek kısmi tonlar, narın gövde.',
    typicalFrequency: 440,
    typicalDuration: 1.2,
    range: [165, 880],
    useCase: 'Solo melodi, fanfar, parlak tema hattı',
    tags: ['brass', 'trumpet', 'lead', 'bright'],
    related: ['trombone', 'frenchHorn', 'brightLead'],
  },
  trombone: {
    category: 'instrument',
    role: 'lead',
    genre: 'realistic',
    description: 'Trombon — geniş, tok, trompetten daha koyu ve sürdürümlü.',
    typicalFrequency: 220,
    typicalDuration: 1.5,
    range: [82.4, 698],
    useCase: 'Geniş melodi, bas ritmik vurgu, sinematik motif',
    tags: ['brass', 'trombone', 'lead', 'warm'],
    related: ['trumpet', 'frenchHorn', 'tuba'],
  },
  frenchHorn: {
    category: 'instrument',
    role: 'pad',
    genre: 'realistic',
    description: 'Korno — yumuşak, orta parlak, geniş ve kapsayıcı.',
    typicalFrequency: 220,
    typicalDuration: 1.8,
    range: [62, 700],
    useCase: 'Orkestral pad, doğa/tema yatağı, sürdürümlü akor',
    tags: ['brass', 'horn', 'pad', 'warm'],
    related: ['trombone', 'tuba', 'additivePad'],
  },
  tuba: {
    category: 'instrument',
    role: 'bass',
    genre: 'realistic',
    description: 'Tuba — derin, koyu, çok az üst ton, güçlü zemin.',
    typicalFrequency: 98,
    typicalDuration: 2.0,
    range: [32.7, 220],
    useCase: 'Bas zemin, orkestral bass, pes vurgu',
    tags: ['brass', 'tuba', 'bass', 'dark'],
    related: ['trombone', 'subBass', 'doubleBass'],
  },
};
