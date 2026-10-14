import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { Button } from '@volstudio/core/ui';
import { ScreenFrame } from './ScreenFrame';

export interface MainMenuOptions {
  readonly onPlay: () => void;
  readonly onPractice: () => void;
  readonly onSettings: () => void;
  /** Verilmezse çıkış düğmesi yoktur (tarayıcıda uygulama kapatılamaz). */
  readonly onExit?: () => void;
}

/**
 * Ana menü: oyunun ilk ekranı, sol şerit (`sheet`) olarak oyun sunumunun üstünde durur. Düğmeler yalnız
 * niyeti dışarı verir; sahne geçişi, çıkış onayı ve ağ bağlantısı sahnenin işidir.
 */
export class MainMenuPanel {
  private readonly frame = new ScreenFrame({ testid: 'menu', variant: 'sheet' });
  private readonly scope = new DisposableScope();
  private readonly play: Button;
  private readonly practice: Button;
  private readonly settings: Button;
  private readonly exit: Button | undefined;

  constructor(options: MainMenuOptions) {
    const button = (testid: string, onClick: () => void, variant?: 'primary'): Button => {
      const made = this.scope.addDestroyable(new Button('', { variant, onClick }));
      made.element.dataset.testid = testid;
      this.frame.footer.append(made.element);
      return made;
    };
    this.play = button('menu-play', options.onPlay, 'primary');
    this.practice = button('menu-practice', options.onPractice);
    this.settings = button('menu-settings', options.onSettings);
    this.exit = options.onExit && button('menu-exit', options.onExit);
    this.refreshLabels();
    const onLanguage = (): void => this.refreshLabels();
    i18next.on('languageChanged', onLanguage);
    this.scope.addSubscription(() => i18next.off('languageChanged', onLanguage));
  }

  get element(): HTMLElement {
    return this.frame.element;
  }

  /** Klavye ve kol gezintisi ana eylemden başlasın. */
  focus(): void {
    this.play.element.focus({ preventScroll: true });
  }

  refreshLabels(): void {
    this.frame.setTitle(i18next.t('voltest:menu.title'), i18next.t('voltest:menu.subtitle'));
    this.play.setLabel(i18next.t('voltest:menu.play'));
    this.practice.setLabel(i18next.t('voltest:menu.practice'));
    this.settings.setLabel(i18next.t('voltest:menu.settings'));
    this.exit?.setLabel(i18next.t('voltest:menu.exit'));
  }

  destroy(): void {
    this.scope.dispose();
    this.frame.destroy();
  }
}
