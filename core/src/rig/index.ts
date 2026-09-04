export { RigMotionModel, type RigMotionModelConfig } from './RigMotionModel';
export { LegGait, type LegGaitConfig, type LegGaitLeg, type LegGaitStepTuning } from './LegGait';
export { GazeDriver, type GazeDriverConfig, type GazeSignals } from './GazeDriver';
export {
  measureSupport,
  type SupportFoot,
  type SupportQuery,
  type SupportState,
} from './SupportPolygon';
export type { RigMotionSignals } from './types';

/*
 * Rig VARLIK katmanı: üretilmiş bir parça ağacını doğrular, montaja hazır bir
 * tanıma çevirir ve sahnede kurar.
 *
 * Aracın kendisi CORE'un konusu değildir — buraya yalnız ÜRETİLMİŞ VERİNİN
 * sözleşmesi girer. Metadata'yı kimin yazdığı tüketicinin bileceği iştir.
 *
 * Phaser taşımayan yarısı `./metadata` alt-yolundan ayrıca verilir: bir export
 * doğrulayıcı CLI, render yığınını yüklemeden aynı sözleşmeyi okuyabilmelidir.
 */
export * from './metadata';
export {
  computePartLayout,
  preloadRigTextures,
  assembleRig,
  type PartLayout,
  type AssembledRig,
} from './assembleRig';
