import type Phaser from 'phaser';
import { SPIDER_LOOKS } from '@/config/spiders';
import type { VehicleSpec } from '@/config/vehicles';
import { HoverView } from './HoverView';
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
  switch (spec.kind) {
    case 'tank':
      return new TankView(scene, spec, lighting);
    case 'walker':
      return new SpiderView(scene, spec, SPIDER_LOOKS[spec.id], lighting, footprint);
    case 'hover':
      return new HoverView(scene, spec, lighting);
  }
}
