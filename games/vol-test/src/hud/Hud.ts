import type { VirtualActionSource, VirtualStickSource } from '@volstudio/core';
import type { SkillId } from '@/config/skills';
import type { MessageKey } from '@/i18n/keys';
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
import { HUD } from '@/config/hud';
import type { EffectLevel, EffectProfile } from '@/config/quality';
import type { GameServices } from '@/app/GameServices';
import type { TestAction } from '@/input/bindings';
import { ControlHints } from './ControlHints';
import { FullscreenToggle } from './FullscreenToggle';
import type { HudFrame } from './HudFrame';
import { MapPanel } from './MapPanel';
import { PauseOverlay, type PauseAction } from './PauseOverlay';
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
  /** Haritanın açılış yakınlaştırması ve üst sınırı; verilmezse bütün dünya. */
  readonly mapZoom?: number;
  readonly mapMaxZoom?: number;
  /** Harita zemini (göller): dünya ölçüsünde, saydam tuval. */
  readonly mapTerrain?: CanvasImageSource;
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
  /** Dünya sunucuda akar (çevrimiçi): duraklatma yoktur, katman canlı "Menü"dür. */
  readonly live?: boolean;
}

/** Telemetri saniyede ~15 kez yenilenir; her karede DOM yazılmaz. Harita kalite profilindeki aralıkla yenilenir. */
const STATUS_INTERVAL_MS = 66;

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
  private readonly map: MapPanel;
  private readonly hints: ControlHints;
  private readonly touch: TouchControls;
  private readonly pause: PauseOverlay;
  private readonly toasts: ToastManager;
  private readonly fullscreen: FullscreenToggle | null;
  private inputMode: string | undefined;
  /** Tank dışı araçta yetenek (Space); tankta `null`. */
  private skill: SkillId | null = null;
  private readonly quality: HudOptions['quality'];
  private statusDueMs = 0;
  private mapDueMs = 0;
  /** İpuçlarının solacağı kare saati; ilk güncellemede kurulur (sahne saati sahneyle başlamaz). */
  private hintsUntilMs: number | null = null;

  /** HUD kökünün anlamsal UI niyet veriyolu: arayüz sesi ve titreşim buna abone olur. */
  get intents(): UiIntentBus {
    return this.uiRoot.intents;
  }

  /** HUD kök elemanı: hover/odak sesi bu kökten dinlenir. */
  get rootElement(): HTMLElement {
    return this.uiRoot.element;
  }

  constructor(options: HudOptions) {
    this.quality = options.quality;
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
    this.status = this.scope.addDestroyable(new StatusPanel());
    this.map = this.scope.addDestroyable(
      new MapPanel({
        worldWidth: options.worldWidth,
        worldHeight: options.worldHeight,
        metre: options.metre,
        gridStep: options.mapGridStep,
        gridMajorEvery: options.mapGridMajorEvery,
        zoom: options.mapZoom,
        maxZoom: options.mapMaxZoom,
        terrain: options.mapTerrain,
      }),
    );
    this.hints = this.scope.addDestroyable(new ControlHints(this.presentation, options.live));
    this.touch = this.scope.addDestroyable(
      new TouchControls(options.actionSource, options.stickSource, options.live),
    );
    const fps = this.scope.addDestroyable(new FpsMeter({ position: 'bottom-right' }));
    this.pause = this.scope.addDestroyable(
      new PauseOverlay(
        options.onResume,
        options.services?.settings,
        options.services?.displayAvailable,
        options.live,
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
    this.toasts = toasts;
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
    this.guardFocus();

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

  /** HUD katmanına bir parça ekler (tıklanabilir içerik kendi `pointer-events`ini açar); sökücü döner. */
  mount(element: HTMLElement): () => void {
    this.layer.append(element);
    return () => element.remove();
  }

  /** HUD'un üstündeki katmana (modal, bildirim) bir parça ekler; sökücü döner. */
  mountOverlay(element: HTMLElement): () => void {
    this.uiRoot.mount(element);
    return () => element.remove();
  }

  /** Oyuncuya kısa bildirim: `key` i18n anahtarıdır. */
  notify(key: MessageKey, variant: 'default' | 'success' | 'warning' | 'danger' = 'default'): void {
    this.toasts.show(i18next.t(key), { variant, critical: variant === 'danger' });
  }

  /** Duraklatma menüsünün sürdür düğmesinin üstündeki eylemleri değiştirir. */
  setPauseActions(actions: readonly PauseAction[]): void {
    this.pause.setActions(actions);
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
    this.hintsUntilMs ??= nowMs + HUD.hintsShowMs;
    if (!this.hints.faded && nowMs >= this.hintsUntilMs) this.hints.setFaded(true);
    // Tank dışındaki araçlar Shift yerine Space ile kendi yeteneğini kullanır; etiket yeteneğin adıdır.
    const skill = frame.kind === 'tank' ? null : frame.skill;
    if (skill !== this.skill) {
      this.skill = skill;
      this.hints.setSkill(skill);
      this.touch.setSkill(skill);
    }
    this.layer.classList.toggle('vt-hud--boosting', frame.boosting);
    if (nowMs >= this.statusDueMs) {
      this.statusDueMs = nowMs + STATUS_INTERVAL_MS;
      this.status.update(frame);
      this.layer.dataset.season = frame.climate?.season ?? '';
      this.layer.dataset.weather = frame.climate?.kind ?? '';
    }
    if (nowMs >= this.mapDueMs) {
      this.mapDueMs = nowMs + this.quality.getProfile().mapIntervalMs;
      this.map.update(frame);
    }
  }

  destroy(): void {
    this.scope.dispose();
  }

  /**
   * Oynarken odak HUD düğmelerine geçmez: Tab düğme seçtirir, tıklanan düğme odakta kalırsa Space (fren)
   * ve Enter onu yeniden tetiklerdi. Modal, giriş alanı ve seçim kutusu Tab'ı kendi sözleşmesiyle alır.
   */
  private guardFocus(): void {
    this.scope.addListener<KeyboardEvent>(
      document,
      'keydown',
      (event) => {
        if (event.key !== 'Tab' || this.pause.isOpen) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('.vol-modal, input, textarea, select')) return;
        event.preventDefault();
      },
      true,
    );
    this.scope.addListener<FocusEvent>(this.layer, 'focusin', (event) => {
      if (!this.pause.isOpen && event.target instanceof HTMLElement) event.target.blur();
    });
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
