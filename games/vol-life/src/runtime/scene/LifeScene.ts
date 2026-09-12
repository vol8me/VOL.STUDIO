import Phaser from 'phaser';
import {
  DisposableScope,
  FullscreenController,
  applyVolViewport,
  i18n,
  setHapticsEnabled,
  type SimulationClockFrame,
} from '@volstudio/core';
import { getRuntimePlatform, type RuntimePlatform } from '@volstudio/tauri-v2';
import { DEFAULT_LIFE_PREFERENCES, type LifePreferences } from '@/app/LifePreferences';
import { OrientationPreference } from '@/app/OrientationPreference';
import { LifeRuntime } from '@/runtime/LifeRuntime';
import { LifeExitPrompt } from '@/runtime/ui/LifeExitPrompt';
import { LifeHud } from '@/runtime/ui/LifeHud';
import { LifeOptionsPanel } from '@/runtime/ui/LifeOptionsPanel';

export interface LifeSceneServices {
  readonly platform: RuntimePlatform;
  readonly preferences: LifePreferences | null;
  readonly orientation: OrientationPreference;
  readonly createRuntime: (scene: Phaser.Scene) => LifeSceneRuntime;
}

export interface LifeSceneRuntime {
  update(deltaMs: number): SimulationClockFrame;
  refreshViewport(): void;
  destroy(): void;
}

/**
 * Dünyanın sunum kabuğu.
 *
 * Sahne BAĞLAMA katmanıdır: simülasyon `runtime/sim` içinde Phaser'sız koşar,
 * sahne yalnız onu kurar ve çizdirir. Platform kararları (tam ekran düğmesi,
 * çıkış onayı, görüntü kipi) kabuğa bağlıdır, işaretçi türüne değil.
 */
export class LifeScene extends Phaser.Scene {
  private runtimeScope: DisposableScope | null = null;
  private hud: LifeHud | null = null;
  private worldRuntime: LifeSceneRuntime | null = null;
  private readonly services: LifeSceneServices;

  constructor(services: Partial<LifeSceneServices> = {}) {
    super({ key: 'LifeScene' });
    this.services = {
      platform: services.platform ?? getRuntimePlatform(),
      preferences: services.preferences ?? null,
      orientation: services.orientation ?? new OrientationPreference(null),
      createRuntime: services.createRuntime ?? ((scene) => new LifeRuntime(scene)),
    };
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
      // Kamera rasterleme çarpanına göre kurulur; çağrılmazsa arka tampon DPR ile
      // büyür ama kamera yakınlaşmaz ve dünya küçük çizilir.
      applyVolViewport(this);

      this.worldRuntime = scope.addDestroyable(this.services.createRuntime(this));
      if (this.scale) {
        const refreshWorldViewport = (): void => this.worldRuntime?.refreshViewport();
        this.scale.on(Phaser.Scale.Events.RESIZE, refreshWorldViewport);
        scope.addSubscription(() =>
          this.scale.off(Phaser.Scale.Events.RESIZE, refreshWorldViewport),
        );
      }

      const { platform, preferences, orientation } = this.services;
      const preferenceState = preferences?.get() ?? DEFAULT_LIFE_PREFERENCES;
      const uiParent = this.game.canvas.parentElement ?? undefined;

      // Geri hareketi yalnız Android kabuğunda gelir; fareli Android'de de gelir.
      if (platform === 'android') {
        scope.addDestroyable(new LifeExitPrompt({ container: uiParent ?? document.body }));
      }

      // Tam ekran düğmesi yalnız web'dedir: Android kabuğu çubukları zaten gizler,
      // masaüstünde kip seçenekler panelinden ve F11'den native pencereye gider.
      const fullscreen =
        platform === 'web'
          ? scope.addDestroyable(
              new FullscreenController({
                onChange: (active) => this.hud?.setFullscreenActive(active),
                onError: (error) => console.warn('[VOL.LIFE] Tam ekran açılamadı:', error),
              }),
            )
          : null;

      const panel = scope.addDestroyable(
        new LifeOptionsPanel({
          language: {
            value: i18n.getLocale(),
            onSelect: (value) => {
              void i18n.changeLanguage(value).catch((error: unknown) => {
                console.warn('[VOL.LIFE] Dil tercihi uygulanamadı:', error);
              });
            },
          },
          showFps: {
            value: preferenceState.showFps,
            onSelect: (value) => void preferences?.setShowFps(value),
          },
          haptics: {
            value: preferenceState.hapticsEnabled,
            onSelect: (value) => void preferences?.setHapticsEnabled(value),
          },
          orientation: {
            value: orientation.current(),
            interactive: orientation.isInteractive(),
            onSelect: (value) => void orientation.select(value),
          },
          displayMode:
            platform === 'desktop' && preferences
              ? {
                  value: preferenceState.displayMode,
                  onSelect: (mode) => void preferences.setDisplayMode(mode),
                }
              : undefined,
        }),
      );
      scope.addSubscription(orientation.subscribe((value) => panel.setOrientation(value)));
      scope.addSubscription(
        orientation.subscribeInteractive((interactive) =>
          panel.setOrientationInteractive(interactive),
        ),
      );

      this.hud = scope.addDestroyable(
        new LifeHud(uiParent, {
          fullscreen: fullscreen
            ? { initialActive: fullscreen.isFullscreen(), onToggle: () => void fullscreen.toggle() }
            : undefined,
          optionsContent: panel,
          showFps: preferenceState.showFps,
        }),
      );
      if (preferences) {
        scope.addSubscription(
          preferences.subscribeSaveErrors(() => this.hud?.showPreferenceSaveError()),
        );
        scope.addSubscription(
          preferences.subscribe((state) => {
            panel.setDisplayMode(state.displayMode);
            panel.setShowFps(state.showFps);
            panel.setHapticsEnabled(state.hapticsEnabled);
            this.hud?.setFpsVisible(state.showFps);
            setHapticsEnabled(state.hapticsEnabled);
          }),
        );
      }
    } catch (error) {
      scope.dispose();
      this.runtimeScope = null;
      this.hud = null;
      this.worldRuntime = null;
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
      this.worldRuntime = null;
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  }

  update(_time: number, delta: number): void {
    this.worldRuntime?.update(delta);
  }
}
