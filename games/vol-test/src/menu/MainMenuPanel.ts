import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { Button, Text } from '@volstudio/core/ui';
import './menu.css';

export interface MainMenuOptions {
  readonly onPlay: () => void;
  readonly onPractice: () => void;
  readonly onSettings: () => void;
  /** Verilmezse çıkış düğmesi yoktur (tarayıcıda uygulama kapatılamaz). */
  readonly onExit?: () => void;
}

/**
 * Ana menü: oyunun ilk ekranı. Düğmeler yalnız niyeti dışarı verir; sahne geçişi, çıkış onayı ve
 * ağ bağlantısı sahnenin işidir. CORE `Button` ve `Text` ile kurulur.
 */
export class MainMenuPanel {
  readonly element: HTMLElement;
  private readonly scope = new DisposableScope();
  private readonly title = new Text('', { variant: 'title', tag: 'h1' });
  private readonly subtitle = new Text('', { variant: 'muted', tag: 'p' });
  private readonly play: Button;
  private readonly practice: Button;
  private readonly settings: Button;
  private readonly exit: Button | undefined;

  constructor(options: MainMenuOptions) {
    this.element = document.createElement('section');
    this.element.className = 'vt-screen vt-menu';
    this.element.dataset.testid = 'menu';
    const actions = document.createElement('div');
    actions.className = 'vt-screen__actions';
    const button = (testid: string, onClick: () => void, variant?: 'primary'): Button => {
      const made = new Button('', { variant, onClick });
      made.element.dataset.testid = testid;
      actions.append(made.element);
      return made;
    };
    this.play = button('menu-play', options.onPlay, 'primary');
    this.practice = button('menu-practice', options.onPractice);
    this.settings = button('menu-settings', options.onSettings);
    this.exit = options.onExit && button('menu-exit', options.onExit);
    this.element.append(this.title.element, this.subtitle.element, actions);
    this.refreshLabels();
    const onLanguage = (): void => this.refreshLabels();
    i18next.on('languageChanged', onLanguage);
    this.scope.addSubscription(() => i18next.off('languageChanged', onLanguage));
  }

  /** Klavye ve kol gezintisi ana eylemden başlasın. */
  focus(): void {
    this.play.element.focus({ preventScroll: true });
  }

  refreshLabels(): void {
    this.title.setContent(i18next.t('voltest:menu.title'));
    this.subtitle.setContent(i18next.t('voltest:menu.subtitle'));
    this.play.setLabel(i18next.t('voltest:menu.play'));
    this.practice.setLabel(i18next.t('voltest:menu.practice'));
    this.settings.setLabel(i18next.t('voltest:menu.settings'));
    this.exit?.setLabel(i18next.t('voltest:menu.exit'));
  }

  destroy(): void {
    this.scope.dispose();
    for (const part of [
      this.title,
      this.subtitle,
      this.play,
      this.practice,
      this.settings,
      this.exit,
    ])
      part?.destroy();
    this.element.remove();
  }
}
