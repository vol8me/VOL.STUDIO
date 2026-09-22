import { PROGRAM_REGISTRY } from './catalog';
import type { ParamSpec } from './params';
import type { ControlTarget, ProgramEntry } from './registry';

/**
 * Registry'nin JSON izdüşümü — `audio:job context` ve registry özeti bunu
 * okur. Fonksiyonlar (implementasyon, maliyet modeli) yerine onların
 * VARSAYILAN değerlerdeki sayısal sonucu yazılır; sıra kimliğe göredir.
 */
export interface RegistryEntryDescription {
  readonly id: string;
  readonly kind: string;
  readonly version: number;
  readonly description: string;
  readonly capabilities: readonly string[];
  readonly params: Readonly<Record<string, ParamSpec>>;
  readonly causal: ProgramEntry['causal'];
  readonly determinism: ProgramEntry['determinism'];
  readonly resource: {
    readonly model: string;
    readonly workPerFrameAtDefaults: number;
    readonly stateBytesAtDefaults48k: number;
  };
  /** Yalnız makrolarda: sürdüğü DSP parametreleri ve yasası (uyumlu yapı taşları). */
  readonly targets?: readonly ControlTarget[];
  readonly modulationDepth?: { readonly span: number };
}

function defaults(entry: ProgramEntry): Record<string, number | string> {
  return Object.fromEntries(Object.entries(entry.params).map(([key, spec]) => [key, spec.default]));
}

function sortedRecord<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, record[key]]),
  );
}

export function describeEntry(entry: ProgramEntry): RegistryEntryDescription {
  const params = defaults(entry);
  return {
    id: entry.id,
    kind: entry.kind,
    version: entry.version,
    description: entry.description,
    capabilities: [...entry.capabilities].sort(),
    params: sortedRecord(entry.params),
    causal: entry.causal,
    determinism: entry.determinism,
    resource: {
      model: entry.resource.model,
      workPerFrameAtDefaults: entry.resource.workPerFrame(params, new Set()),
      stateBytesAtDefaults48k: Math.round(entry.resource.stateBytes(params, 48000)),
    },
    ...(entry.kind === 'control'
      ? {
          targets: entry.targets,
          ...(entry.modulationDepth ? { modulationDepth: entry.modulationDepth } : {}),
        }
      : {}),
  };
}

export function describeRegistry(): RegistryEntryDescription[] {
  return PROGRAM_REGISTRY.entries().map(describeEntry);
}
