import Phaser from 'phaser';
import { DisposableScope, FullscreenController } from '@volstudio/core';
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

      // Android geri hareketi (vol:androidback) fareli cihazda da onaya bağlanmalı;
      // web/masaüstünde bu olay hiç gelmediği için dinleyici zararsızdır.
      scope.addDestroyable(new LifeExitPrompt({ container: uiParent ?? document.body }));

      // F11 ve düğme AYNI denetleyiciden geçer; sahne ömrüne bağlı olduğu için
      // yeniden başlatmada ikinci bir keydown dinleyicisi birikmez.
      const fullscreen = scope.addDestroyable(
        new FullscreenController({
          onChange: (active) => this.hud?.setFullscreenActive(active),
          onError: (error) => console.warn('[VOL.LIFE] Tam ekran açılamadı:', error),
        }),
      );

      const isCurrentFullscreen = fullscreen.isFullscreen();
      this.hud = scope.addDestroyable(
        new LifeHud(uiParent, {
          showFullscreenToggle: true,
          initialFullscreen: isCurrentFullscreen,
          onToggleFullscreen: () => void fullscreen.toggle(),
        }),
      );
      this.hud.setFullscreenActive(isCurrentFullscreen);
    } catch (error) {
      scope.dispose();
      this.runtimeScope = null;
      this.hud = null;
      throw error;
    }

    // SHUTDOWN sahne yeniden başlatıldığında gelir; doğrudan yok edilmede (SceneManager.remove)
    // ise yalnız DESTROY yayılır. İkisi de aynı temizliği idempotent tetikler.
    const cleanup = (): void => {
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
      this.runtimeScope?.dispose();
      this.runtimeScope = null;
      this.hud = null;
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  }
}
