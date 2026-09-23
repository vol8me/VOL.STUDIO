import { CURVES } from './curves';
import { AIRFLOW } from './primitives/airflow';
import { CONTACT } from './primitives/contact';
import { CONVOLUTION } from './primitives/convolution';
import { ELECTRICAL } from './primitives/electrical';
import { ENVIRONMENT } from './primitives/environment';
import { FRICTION } from './primitives/friction';
import { MACHINE } from './primitives/machine';
import { BLAST, PRESSURE_WAVE } from './primitives/pressure';
import { SAMPLING } from './primitives/sampling';
import { SFX_ARCHETYPES } from './primitives/sfxArchetypes';
import { ARCHETYPES } from './primitives/archetypes';
import { WAVE1_PRIMITIVES } from './primitives/basic';
import { CONTROLS } from './primitives/controls';
import { MICRO_EVENTS } from './primitives/events';
import { AMPLITUDE, EXCITERS } from './primitives/exciters';
import { FLUIDS } from './primitives/fluid';
import { MATERIAL_BODY } from './primitives/material';
import { MODULATORS } from './primitives/modulators';
import { PROCESSORS } from './primitives/processing';
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
  MATERIAL_BODY,
  AMPLITUDE,
  ...MODULATORS,
  ...CONTROLS,
  MICRO_EVENTS,
  ...FLUIDS,
  GLOTTAL,
  TUBE,
  ...PROCESSORS,
  CONTACT,
  PRESSURE_WAVE,
  BLAST,
  AIRFLOW,
  FRICTION,
  MACHINE,
  ELECTRICAL,
  ...ENVIRONMENT,
  ...SAMPLING,
  CONVOLUTION,
  ...ARCHETYPES,
  ...SFX_ARCHETYPES,
]);
