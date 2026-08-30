import { Bar, DisposableScope, Text, UIRoot, clamp01, i18next } from '@volstudio/core';
import { arachnidUiConfig } from '@/config/ui';

export interface ArachnidHudState {
  /** Dash'in yeniden hazır olma oranı, [0, 1]. */
  dashProgress: number;
  speedPxPerSec: number;
  isDashing: boolean;
}

type MotionState = 'idle' | 'moving' | 'dashing';

/**
 * Phaser tuvalinden bağımsız hareket HUD'u. Sahne yalnızca gövde
 * durumunu aktarır; DOM, i18n ve temizleme sorumluluğu burada kalır.
 */
export class ArachnidHud {
  private readonly scope = new DisposableScope();
  private readonly uiRoot: UIRoot;
  private readonly root: HTMLDivElement;
  private readonly dashBar: Bar;
  private readonly speedText: Text;
  private readonly statusText: Text;
  private dashPercent = 100;
  private speedPxPerSec = 0;
  private motionState: MotionState = 'idle';

  constructor(parent: HTMLElement) {
    this.uiRoot = this.scope.addDestroyable(new UIRoot(parent));

    this.root = document.createElement('div');
    this.root.className = 'vol-arachnid-hud vol-arachnid-hud--dash-ready';
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', i18next.t('arachnid:hud.ariaLabel'));
    this.uiRoot.mount(this.root);
    this.scope.add({ dispose: () => this.uiRoot.unmount(this.root) });

    this.dashBar = this.scope.addDestroyable(
      new Bar({
        variant: 'cooldown',
        max: 100,
        value: this.dashPercent,
        lowThreshold: null,
        animateMs: 0,
        label: this.formatDashLabel,
        className: 'vol-arachnid-hud__dash',
      }),
    );
    this.root.appendChild(this.dashBar.element);

    const telemetry = document.createElement('div');
    telemetry.className = 'vol-arachnid-hud__telemetry';
    this.root.appendChild(telemetry);

    this.speedText = this.scope.addDestroyable(
      new Text(this.formatSpeed(), { variant: 'body', tag: 'p' }),
    );
    this.speedText.element.classList.add('vol-arachnid-hud__speed');
    telemetry.appendChild(this.speedText.element);

    this.statusText = this.scope.addDestroyable(
      new Text(this.formatStatus(), { variant: 'muted', tag: 'p' }),
    );
    this.statusText.element.classList.add('vol-arachnid-hud__status');
    this.statusText.element.setAttribute('aria-live', 'polite');
    telemetry.appendChild(this.statusText.element);

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
    if (nextMotionState !== this.motionState) {
      this.motionState = nextMotionState;
      this.statusText.setContent(this.formatStatus());
    }

    this.root.classList.toggle('vol-arachnid-hud--dash-ready', nextDashPercent >= 100);
    this.root.classList.toggle('vol-arachnid-hud--dashing', nextMotionState === 'dashing');
  }

  destroy(): void {
    this.scope.dispose();
  }

  private readonly formatDashLabel = (value: number): string => {
    const state =
      value >= 100
        ? i18next.t('arachnid:hud.dashReady')
        : i18next.t('arachnid:hud.dashCharging', { percent: value });
    return `${i18next.t('arachnid:hud.dash')} · ${state}`;
  };

  private formatSpeed(): string {
    return i18next.t('arachnid:hud.speed', { speed: this.speedPxPerSec });
  }

  private formatStatus(): string {
    let state: string;
    if (this.motionState === 'dashing') {
      state = i18next.t('arachnid:hud.state.dashing');
    } else if (this.motionState === 'moving') {
      state = i18next.t('arachnid:hud.state.moving');
    } else {
      state = i18next.t('arachnid:hud.state.idle');
    }
    return i18next.t('arachnid:hud.status', { state });
  }

  private readonly onLanguageChanged = (): void => {
    this.root.setAttribute('aria-label', i18next.t('arachnid:hud.ariaLabel'));
    this.dashBar.setLabel(this.formatDashLabel);
    this.speedText.setContent(this.formatSpeed());
    this.statusText.setContent(this.formatStatus());
  };
}
