import type { MessageKey } from '@/i18n/keys';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { i18next } from '@volstudio/core/i18n';
import { Button, Modal } from '@volstudio/core/ui';
import type { GameSettings } from '@/app/GameSettings';
import { DevScreen } from '@/menu/DevScreen';
import { ScreenFrame } from '@/menu/ScreenFrame';
import { SettingsScreen } from '@/menu/SettingsScreen';

/** Duraklatma menüsünde devam düğmesinin altında duran, sürücüye özgü eylem. */
export interface PauseAction {
  readonly id: string;
  /** Düğme etiketinin i18n anahtarı. */
  readonly labelKey: MessageKey;
  readonly variant?: 'default' | 'danger';
  /** Menü açık kalır (dünya durur); eylem kendi katmanını üstüne açar ya da sahneyi yeniden kurar. */
  readonly run: () => void;
}

type View = 'main' | 'settings' | 'dev';

/**
 * Duraklatma katmanı: ana menüyle aynı sol şerit (`ScreenFrame` `sheet`) ve aynı düğme dizisi. Ayar satırı
 * taşımaz: "Ayarlar" ve "Geliştirici" düğmeleri ana menüdeki aynı `SettingsScreen` ve `DevScreen`i şeridin
 * içinde açar (geri düğmesi menüye döner), böylece ayarların tek yeri vardır. `Modal` yalnız odak tuzağını,
 * Escape'i ve Android geri sözleşmesini verir; kapanınca (düğme, Escape, geri) `onResume` çağrılır. Scrim
 * kapatmaz: duraklatma düğmesine dokunuşun ardından gelen uyumluluk `click`i yeni açılan scrim'e düşüp
 * katmanı anında kapatırdı. Canlı dünyada ("Menü") dünya durmaz, yalnız girdi kesilir.
 */
export class PauseOverlay {
  private readonly scope = new DisposableScope();
  private readonly modal: Modal;
  private readonly frame: ScreenFrame;
  private readonly resume: Button;
  private readonly settingsButton: Button | null;
  private readonly devButton: Button | null;
  private readonly settingsScreen: SettingsScreen | null;
  private readonly devScreen: DevScreen | null;
  private readonly actionList: HTMLDivElement;
  private actionButtons: Array<{ action: PauseAction; button: Button }> = [];
  private closingFromGame = false;
  private view: View = 'main';

  constructor(
    onResume: () => void,
    settings?: GameSettings,
    displayAvailable = false,
    private readonly live = false,
  ) {
    this.modal = new Modal({
      className: 'vt-pause',
      closeOnScrimClick: false,
      initialFocus: () => this.resume.element,
      onClose: () => {
        this.show('main');
        if (!this.closingFromGame) onResume();
      },
    });
    this.frame = this.scope.addDestroyable(new ScreenFrame({ testid: 'pause' }));
    this.resume = this.scope.addDestroyable(
      new Button('', { variant: 'primary', onClick: () => this.modal.close() }),
    );
    this.resume.element.dataset.testid = 'pause-resume';
    this.frame.footer.classList.add('vt-pause__footer');
    this.frame.footer.append(this.resume.element);
    this.modal.add({ element: this.frame.element });

    this.settingsScreen = settings
      ? this.scope.addDestroyable(
          new SettingsScreen({ settings, displayAvailable, onBack: () => this.show('main', true) }),
        )
      : null;
    this.devScreen = settings
      ? this.scope.addDestroyable(
          new DevScreen({ settings, onBack: () => this.show('main', true) }),
        )
      : null;
    this.settingsButton = this.navigation('pause-settings', 'settings');
    this.devButton = this.navigation('pause-dev', 'dev');
    for (const screen of [this.settingsScreen, this.devScreen]) {
      if (!screen) continue;
      screen.element.hidden = true;
      this.modal.add({ element: screen.element });
    }
    this.actionList = document.createElement('div');
    this.actionList.className = 'vt-pause__actions';
    this.frame.footer.append(this.actionList);
    this.refreshLabels();
  }

  /** Sürücünün eylemlerini yeniden kurar; eskiler sökülür. */
  setActions(actions: readonly PauseAction[]): void {
    for (const { button } of this.actionButtons) button.destroy();
    this.actionList.replaceChildren();
    this.actionButtons = actions.map((action) => {
      const button = new Button(i18next.t(action.labelKey), {
        variant: action.variant,
        onClick: () => action.run(),
      });
      button.element.dataset.testid = `pause-${action.id}`;
      this.actionList.append(button.element);
      return { action, button };
    });
  }

  /** Modal kendini DOM'a eklemez; HUD bu öğeyi kendi köküne bağlar. */
  get element(): HTMLElement {
    return this.modal.element;
  }

  get isOpen(): boolean {
    return this.modal.isOpen();
  }

  open(): void {
    if (!this.modal.isOpen()) this.modal.open();
  }

  /** Oyun tarafından kapatma (kol Start'ı): `onResume` tekrar çağrılmaz. */
  close(): void {
    if (!this.modal.isOpen()) return;
    this.closingFromGame = true;
    this.modal.close();
    this.closingFromGame = false;
  }

  refreshLabels(): void {
    this.frame.setTitle(
      i18next.t(this.live ? 'voltest:pause.liveTitle' : 'voltest:pause.title'),
      this.live ? i18next.t('voltest:pause.liveNote') : '',
    );
    this.resume.setLabel(
      i18next.t(this.live ? 'voltest:pause.liveResume' : 'voltest:pause.resume'),
    );
    this.settingsButton?.setLabel(i18next.t('voltest:pause.settings'));
    this.devButton?.setLabel(i18next.t('voltest:pause.dev'));
    this.settingsScreen?.refreshLabels();
    this.devScreen?.refreshLabels();
    for (const { action, button } of this.actionButtons)
      button.setLabel(i18next.t(action.labelKey));
  }

  /** Şeridin içindeki ekranı değiştirir; geri dönüşte odak açan düğmeye verilir. */
  private show(view: View, focus = false): void {
    const from = this.view;
    this.view = view;
    this.frame.element.hidden = view !== 'main';
    if (this.settingsScreen) this.settingsScreen.element.hidden = view !== 'settings';
    if (this.devScreen) this.devScreen.element.hidden = view !== 'dev';
    if (!focus) return;
    if (view === 'settings') this.settingsScreen?.focus();
    else if (view === 'dev') this.devScreen?.focus();
    else (from === 'dev' ? this.devButton : this.settingsButton)?.element.focus();
  }

  private navigation(testid: string, view: 'settings' | 'dev'): Button | null {
    if (!(view === 'settings' ? this.settingsScreen : this.devScreen)) return null;
    const button = this.scope.addDestroyable(
      new Button('', { onClick: () => this.show(view, true) }),
    );
    button.element.dataset.testid = testid;
    this.frame.footer.append(button.element);
    return button;
  }

  destroy(): void {
    this.scope.dispose();
    for (const { button } of this.actionButtons) button.destroy();
    this.modal.destroy();
    this.modal.element.remove();
  }
}
