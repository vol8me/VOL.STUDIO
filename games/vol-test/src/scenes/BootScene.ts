import Phaser from 'phaser';
import { createRuntimeTextures, queueTankTextures } from '@/view/textures';
import { BOOT_EVENT } from './bootEvents';

/** SVG parçaları yükler, çalışma anı dokularını çizer ve dünyayı açar. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.on('progress', (value: number) => this.game.events.emit(BOOT_EVENT.progress, value));
    queueTankTextures(this.load);
  }

  create(): void {
    createRuntimeTextures(this);
    this.game.events.emit(BOOT_EVENT.ready);
    this.scene.start('World');
  }
}
