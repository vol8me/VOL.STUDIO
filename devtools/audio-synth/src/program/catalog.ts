import { WAVE1_CURVES } from './curves';
import { WAVE1_PRIMITIVES } from './primitives/basic';
import { Registry, type ProgramEntry } from './registry';

/**
 * Programın gördüğü registry. Yeni bir yapı taşı YALNIZ buraya eklenerek
 * görünür olur: doğrulama, render, maliyet, context ve governance testi
 * aynı listeyi okur.
 */
export const PROGRAM_REGISTRY = new Registry<ProgramEntry>([...WAVE1_PRIMITIVES, ...WAVE1_CURVES]);
