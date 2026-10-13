import Phaser from 'phaser';
import { BLEND } from './parts';

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
    // `BLEND` Phaser'sız katmanlarda kullanılır; sabitler Phaser'dan saparsa parçalar sessizce yanlış karışırdı.
    if (Phaser.BlendModes.NORMAL !== BLEND.normal || Phaser.BlendModes.ADD !== BLEND.add)
      throw new Error('BLEND sabitleri Phaser BlendModes ile uyuşmuyor');
    this.cameras.main.setBackgroundColor('#0d1218');
  }
}
