import Phaser from 'phaser';
import { createRuntimeTextures, queueTankTextures } from '@/view/textures';

/** SVG parçaları yükler, çalışma anı dokularını çizer ve dünyayı açar. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    queueTankTextures(this.load);
  }

  create(): void {
    createRuntimeTextures(this);
    this.scene.start('World');
  }
}
