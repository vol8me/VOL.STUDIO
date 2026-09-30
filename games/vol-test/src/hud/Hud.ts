import type { VirtualActionSource } from '@volstudio/core';
import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { FpsMeter, InputPresentationController, UIRoot } from '@volstudio/core/ui';
import type { TestAction } from '@/input/bindings';
import { ControlHints } from './ControlHints';
import { FullscreenToggle } from './FullscreenToggle';
import type { HudFrame } from './HudFrame';
import { MapPanel } from './MapPanel';
import { PauseOverlay } from './PauseOverlay';
import { StatusPanel } from './StatusPanel';
import { TouchControls } from './TouchControls';
import './hud.css';

export interface HudOptions {
  readonly parent: HTMLElement;
  readonly metre: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly actionSource: VirtualActionSource<TestAction>;
  /** Ekran üstü düğmeler başlangıçta gösterilsin mi (dokunmatik birincil cihaz). */
  readonly touch: boolean;
  /** Tam ekran düğmesi sunulsun mu (native kabuk kendi kipini yönetir). */
  readonly fullscreen: boolean;
  readonly initialInputMode?: string;
  readonly onResume: () => void;
}

/** Telemetri saniyede ~15, harita ~10 kez yenilenir; her karede DOM yazılmaz. */
const STATUS_INTERVAL_MS = 66;
const MAP_INTERVAL_MS = 100;

/**
 * VOL.TEST HUD'u: parçaları kurar, girdi kipine göre dokunmatik ve masaüstü
 * düzeni arasında geçer, güncellemeyi seyreltir. Görünen her parça CORE
 * bileşenidir; oyun yalnız içeriği ve yerleşimi (hud.css) verir.
 */
export class Hud {
  private readonly scope = new DisposableScope();
  private readonly layer: HTMLDivElement;
  private readonly presentation: InputPresentationController;
  private readonly status: StatusPanel;
  private readonly map: MapPanel;
  private readonly hints: ControlHints;
  private readonly touch: TouchControls;
  private readonly pause: PauseOverlay;
  private readonly fullscreen: FullscreenToggle | null;
  private inputMode: string | undefined;
  private statusDueMs = 0;
  private mapDueMs = 0;

  constructor(options: HudOptions) {
    const root = this.scope.addDestroyable(new UIRoot(options.parent));
    this.layer = document.createElement('div');
    this.layer.className = 'vt-hud';
    this.layer.dataset.testid = 'hud';

    this.presentation = this.scope.addDestroyable(
      new InputPresentationController({ initialMode: options.initialInputMode }),
    );
    this.status = this.scope.addDestroyable(new StatusPanel(options.metre));
    this.map = this.scope.addDestroyable(
      new MapPanel(options.worldWidth, options.worldHeight, options.metre),
    );
    this.hints = this.scope.addDestroyable(new ControlHints(this.presentation));
    this.touch = this.scope.addDestroyable(new TouchControls(options.actionSource));
    const fps = this.scope.addDestroyable(new FpsMeter({ position: 'bottom-right' }));
    this.pause = this.scope.addDestroyable(new PauseOverlay(options.onResume));
    this.fullscreen = options.fullscreen ? this.scope.addDestroyable(new FullscreenToggle()) : null;

    this.layer.append(
      ...this.status.elements,
      this.map.element,
      this.hints.element,
      this.touch.element,
      fps.element,
    );
    if (this.fullscreen) this.layer.append(this.fullscreen.element);
    root.mount(this.layer);
    root.mount(this.pause.element);
    this.scope.addSubscription(() => this.layer.remove());

    this.setTouchMode(options.touch);
    this.presentation.start();
    const onLanguage = (): void => this.refreshLabels();
    i18next.on('languageChanged', onLanguage);
    this.scope.addSubscription(() => i18next.off('languageChanged', onLanguage));
  }

  get paused(): boolean {
    return this.pause.isOpen;
  }

  /** Dokunmatik kipte ekran düğmeleri görünür, klavye/kol ipuçları gizlenir. */
  setTouchMode(touch: boolean): void {
    this.layer.dataset.mode = touch ? 'touch' : 'desktop';
    this.touch.setVisible(touch);
    this.hints.setVisible(!touch);
  }

  showPause(): void {
    this.pause.open();
  }

  hidePause(): void {
    this.pause.close();
  }

  update(frame: HudFrame, nowMs: number): void {
    const mode = this.presentation.mode;
    if (mode !== undefined && mode !== this.inputMode) {
      this.inputMode = mode;
      this.setTouchMode(mode === 'touch');
    }
    this.layer.classList.toggle('vt-hud--boosting', frame.boosting);
    if (nowMs >= this.statusDueMs) {
      this.statusDueMs = nowMs + STATUS_INTERVAL_MS;
      this.status.update(frame);
    }
    if (nowMs >= this.mapDueMs) {
      this.mapDueMs = nowMs + MAP_INTERVAL_MS;
      this.map.update(frame);
    }
  }

  destroy(): void {
    this.scope.dispose();
  }

  private refreshLabels(): void {
    this.status.refreshLabels();
    this.statusDueMs = 0;
    this.hints.refreshLabels();
    this.touch.refreshLabels();
    this.pause.refreshLabels();
    this.fullscreen?.refreshLabels();
  }
}
