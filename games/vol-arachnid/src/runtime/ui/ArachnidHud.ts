import {
  Bar,
  DisposableScope,
  Icon,
  IconButton,
  Text,
  UIRoot,
  clamp01,
  i18next,
} from '@volstudio/core';
import { arenaConfig } from '@/config/arena';
import { arachnidUiConfig } from '@/config/ui';

export interface ArachnidHudState {
  /** Dash'in yeniden hazır olma oranı, [0, 1]. */
  dashProgress: number;
  speedPxPerSec: number;
  isDashing: boolean;
}

export interface ArachnidHudOptions {
  /** Tam ekran isteği; HUD kendi başına pencereyi değiştirmez. */
  onToggleFullscreen: () => void;
}

type MotionState = 'idle' | 'moving' | 'dashing';

/**
 * Phaser tuvalinden bağımsız hareket HUD'u.
 *
 * Yerleşim ARENAYA DEĞMEZ: kamera, arenayı `arenaConfig.viewportGutterPx`
 * boşluklarının içine sığdırır ve HUD yalnız o boşluklarda yaşar. Ölçüler
 * CSS değişkeni olarak buradan yazılır — iki tarafın ayrı sayı tutması,
 * boşluk değiştiğinde HUD'un sessizce oyun alanının üstüne binmesi demekti.
 *
 * Metin en aza indirilmiştir: atılım durumu DİKEY bir barla, hareket durumu
 * renkle okunur; sayı olarak yalnız hız kalır ve o da sağ alt boşluktadır.
 */
export class ArachnidHud {
  private readonly scope = new DisposableScope();
  private readonly uiRoot: UIRoot;
  private readonly root: HTMLDivElement;
  private readonly dashBar: Bar;
  private readonly titleText: Text;
  private readonly speedText: Text;
  private readonly telemetry: HTMLDivElement;
  private readonly fullscreenButton: IconButton;
  private dashPercent = 100;
  private speedPxPerSec = 0;
  private fullscreenActive = false;

  constructor(parent: HTMLElement, options: ArachnidHudOptions) {
    this.uiRoot = this.scope.addDestroyable(new UIRoot(parent));

    this.root = document.createElement('div');
    this.root.className = 'vol-arachnid-hud vol-arachnid-hud--dash-ready';
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', i18next.t('arachnid:hud.ariaLabel'));
    this.root.style.setProperty(
      '--vol-arachnid-gutter-left',
      `${arenaConfig.viewportGutterPx.left}px`,
    );
    this.root.style.setProperty(
      '--vol-arachnid-gutter-top',
      `${arenaConfig.viewportGutterPx.top}px`,
    );
    this.root.style.setProperty(
      '--vol-arachnid-gutter-bottom',
      `${arenaConfig.viewportGutterPx.bottom}px`,
    );
    this.uiRoot.mount(this.root);
    this.scope.add({ dispose: () => this.uiRoot.unmount(this.root) });

    this.titleText = this.scope.addDestroyable(
      new Text(i18next.t('arachnid:app.title'), { variant: 'title', tag: 'h1' }),
    );
    this.titleText.element.classList.add('vol-arachnid-hud__title');
    this.root.appendChild(this.titleText.element);

    this.dashBar = this.scope.addDestroyable(
      new Bar({
        variant: 'cooldown',
        orientation: 'vertical',
        max: 100,
        value: this.dashPercent,
        lowThreshold: null,
        animateMs: 0,
        ariaLabel: i18next.t('arachnid:hud.dashAria'),
        className: 'vol-arachnid-hud__dash',
      }),
    );
    this.root.appendChild(this.dashBar.element);

    this.fullscreenButton = this.scope.addDestroyable(
      new IconButton(new Icon({ name: 'fullscreen' }).element, {
        size: 'sm',
        label: this.fullscreenLabel(),
        onClick: options.onToggleFullscreen,
      }),
    );
    this.fullscreenButton.element.classList.add('vol-arachnid-hud__fullscreen');
    this.root.appendChild(this.fullscreenButton.element);

    this.telemetry = document.createElement('div');
    this.telemetry.className = 'vol-arachnid-hud__telemetry';
    // Rolsüz bir `div`in `aria-label`ı çoğu ekran okuyucuda YOK SAYILIR; ad
    // ancak adlandırılabilir bir role bağlanınca duyulur.
    this.telemetry.setAttribute('role', 'group');
    this.telemetry.setAttribute('aria-label', i18next.t('arachnid:hud.speedAria'));
    this.root.appendChild(this.telemetry);

    this.speedText = this.scope.addDestroyable(
      new Text(this.formatSpeed(), { variant: 'muted', tag: 'p' }),
    );
    this.speedText.element.classList.add('vol-arachnid-hud__speed');
    this.telemetry.appendChild(this.speedText.element);

    i18next.on('languageChanged', this.onLanguageChanged);
    this.scope.addSubscription(() => i18next.off('languageChanged', this.onLanguageChanged));
  }

  refresh(state: ArachnidHudState): void {
    const progress = Number.isFinite(state.dashProgress) ? state.dashProgress : 0;
    const nextDashPercent = Math.round(clamp01(progress) * 100);
    if (nextDashPercent !== this.dashPercent) {
      this.dashPercent = nextDashPercent;
      this.dashBar.setValue(nextDashPercent);
    }

    const rawSpeed = Number.isFinite(state.speedPxPerSec) ? Math.max(0, state.speedPxPerSec) : 0;
    const step = arachnidUiConfig.hud.speedDisplayStepPxPerSec;
    const nextSpeed = Math.round(rawSpeed / step) * step;
    if (nextSpeed !== this.speedPxPerSec) {
      this.speedPxPerSec = nextSpeed;
      this.speedText.setContent(this.formatSpeed());
    }

    const nextMotionState: MotionState = state.isDashing
      ? 'dashing'
      : rawSpeed >= arachnidUiConfig.hud.movingThresholdPxPerSec
      ? 'moving'
      : 'idle';

    this.root.classList.toggle('vol-arachnid-hud--dash-ready', nextDashPercent >= 100);
    this.root.classList.toggle('vol-arachnid-hud--dashing', nextMotionState === 'dashing');
    this.root.classList.toggle('vol-arachnid-hud--moving', nextMotionState === 'moving');
  }

  /** Tam ekran durumunu yansıtır; butonun erişilebilirlik adı buna bağlıdır. */
  setFullscreenActive(active: boolean): void {
    if (active === this.fullscreenActive) return;
    this.fullscreenActive = active;
    this.fullscreenButton.setLabel(this.fullscreenLabel());
  }

  destroy(): void {
    this.scope.dispose();
  }

  private formatSpeed(): string {
    return i18next.t('arachnid:hud.speed', { speed: this.speedPxPerSec });
  }

  private fullscreenLabel(): string {
    return this.fullscreenActive
      ? i18next.t('arachnid:hud.fullscreenExit')
      : i18next.t('arachnid:hud.fullscreenEnter');
  }

  private readonly onLanguageChanged = (): void => {
    this.root.setAttribute('aria-label', i18next.t('arachnid:hud.ariaLabel'));
    this.titleText.setContent(i18next.t('arachnid:app.title'));
    this.telemetry.setAttribute('aria-label', i18next.t('arachnid:hud.speedAria'));
    this.speedText.setContent(this.formatSpeed());
    this.fullscreenButton.setLabel(this.fullscreenLabel());
  };
}
