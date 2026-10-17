import type { PresetMetadata } from '../types';

/**
 * Yaylı çalgı kataloğu.
 *
 * Aralıklar gerçek enstrümanların pratik yazılış aralığına göre verilir;
 * testler bu aralığın uçlarında ve tipik frekansta ses üretir.
 */
export const BOWED_CATALOG: Record<string, PresetMetadata> = {
  violin: {
    category: 'instrument',
    role: 'lead',
    genre: 'realistic',
    description: 'Keman — parlak, geniş vibrato, uzun sustain.',
    typicalFrequency: 440,
    typicalDuration: 2.0,
    range: [196, 2637],
    useCase: 'Solo melodi, duygusal tema, orkestral üst ses',
    tags: ['bowed', 'string', 'violin', 'lead', 'realistic'],
    related: ['viola', 'cello', 'doubleBass'],
  },
  viola: {
    category: 'instrument',
    role: 'pad',
    genre: 'realistic',
    description: 'Viyola — kemanın altında, daha koyu ve yumuşak.',
    typicalFrequency: 220,
    typicalDuration: 2.0,
    range: [130.8, 1760],
    useCase: 'Harmoni doldurma, orta aralık pad, lirik pasaj',
    tags: ['bowed', 'string', 'viola', 'pad', 'realistic'],
    related: ['violin', 'cello', 'doubleBass'],
  },
  cello: {
    category: 'instrument',
    role: 'bass',
    genre: 'realistic',
    description: 'Viyolonsel — derin, koyu vücut, düşük lowpass.',
    typicalFrequency: 130.8,
    typicalDuration: 2.2,
    range: [65.4, 880],
    useCase: 'Bass line, duygusal solo, dramatik alt zemin',
    tags: ['bowed', 'string', 'cello', 'bass', 'realistic'],
    related: ['violin', 'viola', 'doubleBass'],
  },
  doubleBass: {
    category: 'instrument',
    role: 'bass',
    genre: 'realistic',
    description: 'Kontrabas — en pes, kısa üst ton, inharmonik.',
    typicalFrequency: 82.4,
    typicalDuration: 2.0,
    range: [41.2, 392],
    useCase: 'Derin bas zemin, pizzicato öncesi yaylı versiyon',
    tags: ['bowed', 'string', 'double-bass', 'bass', 'realistic'],
    related: ['cello', 'violin', 'viola'],
  },
};
