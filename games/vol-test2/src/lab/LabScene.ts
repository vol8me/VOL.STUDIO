import Phaser from 'phaser';

export const LAB_SCENE_KEY = 'lab';

/**
 * Laboratuvarın boş sahnesi: SVG yükleri nesnelerini buraya koyar. Mantık yoktur; kare başına
 * iş runtime'ın `prestep` kancasındadır, böylece oyun sahnesi ve laboratuvar sahnesi aynı yoldan ölçülür.
 */
export class LabScene extends Phaser.Scene {
  constructor() {
    super(LAB_SCENE_KEY);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0d1218');
  }
}
