import type { WorkloadDef } from '../workload';
import { arachnidSwarm } from './arachnidSwarm';
import { factoryLocal } from './factoryLocal';
import { svgProps } from './svgProps';
import { svgSprites } from './svgSprites';

/** Kayıtlı yükler; yeni bir yük bir dosya ve buraya bir satırdır. */
export const WORKLOADS: readonly WorkloadDef[] = [
  svgSprites,
  svgProps,
  arachnidSwarm,
  factoryLocal,
];

export function findWorkload(id: string): WorkloadDef | undefined {
  return WORKLOADS.find((workload) => workload.id === id);
}
