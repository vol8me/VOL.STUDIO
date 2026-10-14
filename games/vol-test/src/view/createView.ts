import type Phaser from 'phaser';
import { SPIDER_LOOKS } from '@/config/spiders';
import type { VehicleSpec } from '@/config/vehicles';
import { SpiderView, type FootPrintSink } from './SpiderView';
import { TankView } from './TankView';
import type { VehicleView } from './VehicleView';

/** Aracın tanımına uygun görünümü kurar: oyun ve vitrin aynı sınıfları paylaşır. */
export function createVehicleView(
  scene: Phaser.Scene,
  spec: VehicleSpec,
  lighting: Phaser.GameObjects.Container,
  footprint?: FootPrintSink,
): VehicleView {
  if (spec.kind === 'tank') return new TankView(scene, spec, lighting);
  return new SpiderView(scene, spec, SPIDER_LOOKS[spec.id], lighting, footprint);
}
