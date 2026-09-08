import Phaser from 'phaser';
import { DisposableScope, FullscreenController, shouldUseTouchControls } from '@volstudio/core';
import { LifeExitPrompt } from '@/runtime/ui/LifeExitPrompt';
import { LifeHud } from '@/runtime/ui/LifeHud';

/**
 * Dünyanın sunum kabuğu.
 *
 * Sahne BAĞLAMA katmanıdır: simülasyon `runtime/sim` içinde Phaser'sız koşar,
 * sahne yalnız onu kurar ve çizdirir. Kural bir tercihe değil ölçüme dayanır —
 * mantık sahnede biriktiğinde headless ölçüm ve kapsam ikisi birden imkânsız
 * hale gelir.
 */
export class LifeScene extends Phaser.Scene {
  private runtimeScope: DisposableScope | null = null;
  private hud: LifeHud | null = null;

  constructor() {
    super({ key: 'LifeScene' });
  }

  create(): void {
    /*
     * Sahne SHUTDOWN almadan yeniden kurulursa (Phaser `scene.restart()`),
     * önceki kapsam sahipsiz kalır: HUD elemanları DOM'da, rAF döngüsü ve dil
     * aboneliği ayakta kalırdı. İkinci kurulum ilkini kendisi toplar.
     */
    this.runtimeScope?.dispose();

    const scope = new DisposableScope();
    this.runtimeScope = scope;

    try {
      const uiParent = this.game.canvas.parentElement ?? undefined;
      const touchDevice = shouldUseTouchControls();

      if (touchDevice) {
        scope.addDestroyable(new LifeExitPrompt({ container: uiParent ?? document.body }));
      }

      // F11 ve düğme AYNI denetleyiciden geçer; sahne ömrüne bağlı olduğu için
      // yeniden başlatmada ikinci bir keydown dinleyicisi birikmez.
      const fullscreen = scope.addDestroyable(
        new FullscreenController({
          onChange: (active) => this.hud?.setFullscreenActive(active),
          onError: (error) => console.warn('[VOL.LIFE] Tam ekran açılamadı:', error),
        }),
      );

      this.hud = scope.addDestroyable(
        new LifeHud(uiParent, {
          // Android uygulaması zaten tam ekran açılır; orada düğme hem
          // anlamsız hem de başparmağın yolunda durur.
          showFullscreenToggle: !touchDevice,
          onToggleFullscreen: () => void fullscreen.toggle(),
        }),
      );
    } catch (error) {
      scope.dispose();
      this.runtimeScope = null;
      this.hud = null;
      throw error;
    }

    // SHUTDOWN sahne yeniden başlatıldığında da gelir; DESTROY gelmeyebilir.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.runtimeScope?.dispose();
      this.runtimeScope = null;
      this.hud = null;
    });
  }
}
