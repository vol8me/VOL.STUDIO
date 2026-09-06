import type { PresetMetadata } from '../types';

/**
 * Telli çalgı kataloğu.
 *
 * Aralıklar gerçek enstrümanların pratik yazılış aralıklarına göre verilir;
 * testler bu aralığın uçlarında ve tipik frekansta ses üretir.
 */
export const PLUCKED_CATALOG: Record<string, PresetMetadata> = {
  guitar: {
    category: 'instrument',
    role: 'pluck',
    genre: 'realistic',
    description: 'Akustik gitar — orta vücut, sönümlü üst tonlar.',
    typicalFrequency: 330,
    typicalDuration: 1.0,
    range: [82.4, 659.3],
    useCase: 'Akustik parça, arpej, ritmik vuruş',
    tags: ['pluck', 'string', 'acoustic', 'guitar'],
    related: ['bassGuitar', 'harp', 'mandolin', 'woodPluck'],
  },
  bassGuitar: {
    category: 'instrument',
    role: 'bass',
    genre: 'realistic',
    description: '4-telli elektrik bas gitar — derin, kısa üst ton.',
    typicalFrequency: 82.4,
    typicalDuration: 1.2,
    range: [41.2, 196],
    useCase: 'Bas hat, ritmik zemin',
    tags: ['bass', 'pluck', 'string', 'guitar'],
    related: ['guitar', 'dubBass', 'pluckSubBass'],
  },
  harp: {
    category: 'instrument',
    role: 'pluck',
    genre: 'realistic',
    description: 'Konser arpı — geniş aralık, zengin harmonik, uzun süren ton.',
    typicalFrequency: 523.25,
    typicalDuration: 2.5,
    range: [32.7, 3136],
    useCase: 'Arp parçası, aydınlık doku, glissando zemin',
    tags: ['pluck', 'string', 'harp', 'bright'],
    related: ['guitar', 'mandolin', 'crystalBell'],
  },
  mandolin: {
    category: 'instrument',
    role: 'pluck',
    genre: 'realistic',
    description: 'Mandolin — parlak, kısa atak, belirgin tremolo.',
    typicalFrequency: 660,
    typicalDuration: 0.8,
    range: [196, 2637],
    useCase: 'Hızlı melodi, halk müziği, tremolo rif',
    tags: ['pluck', 'string', 'mandolin', 'tremolo'],
    related: ['guitar', 'harp', 'vibraphone'],
  },
};
