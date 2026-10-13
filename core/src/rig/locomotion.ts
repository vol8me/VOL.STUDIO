/*
 * Phaser taşımayan hareket yüzeyi: ayak-sabitleyen yürüyüş döngüsü ve destek poligonu.
 *
 * `rig/index.ts` ayrıca sahne montajını (`assembleRig`) taşır ve Phaser yükler; yürüyüşün
 * matematiğini yalnız ihtiyaç duyan tüketici (test, simülasyon, araç) render yığınını çekmeden
 * buradan alır. Tek tanım yerindedir: bu dosya yalnız yeniden dışa aktarır.
 */
export { LegGait, type LegGaitConfig, type LegGaitLeg, type LegGaitStepTuning } from './LegGait';
export {
  measureSupport,
  type SupportFoot,
  type SupportQuery,
  type SupportState,
} from './SupportPolygon';
