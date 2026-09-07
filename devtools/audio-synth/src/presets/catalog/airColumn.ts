import type { PresetMetadata } from '../types';

/**
 * Ahşap üflemeli çalgı kataloğu.
 *
 * Aralıklar gerçek enstrümanların pratik yazılış aralıklarına göre verilir;
 * testler bu aralığın uçlarında ve tipik frekansta ses üretir.
 */

export const AIR_COLUMN_CATALOG: Record<string, PresetMetadata> = {
  flute: {
    category: 'instrument',
    role: 'lead',
    genre: 'realistic',
    description: 'Yan flüt — açık boru, yumuşak nefes ataklı, parlak üst tonlar.',
    typicalFrequency: 440,
    typicalDuration: 1.2,
    range: [262, 2093],
    useCase: 'Pastoral melodi, solo üflemeli, hafif vurgu',
    tags: ['instrument', 'woodwind', 'flute', 'acoustic'],
    related: ['oboe', 'clarinet', 'bassoon'],
  },
  clarinet: {
    category: 'instrument',
    role: 'lead',
    genre: 'realistic',
    description: 'Klarnet — kapalı boru, tek kat harmonikler, karanlık ve yumuşak.',
    typicalFrequency: 262,
    typicalDuration: 1.0,
    range: [147, 1397],
    useCase: 'Klasik melodi, caz riff, hüzünlü solo',
    tags: ['instrument', 'woodwind', 'clarinet', 'acoustic'],
    related: ['bassoon', 'flute', 'oboe'],
  },
  oboe: {
    category: 'instrument',
    role: 'lead',
    genre: 'realistic',
    description: 'Obua — konik boru, zengin harmonikler, buruk karakter.',
    typicalFrequency: 440,
    typicalDuration: 1.0,
    range: [220, 1760],
    useCase: 'Orkestral solo, pastoral tema, duygusal melodi',
    tags: ['instrument', 'woodwind', 'oboe', 'acoustic'],
    related: ['flute', 'clarinet', 'bassoon'],
  },
  bassoon: {
    category: 'instrument',
    role: 'bass',
    genre: 'realistic',
    description: 'Fagot — karanlık, pes ton, üst harmonikler hızla solar.',
    typicalFrequency: 175,
    typicalDuration: 1.2,
    range: [55, 880],
    useCase: 'Pes zemin, dramatik melodi, orkestral bas',
    tags: ['instrument', 'woodwind', 'bassoon', 'bass', 'acoustic'],
    related: ['clarinet', 'flute', 'oboe'],
  },
};
