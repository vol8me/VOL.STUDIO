import type { WorkloadDef } from '../workload';
import { factoryLocal } from './factoryLocal';
import { svgSprites } from './svgSprites';

/** Kayıtlı yükler; yeni bir yük bir dosya ve buraya bir satırdır. */
export const WORKLOADS: readonly WorkloadDef[] = [svgSprites, factoryLocal];

export function findWorkload(id: string): WorkloadDef | undefined {
  return WORKLOADS.find((workload) => workload.id === id);
}
