import type { PresetMetadata } from '../types';

/**
 * Piyano kataloğu.
 *
 * Aralıklar gerçek piyano pratik yazılış aralığına göre verilir; testler
 * bu aralığın uçlarında ve tipik frekansta ses üretir.
 */
export const PIANO_CATALOG: Record<string, PresetMetadata> = {
  grandPiano: {
    category: 'instrument',
    role: 'keys',
    genre: 'realistic',
    description: 'Kuyruklu piyano — uzun sustain, parlak atak, geniş aralık.',
    typicalFrequency: 440,
    typicalDuration: 2.0,
    range: [27.5, 4186],
    useCase: 'Solo piyano, açılış, dramatik melodi, klasik/kuyruklu parça',
    tags: ['piano', 'keys', 'acoustic', 'realistic', 'grand'],
    related: ['uprightPiano', 'honkyTonkPiano', 'warmKeys'],
  },
  uprightPiano: {
    category: 'instrument',
    role: 'keys',
    genre: 'realistic',
    description: 'Duvar piyanosu — daha kısa gövde, hızlı sönüm, kompakt.',
    typicalFrequency: 440,
    typicalDuration: 1.4,
    range: [27.5, 4186],
    useCase: 'Küçük mekân piyanosu, pop/rock akor, kısa melodi',
    tags: ['piano', 'keys', 'acoustic', 'upright'],
    related: ['grandPiano', 'honkyTonkPiano', 'electricPiano'],
  },
  honkyTonkPiano: {
    category: 'instrument',
    role: 'keys',
    genre: 'retro',
    description: 'Honky-tonk piyanosu — parlak, hafif detune, "tack" karakter.',
    typicalFrequency: 440,
    typicalDuration: 1.0,
    range: [82.4, 2093],
    useCase: 'Ragtime, saloon, retro oyun müziği',
    tags: ['piano', 'keys', 'honky-tonk', 'retro'],
    related: ['preparedPiano', 'grandPiano', 'brightLead'],
  },
  preparedPiano: {
    category: 'instrument',
    role: 'percussion',
    genre: 'fantasy',
    description: 'Prepared piano — tel arasına konmuş cisimler, "tın" yerine "tak".',
    typicalFrequency: 330,
    typicalDuration: 0.9,
    range: [82.4, 2093],
    useCase: 'Deneysel, perküsyif melodi, Cage tarzı dokular',
    tags: ['piano', 'prepared', 'percussion', 'experimental'],
    related: ['honkyTonkPiano', 'metallicClang', 'woodPluck'],
  },
};
