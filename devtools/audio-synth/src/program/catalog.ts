import { CURVES } from './curves';
import { WAVE1_PRIMITIVES } from './primitives/basic';
import { CONTROLS } from './primitives/controls';
import { AMPLITUDE, EXCITERS } from './primitives/exciters';
import { MODULATORS } from './primitives/modulators';
import { RESONATORS } from './primitives/resonance';
import { Registry, type ProgramEntry } from './registry';

/**
 * Programın gördüğü registry. Yeni bir yapı taşı YALNIZ buraya eklenerek
 * görünür olur: doğrulama, render, maliyet, context ve governance testi
 * aynı listeyi okur.
 */
export const PROGRAM_REGISTRY = new Registry<ProgramEntry>([
  ...WAVE1_PRIMITIVES,
  ...CURVES,
  ...EXCITERS,
  ...RESONATORS,
  AMPLITUDE,
  ...MODULATORS,
  ...CONTROLS,
]);
