import type Phaser from 'phaser';
import { Vector2 } from '../math/Vector2';
import { PCController } from './PCController';
import type { InputProvider } from './InputProvider';
import type { InputState } from './InputState';
import type { InputSnapshot } from './InputSnapshot';
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

    const touch = this.providers[0];
    // noUncheckedIndexedAccess kapali oldugu icin TS bos diziyi yakalamiyor;
    // guard olmadan getState() ilk satirda anlamsiz bir TypeError atardi.
    if (!touch) {
      throw new Error('InputManager: en az bir InputProvider gerekli (providers boş olamaz)');
    }
    this.touch = touch;
  }

  /**
   * Aktif saglayiciyi secer. getState() ve getDebugSnapshot() AYNI secimi
   * kullanmali — aksi halde debug overlay 'pc' gosterirken oyun touch state'i
   * kullanir ve hata ayiklama araci yaniltir.
   */
  private resolveActiveProvider(): InputProvider | undefined {
    if (this.touch.isActive) return this.touch;
    return this.providers.find((provider) => provider.isActive);
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
    const active = this.resolveActiveProvider();
    if (active) {
      return active.getState(playerPosition);
    }

    return { move: Vector2.zero(), aim: Vector2.zero(), fire: false, dash: false };
  }

  /** Aktif input provider'ın ham durum snapshot'ını döner. */
  getDebugSnapshot(): InputSnapshot {
    const active = this.resolveActiveProvider();
    if (active?.getDebugSnapshot) {
      return active.getDebugSnapshot();
    }
    return { activeProvider: 'none' };
  }

  destroy(): void {
    for (const provider of this.providers) {
      provider.destroy();
    }
  }
}
