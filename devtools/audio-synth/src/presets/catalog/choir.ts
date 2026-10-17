import type { PresetMetadata } from '../types';

/**
 * Koro / vokal formant kataloğu.
 *
 * Aralıklar gerçek insan sesinin pratik yazılış aralıklarına göre verilir;
 * testler bu aralığın uçlarında ve tipik frekansta ses üretir.
 */

export const CHOIR_CATALOG: Record<string, PresetMetadata> = {
  soprano: {
    category: 'instrument',
    role: 'lead',
    genre: 'realistic',
    description: 'Soprano — yüksek perde, parlak, geniş stereo koro.',
    typicalFrequency: 440,
    typicalDuration: 2.0,
    range: [262, 1047],
    useCase: 'Koro üst sesi, aydınlık melodi, vokal pad',
    tags: ['choir', 'vocal', 'soprano', 'lead', 'realistic'],
    related: ['alto', 'tenor', 'bassChoir'],
  },
  alto: {
    category: 'instrument',
    role: 'pad',
    genre: 'realistic',
    description: 'Alto — orta yüksek, yumuşak, dengeli koro sesi.',
    typicalFrequency: 330,
    typicalDuration: 2.0,
    range: [196, 784],
    useCase: 'Koro orta sesi, harmoni doldurma, lirik pasaj',
    tags: ['choir', 'vocal', 'alto', 'pad', 'realistic'],
    related: ['soprano', 'tenor', 'bassChoir'],
  },
  tenor: {
    category: 'instrument',
    role: 'pad',
    genre: 'realistic',
    description: 'Tenor — orta erkek koro sesi, hafif vibrato.',
    typicalFrequency: 220,
    typicalDuration: 2.0,
    range: [130.8, 523.3],
    useCase: 'Koro iç sesi, erkek melodi, dramatik tema',
    tags: ['choir', 'vocal', 'tenor', 'pad', 'realistic'],
    related: ['alto', 'soprano', 'bassChoir'],
  },
  bassChoir: {
    category: 'instrument',
    role: 'bass',
    genre: 'realistic',
    description: 'Bass Choir — en pes erkek koro sesi, koyu, kısa üst ton.',
    typicalFrequency: 130.8,
    typicalDuration: 2.0,
    range: [82.4, 392],
    useCase: 'Koro bas zemin, derin vokal pad',
    tags: ['choir', 'vocal', 'bass', 'low', 'realistic'],
    related: ['tenor', 'alto', 'soprano'],
  },
};
