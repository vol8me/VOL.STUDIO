import type Phaser from 'phaser';
import { Vector2 } from '../math/Vector2';
import { PCController } from './PCController';
import type { InputProvider } from './InputProvider';
import type { InputState } from './InputState';
import { TouchController } from './TouchController';

export class InputManager {
  private readonly providers: InputProvider[];
  private readonly touch: InputProvider;

  /**
   * `providers` testler için enjekte edilebilir. Verilmezse gerçek
   * TouchController/PCController kurulur; ilk eleman her zaman "touch" sağlayıcı kabul edilir.
   */
  constructor(scene: Phaser.Scene, providers?: InputProvider[]) {
    this.providers = providers ?? [new TouchController(scene), new PCController(scene)];
    this.touch = this.providers[0];
  }

  update(delta: number): void {
    for (const provider of this.providers) {
      provider.update(delta);
    }
  }

  /**
   * Touch her zaman PC'den önce kontrol edilir: stale bir `activePointer`
   * (dokunuştan miras kalan) PC'ye yanlışlıkla öncelik verdirmemeli.
   */
  getState(playerPosition: Vector2): InputState {
    if (this.touch.isActive) {
      return this.touch.getState(playerPosition);
    }

    for (const provider of this.providers) {
      if (provider.isActive) {
        return provider.getState(playerPosition);
      }
    }

    return { move: Vector2.zero(), aim: Vector2.zero(), fire: false, dash: false };
  }

  destroy(): void {
    for (const provider of this.providers) {
      provider.destroy();
    }
  }
}
