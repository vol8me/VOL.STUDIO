import { PROGRAM_REGISTRY } from '../../src/program/catalog';

/**
 * Program düğümü: yapı taşının güncel registry sürümüyle. Registry'de
 * olmayan kimlik 1 alır; bilinmeyen kimlik hatasını sınayan testler bu yolu
 * kullanır.
 */
export const node = (primitive: string, params: Record<string, unknown> = {}) => ({
  primitive,
  version: PROGRAM_REGISTRY.has(primitive) ? PROGRAM_REGISTRY.get(primitive).version : 1,
  params,
});
