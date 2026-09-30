import {
  cancelHaptics,
  DisposableScope,
  observeAppVisibility,
  pushBackHandler,
} from '@volstudio/core';

/** Duraklatmanın görünür yüzü (HUD'un duraklatma katmanı). */
export interface PauseSurface {
  showPause(): void;
  /** Katmanı oyun adına kapatır; kullanıcı kapatışındaki `onResume` çağrılmaz. */
  hidePause(): void;
}

export interface PauseControllerOptions {
  readonly surface: PauseSurface;
  readonly onChange?: (paused: boolean) => void;
  /** Duraklatma ve sürdürme geçişinde tutulan girdiyi bırakır. */
  readonly releaseInput: () => void;
  /** Sürdürmeyi tetikleyen basışın yeniden duraklatmaması için. */
  readonly suppressPauseInput: () => void;
}

/**
 * Duraklatma durumunun tek sahibi. Girdi kenarı, Android geri hareketi,
 * uygulamanın arka plana geçmesi ve katmanın kendi düğmesi aynı durum
 * makinesine gelir. Duraklatınca titreşim kesilir, girdi bırakılır.
 */
export class PauseController {
  private state = false;
  private readonly scope = new DisposableScope();

  constructor(private readonly options: PauseControllerOptions) {
    this.scope.addSubscription(
      observeAppVisibility((visibility) => {
        if (visibility === 'background') this.pause();
      }),
    );
    this.scope.addSubscription(
      pushBackHandler(() => {
        this.toggle();
        return true;
      }),
    );
  }

  get paused(): boolean {
    return this.state;
  }

  /** Oyun içinden geçiş (kenar tuşu, geri hareketi). */
  toggle(): void {
    if (this.state) {
      this.options.surface.hidePause();
      this.resume();
    } else {
      this.pause();
    }
  }

  pause(): void {
    if (this.state) return;
    this.state = true;
    this.options.onChange?.(true);
    cancelHaptics();
    this.options.releaseInput();
    this.options.surface.showPause();
  }

  /** Katmanın kullanıcı tarafından kapatılması da buraya gelir. */
  resume(): void {
    if (!this.state) return;
    this.state = false;
    this.options.onChange?.(false);
    this.options.suppressPauseInput();
    this.options.releaseInput();
  }

  destroy(): void {
    this.scope.dispose();
  }
}
