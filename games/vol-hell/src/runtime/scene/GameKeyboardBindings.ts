import type Phaser from 'phaser';
import { DisposableScope } from '@volstudio/core';
import type { AbilitySlot } from '@/runtime/ability/types';

export interface GameKeyboardBindingOptions {
  abilityKeys: Readonly<Record<AbilitySlot, number>>;
  isAbilityBlocked: () => boolean;
  onAbility: (slot: AbilitySlot) => void;
}

/**
 * GameScene'in tuş dinleyicilerini tek sahiplik yüzeyinde toplar.
 *
 * Phaser sahne örneğini restart'ta yeniden kullanır. Key nesneleri sahne
 * kapanırken kaldırılmazsa eski closure'lar yaşamaya devam eder ve sonraki
 * koşuda Q/E birden fazla kez çalışır. Bu sınıf bağlama ve kaldırmayı
 * birlikte taşır; sahne yalnızca `destroy()` çağırır.
 *
 * ESC'nin burada OLMAMASI bilinçlidir: duraklatma ortak geri yığınına
 * bağlıdır (`pushBackHandler` → `onPauseToggle`); Escape `FocusNavController`
 * üzerinden aynı zincire düşer. İki yol aynı anda dinlerse tek basış iki
 * kez toggle üretirdi.
 */
export class GameKeyboardBindings {
  private readonly scope = new DisposableScope();

  constructor(
    private readonly keyboard: Phaser.Input.Keyboard.KeyboardPlugin,
    options: GameKeyboardBindingOptions,
  ) {
    try {
      for (const slot of ['primary', 'secondary'] as const) {
        this.bind(options.abilityKeys[slot], () => {
          if (options.isAbilityBlocked()) return;
          options.onAbility(slot);
        });
      }
    } catch (error) {
      // Constructor yarıda kalırsa çağıran nesne referansını alamaz. O ana
      // kadar bağlanan key closure'larını burada geri bırakmak zorundayız.
      this.scope.dispose();
      throw error;
    }
  }

  /** Dinleyicileri ve Phaser'ın key/capture sahipliğini kaldırır. */
  destroy(): void {
    this.scope.dispose();
  }

  private bind(keyCode: number, handler: () => void): void {
    const key = this.keyboard.addKey(keyCode);
    key.on('down', handler);
    this.scope.add({
      dispose: () => {
        key.off('down', handler);
        this.keyboard.removeKey(key, true, true);
      },
    });
  }
}
