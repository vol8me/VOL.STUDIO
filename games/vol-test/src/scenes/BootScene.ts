import Phaser from 'phaser';
import { preloadRigTextures } from '@volstudio/core';
import { ARACHNID_RIG, PLASMA_CANNON_RIG } from '@/config/rigAssets';
import { createRuntimeTextures, queueTankTextures } from '@/view/textures';
import type { GameServices } from '@/app/GameServices';
import { BOOT_EVENT } from './bootEvents';
import { firstScene } from './firstScene';

/** SVG ve rig parçalarını yükler, çalışma anı dokularını çizer ve ilk ekranı açar. */
export class BootScene extends Phaser.Scene {
  constructor(private readonly services?: GameServices) {
    super('Boot');
  }

  preload(): void {
    this.load.on('progress', (value: number) => this.game.events.emit(BOOT_EVENT.progress, value));
    queueTankTextures(this.load);
    preloadRigTextures(this, ARACHNID_RIG);
    preloadRigTextures(this, PLASMA_CANNON_RIG);
  }

  create(): void {
    createRuntimeTextures(this);
    this.game.events.emit(BOOT_EVENT.ready);
    this.scene.start(firstScene(this.services, location.search));
  }
}
