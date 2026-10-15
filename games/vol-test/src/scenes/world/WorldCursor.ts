import type { Disposable } from '@volstudio/core';
import { CursorController, type CursorControllerOptions } from '@volstudio/core/ui';

export interface WorldCursorOptions {
  /** Nişangâhın izlediği yüzey: oyun tuvali. HUD ayrı öğelerdir; üstlerinde nişangâh çıkmaz. */
  readonly target: HTMLElement;
  /** Önceden yüklenmiş imleç kaydı (test); verilmezse CORE `assets/cursors`ı getirir. */
  readonly data?: CursorControllerOptions['data'];
}

/** Nişangâhın göründüğü girdi kipi: yalnız fare/klavye; kol ve dokunma kendi nişan göstergesini taşır. */
const POINTER_MODE = 'pc';

/**
 * Dünya sahnesinin fare nişangâhı. Sistem imleci tuvalde gizlenir, CORE nişangâhı çizilir; duraklatma,
 * ölüm ya da kol/dokunma girdisinde nişangâh söner ve tuval arayüz imlecini miras alır. Genel arayüz
 * imleçleri (`--vol-cursor-*`) oyun servislerindeki denetleyicidedir; bu sınıf onlara dokunmaz.
 */
export class WorldCursor implements Disposable {
  private readonly controller: CursorController;
  private shown = false;

  constructor(options: WorldCursorOptions) {
    this.controller = new CursorController({
      target: options.target,
      mode: 'shooter',
      reticle: 'ringDot',
      chrome: false,
      ...(options.data ? { data: options.data } : {}),
    });
    this.controller.setVisible(false);
  }

  /** Her karede: nişangâh yalnız canlı, duraklatılmamış ve fare girdisindeyken görünür. */
  update(state: {
    readonly mode: string | undefined;
    readonly paused: boolean;
    readonly alive: boolean;
  }): void {
    const visible = !state.paused && state.alive && (state.mode ?? POINTER_MODE) === POINTER_MODE;
    if (visible === this.shown) return;
    this.shown = visible;
    this.controller.setVisible(visible);
  }

  /** Oyuncunun atışı: nişangâh kısa büyür. */
  fired(): void {
    if (this.shown) this.controller.pulseReticle();
  }

  /** Oyuncunun isabeti: nişangâh kısa süre düşman tonuna döner. */
  hit(): void {
    if (this.shown) this.controller.markHit('hostile');
  }

  get visible(): boolean {
    return this.shown;
  }

  dispose(): void {
    this.controller.dispose();
  }
}
