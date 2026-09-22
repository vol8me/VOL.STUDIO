import { CURVES } from './curves';
import { ARCHETYPES } from './primitives/archetypes';
import { WAVE1_PRIMITIVES } from './primitives/basic';
import { CONTROLS } from './primitives/controls';
import { MICRO_EVENTS } from './primitives/events';
import { AMPLITUDE, EXCITERS } from './primitives/exciters';
import { FLUIDS } from './primitives/fluid';
import { MODULATORS } from './primitives/modulators';
import { RESONATORS } from './primitives/resonance';
import { GLOTTAL } from './primitives/voice';
import { TUBE } from './primitives/waveguide';
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
  MICRO_EVENTS,
  ...FLUIDS,
  GLOTTAL,
  TUBE,
  ...ARCHETYPES,
]);
