import type { VirtualActionSource, VirtualStickSource } from '@volstudio/core';
import type { GraphicsQuality } from '@volstudio/core/graphics';
import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import {
  FpsMeter,
  InputPresentationController,
  ToastManager,
  UIRoot,
  type UiIntentBus,
} from '@volstudio/core/ui';
import type { EffectLevel, EffectProfile } from '@/config/quality';
import type { GameServices } from '@/app/GameServices';
import type { TestAction } from '@/input/bindings';
import { ClimateStatus } from './ClimateStatus';
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
  /** Haritadaki soluk ızgaranın aralığı (dünya birimi). */
  readonly mapGridStep: number;
  /** Haritada kaç ızgara aralığında bir belirgin çizgi çekileceği. */
  readonly mapGridMajorEvery: number;
  readonly actionSource: VirtualActionSource<TestAction>;
  readonly stickSource: VirtualStickSource;
  /** Ekran üstü düğmeler başlangıçta gösterilsin mi (dokunmatik birincil cihaz). */
  readonly touch: boolean;
  /** Tam ekran düğmesi sunulsun mu (native kabuk kendi kipini yönetir). */
  readonly fullscreen: boolean;
  readonly initialInputMode?: string;
  readonly readInputState?: () => {
    mode: string | undefined;
    padId: string;
    padConnected: boolean;
  };
  /** Efekt kalitesi; duraklatma menüsünden seçilir. */
  readonly quality: GraphicsQuality<EffectLevel, EffectProfile>;
  readonly services?: GameServices;
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
  private readonly uiRoot: UIRoot;
  private readonly presentation: InputPresentationController;
  private readonly status: StatusPanel;
  private readonly climate: ClimateStatus;
  private readonly map: MapPanel;
  private readonly hints: ControlHints;
  private readonly touch: TouchControls;
  private readonly pause: PauseOverlay;
  private readonly fullscreen: FullscreenToggle | null;
  private inputMode: string | undefined;
  private statusDueMs = 0;
  private mapDueMs = 0;

  /** HUD kökünün anlamsal UI niyet veriyolu: arayüz sesi ve titreşim buna abone olur. */
  get intents(): UiIntentBus {
    return this.uiRoot.intents;
  }

  /** HUD kök elemanı: hover/odak sesi bu kökten dinlenir. */
  get rootElement(): HTMLElement {
    return this.uiRoot.element;
  }

  constructor(options: HudOptions) {
    const root = this.scope.addDestroyable(new UIRoot(options.parent));
    this.uiRoot = root;
    this.layer = document.createElement('div');
    this.layer.className = 'vt-hud';
    this.layer.dataset.testid = 'hud';

    this.presentation = this.scope.addDestroyable(
      new InputPresentationController({
        initialMode: options.initialInputMode,
        readState: options.readInputState,
        context: () => options.services?.glyphContext ?? {},
      }),
    );
    this.status = this.scope.addDestroyable(new StatusPanel(options.metre));
    this.climate = this.scope.addDestroyable(new ClimateStatus());
    this.map = this.scope.addDestroyable(
      new MapPanel({
        worldWidth: options.worldWidth,
        worldHeight: options.worldHeight,
        metre: options.metre,
        gridStep: options.mapGridStep,
        gridMajorEvery: options.mapGridMajorEvery,
      }),
    );
    this.hints = this.scope.addDestroyable(new ControlHints(this.presentation));
    this.touch = this.scope.addDestroyable(
      new TouchControls(options.actionSource, options.stickSource),
    );
    const fps = this.scope.addDestroyable(new FpsMeter({ position: 'bottom-right' }));
    this.pause = this.scope.addDestroyable(
      new PauseOverlay(
        options.onResume,
        options.quality,
        options.services?.settings,
        options.services?.displayAvailable,
      ),
    );
    this.fullscreen = options.fullscreen
      ? this.scope.addDestroyable(
          new FullscreenToggle(
            options.services ? () => options.services?.display?.toggle() : undefined,
          ),
        )
      : null;

    this.layer.append(
      ...this.status.elements,
      this.climate.element,
      this.map.element,
      this.hints.element,
      this.touch.element,
      fps.element,
    );
    if (this.fullscreen) this.layer.append(this.fullscreen.element);
    root.mount(this.layer);
    root.mount(this.pause.element);
    // Kayıt kurtarma/sıfırlama oyuncuya söylenir (yalnız konsola değil); geç abone olan HUD geçmişi de alır.
    const toasts = this.scope.addDestroyable(new ToastManager(root.element));
    const integrity = options.services?.integrity;
    if (integrity) {
      this.scope.addSubscription(
        integrity.subscribe((event) => {
          toasts.show(
            i18next.t(
              event.kind === 'recovered'
                ? 'voltest:integrity.recovered'
                : 'voltest:integrity.reset',
            ),
            { variant: event.kind === 'recovered' ? 'warning' : 'danger', critical: true },
          );
        }),
      );
    }
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
    if (this.presentation) this.presentation.poll();
    const mode = this.presentation.mode;
    if (mode !== undefined && mode !== this.inputMode) {
      this.inputMode = mode;
      this.setTouchMode(mode === 'touch');
    }
    this.layer.classList.toggle('vt-hud--boosting', frame.boosting);
    if (nowMs >= this.statusDueMs) {
      this.statusDueMs = nowMs + STATUS_INTERVAL_MS;
      this.status.update(frame);
      this.climate.update(frame.climate);
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
    this.climate.refreshLabels();
    this.statusDueMs = 0;
    this.hints.refreshLabels();
    this.touch.refreshLabels();
    this.pause.refreshLabels();
    this.fullscreen?.refreshLabels();
  }
}
