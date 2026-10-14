import Phaser from 'phaser';
import {
  createRuntimeTextures,
  queueHoverTextures,
  queueSpiderTextures,
  queueTankTextures,
} from '@/view/textures';
import type { GameServices } from '@/app/GameServices';
import { BOOT_EVENT } from './bootEvents';
import { firstScene } from './firstScene';

/** SVG parçalarını yükler, çalışma anı dokularını çizer ve ilk ekranı açar. */
export class BootScene extends Phaser.Scene {
  constructor(private readonly services?: GameServices) {
    super('Boot');
  }

  preload(): void {
    this.load.on('progress', (value: number) => this.game.events.emit(BOOT_EVENT.progress, value));
    queueTankTextures(this.load);
    queueSpiderTextures(this.load);
    queueHoverTextures(this.load);
  }

  create(): void {
    createRuntimeTextures(this);
    this.game.events.emit(BOOT_EVENT.ready);
    this.scene.start(firstScene(this.services, location.search));
  }
}
