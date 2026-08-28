import {
  DisposableScope,
  VirtualActionSource,
  observeAppVisibility,
  shouldUseTouchControls,
} from '@volstudio/core';
import { pushBackHandler } from '@/app/backNavigation';
import type { HellAction } from '@/config/input';
import type { AbilityRuntime } from '@/runtime/ability/AbilityRuntime';
import type { AbilitySlot } from '@/runtime/ability/types';
import { TouchControls } from '@/runtime/ui/TouchControls';

export interface GameMobileControlsOptions {
  readonly parent: HTMLElement;
  readonly onAbility: (slot: AbilitySlot) => boolean;
  readonly onPauseToggle: () => void;
  readonly isPaused: () => boolean;
  readonly isAbilityBlocked: () => boolean;
  readonly isCardScreenOpen: () => boolean;
  readonly isDeathScreenVisible: () => boolean;
  /** Bitiş kaydı/özeti sürerken geri ve pause oyunu devam ettiremez. */
  readonly isRunEnding: () => boolean;
}

/**
 * GameScene'in platform köprüsü: sanal eylem, ekran düğmeleri, uygulama
 * görünürlüğü ve Android geri hareketi aynı yaşam döngüsünde kapanır.
 *
 * Bunları sahnenin içine ayrı alanlar olarak yaymak restart sırasında bir
 * listener'ın unutulmasını kolaylaştırıyor ve zaten büyük olan sahneyi mobil
 * ayrıntılarla büyütüyordu. Bu sınıf oyun kuralı taşımaz; yalnızca cihaz
 * olaylarını sahnenin verdiği niyet callback'lerine çevirir.
 */
export class GameMobileControls {
  readonly actionSource = new VirtualActionSource<HellAction>();
  private scope: DisposableScope | null = null;
  private touchControls: TouchControls | null = null;

  mount(options: GameMobileControlsOptions): void {
    this.destroy();
    const scope = new DisposableScope();
    this.scope = scope;

    try {
      if (shouldUseTouchControls()) {
        this.touchControls = scope.addDestroyable(
          new TouchControls(options.parent, {
            actionSource: this.actionSource,
            onAbility: options.onAbility,
            onPause: options.onPauseToggle,
            isAbilityBlocked: options.isAbilityBlocked,
            isPauseBlocked: options.isRunEnding,
          }),
        );
      }

      scope.addSubscription(
        observeAppVisibility((state) => {
          if (state !== 'background') return;
          // Arka plana geçiş aktif pointer'ı fiziksel olarak sonlandırmayabilir;
          // sanal eylem temizlenmezse dönüşte dash basılı kalır.
          this.actionSource.clear();
          if (!options.isPaused()) options.onPauseToggle();
        }),
      );

      scope.addSubscription(
        pushBackHandler(() => {
          // Kart seçimi ilerleme için zorunlu, koşu özeti de terminal yüzeydir;
          // Android geri hareketi ikisini sessizce atlamamalıdır.
          if (
            options.isCardScreenOpen() ||
            options.isDeathScreenVisible() ||
            options.isRunEnding()
          ) {
            return true;
          }
          options.onPauseToggle();
          return true;
        }),
      );
    } catch (error) {
      // mount yarıda kalırsa GameScene scope'a bu köprüyü henüz
      // kaydedememiştir; kısmi DOM/listener sahipliğini burada kapat.
      scope.dispose();
      this.scope = null;
      this.touchControls = null;
      this.actionSource.clear();
      throw error;
    }
  }

  refresh(abilities: AbilityRuntime): void {
    this.touchControls?.refresh(abilities);
  }

  refreshLabels(): void {
    this.touchControls?.refreshLabels();
  }

  destroy(): void {
    this.scope?.dispose();
    this.scope = null;
    this.touchControls = null;
    this.actionSource.clear();
  }
}
