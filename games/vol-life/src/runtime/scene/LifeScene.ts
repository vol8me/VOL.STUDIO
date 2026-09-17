import Phaser from 'phaser';
import {
  DisposableScope,
  FullscreenController,
  applyVolViewport,
  i18n,
  vibrate,
  setHapticsEnabled,
  type SimulationClockFrame,
} from '@volstudio/core';
import { getRuntimePlatform, type RuntimePlatform } from '@volstudio/tauri-v2';
import { DEFAULT_LIFE_PREFERENCES, type LifePreferences } from '@/app/LifePreferences';
import { OrientationPreference } from '@/app/OrientationPreference';
import { installSnapshotProbe } from '@/app/snapshotProbe';
import type {
  LifeWorldAutosave,
  LifeWorldLoadIssue,
  LifeWorldPersistence,
} from '@/app/LifeWorldPersistence';
import { LifeRuntime } from '@/runtime/LifeRuntime';
import type { LifeWorldSnapshot } from '@/runtime/sim/LifeWorld';
import { LifeExitPrompt } from '@/runtime/ui/LifeExitPrompt';
import { LifeHud } from '@/runtime/ui/LifeHud';
import { LifeOptionsPanel } from '@/runtime/ui/LifeOptionsPanel';

export interface LifeSceneServices {
  readonly platform: RuntimePlatform;
  readonly preferences: LifePreferences | null;
  readonly orientation: OrientationPreference;
  readonly initialWorldSnapshot: LifeWorldSnapshot | null;
  /** Kayıt yüklenemediyse nedeni; HUD kurulduğunda kullanıcıya bir kez söylenir. */
  readonly initialWorldLoadIssue: LifeWorldLoadIssue | null;
  readonly worldPersistence: Pick<LifeWorldPersistence, 'attach'> | null;
  /** Development audition genomu digest'i; üretimde null. */
  readonly auditionDigest: string | null;
  /** Varsayılan dışında bir kamera adayı koşuyorsa kimliği (D5). */
  readonly cameraCandidateId: string | null;
  /** Kabul oturumu paneli; YALNIZ geliştirme derlemesinde dolu gelir (P1/P2). */
  readonly researchContent: { readonly element: HTMLElement } | null;
  readonly createRuntime: (
    scene: Phaser.Scene,
    initialSnapshot: LifeWorldSnapshot | null,
  ) => LifeSceneRuntime;
}

export interface LifeSceneRuntime {
  update(deltaMs: number): SimulationClockFrame;
  refreshViewport(): void;
  snapshot(): LifeWorldSnapshot;
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
  private lifecycleUnsubscribe: (() => void) | null = null;
  private hud: LifeHud | null = null;
  private worldRuntime: LifeSceneRuntime | null = null;
  private readonly services: LifeSceneServices;

  constructor(services: Partial<LifeSceneServices> = {}) {
    super({ key: 'LifeScene' });
    this.services = {
      platform: services.platform ?? getRuntimePlatform(),
      preferences: services.preferences ?? null,
      orientation: services.orientation ?? new OrientationPreference(null),
      initialWorldSnapshot: services.initialWorldSnapshot ?? null,
      initialWorldLoadIssue: services.initialWorldLoadIssue ?? null,
      worldPersistence: services.worldPersistence ?? null,
      auditionDigest: services.auditionDigest ?? null,
      cameraCandidateId: services.cameraCandidateId ?? null,
      researchContent: services.researchContent ?? null,
      createRuntime:
        services.createRuntime ??
        ((scene, initialSnapshot) => new LifeRuntime(scene, { initialSnapshot })),
    };
  }

  create(): void {
    /*
     * Sahne SHUTDOWN almadan yeniden kurulursa (Phaser `scene.restart()`),
     * önceki kapsam sahipsiz kalır: HUD elemanları DOM'da, rAF döngüsü ve dil
     * aboneliği ayakta kalırdı. İkinci kurulum ilkini kendisi toplar.
     */
    this.teardownRuntime();

    const scope = new DisposableScope();
    this.runtimeScope = scope;

    try {
      // Kamera rasterleme çarpanına göre kurulur; çağrılmazsa arka tampon DPR ile
      // büyür ama kamera yakınlaşmaz ve dünya küçük çizilir.
      applyVolViewport(this);

      this.worldRuntime = scope.addDestroyable(
        this.services.createRuntime(this, this.services.initialWorldSnapshot),
      );
      if (this.scale) {
        /*
         * Z2 ölçüm kancası yalnız geliştirmede kurulur; koşul sabit olduğu
         * için üretim derlemesinde kanca da kodek çağrısı da bulunmaz.
         */
        if (import.meta.env.DEV) {
          const runtime = this.worldRuntime;
          scope.add({ dispose: installSnapshotProbe(runtime, 'ölçüm') });
        }
        const refreshWorldViewport = (): void => this.worldRuntime?.refreshViewport();
        this.scale.on(Phaser.Scale.Events.RESIZE, refreshWorldViewport);
        scope.addSubscription(() =>
          this.scale.off(Phaser.Scale.Events.RESIZE, refreshWorldViewport),
        );
      }

      const { platform, preferences, orientation } = this.services;
      const preferenceState = preferences?.get() ?? DEFAULT_LIFE_PREFERENCES;
      const uiParent = this.game.canvas.parentElement ?? undefined;

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
            onSelect: (value) => {
              if (value) {
                setHapticsEnabled(true);
                vibrate('select');
              } else {
                vibrate('select');
                setHapticsEnabled(false);
              }
              void preferences?.setHapticsEnabled(value);
            },
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
          optionsContent: this.optionsContent(panel),
          showFps: preferenceState.showFps,
          ...(this.services.auditionDigest ? { auditionDigest: this.services.auditionDigest } : {}),
          ...(this.services.cameraCandidateId
            ? { cameraCandidateId: this.services.cameraCandidateId }
            : {}),
        }),
      );
      if (this.services.initialWorldLoadIssue) {
        this.hud.showWorldLoadIssue(this.services.initialWorldLoadIssue);
      }
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
      let autosave: LifeWorldAutosave | null = null;
      if (this.services.worldPersistence) {
        autosave = this.services.worldPersistence.attach(this.worldRuntime, {
          onError: () => this.hud?.showWorldSaveError(),
        });
        scope.addDestroyable(autosave);
      }
      if (platform === 'android') {
        scope.addDestroyable(
          new LifeExitPrompt({
            container: uiParent ?? document.body,
            ...(autosave ? { beforeClose: () => autosave.flush() } : {}),
          }),
        );
      }
    } catch (error) {
      this.teardownRuntime();
      throw error;
    }

    // SHUTDOWN sahne yeniden başlatıldığında gelir; doğrudan yok edilmede (SceneManager.remove)
    // ise yalnız DESTROY yayılır. İkisi de aynı temizliği idempotent tetikler.
    const cleanup = (): void => this.teardownRuntime();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    this.lifecycleUnsubscribe = () => {
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
    };
  }

  update(_time: number, delta: number): void {
    this.worldRuntime?.update(delta);
  }

  private teardownRuntime(): void {
    this.lifecycleUnsubscribe?.();
    this.lifecycleUnsubscribe = null;
    this.runtimeScope?.dispose();
    this.runtimeScope = null;
    this.hud = null;
    this.worldRuntime = null;
  }

  /*
   * Kabul oturumu paneli seçenek çekmecesinin ALTINA eklenir: cihazda adres
   * çubuğu olmadığı için aday geçişinin tek yolu burasıdır. Üretimde
   * `researchContent` her zaman null gelir ve kap hiç kurulmaz.
   */
  private optionsContent(panel: { element: HTMLElement }): { element: HTMLElement } {
    const research = this.services.researchContent;
    if (!research) return panel;
    const wrapper = document.createElement('div');
    wrapper.className = 'vol-life-options-stack';
    // Stil satır içi: kap yalnız geliştirmede kurulur, üretim CSS'ine girmez.
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '12px';
    wrapper.append(panel.element, research.element);
    return { element: wrapper };
  }
}
