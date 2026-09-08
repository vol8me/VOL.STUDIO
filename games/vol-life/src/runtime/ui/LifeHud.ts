import {
  DisposableScope,
  FpsMeter,
  Icon,
  IconButton,
  Text,
  UIRoot,
  i18next,
} from '@volstudio/core';

export interface LifeHudOptions {
  /** Tam ekran isteği; HUD kendi başına pencereyi değiştirmez. */
  onToggleFullscreen: () => void;
  /**
   * Tam ekran düğmesi gösterilsin mi? Android uygulaması zaten tam ekran
   * açılır; orada düğme hem anlamsız hem de başparmağın yolundadır.
   */
  showFullscreenToggle?: boolean;
}

/**
 * VOL.LIFE'ın kabuğu: marka şeridi, tam ekran düğmesi ve kare hızı göstergesi.
 *
 * Dünyanın kendi göstergeleri (seçim, olay, istatistik) buraya HENÜZ girmez —
 * gösterilecek bir dünya yok. Bu sınıfın bugünkü işi, tema/font/HUD zincirinin
 * gerçekten kurulduğunu ekranda görünür kılmaktır.
 */
export class LifeHud {
  private readonly scope = new DisposableScope();
  private readonly uiRoot: UIRoot;
  private readonly root: HTMLDivElement;
  private readonly titleText: Text;
  private readonly fullscreenButton: IconButton | null;
  private fullscreenActive = false;
  private readonly onLanguageChanged = (): void => {
    this.titleText.setContent(i18next.t('life:app.title'));
    this.fullscreenButton?.setLabel(this.fullscreenLabel());
  };

  constructor(parent: HTMLElement | undefined, options: LifeHudOptions) {
    this.uiRoot = this.scope.addDestroyable(new UIRoot(parent));

    this.root = document.createElement('div');
    this.root.className = 'vol-life-hud';
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', i18next.t('life:hud.ariaLabel'));
    this.uiRoot.mount(this.root);
    this.scope.add({ dispose: () => this.uiRoot.unmount(this.root) });

    this.titleText = this.scope.addDestroyable(
      new Text(i18next.t('life:app.title'), { variant: 'title', tag: 'h1' }),
    );
    this.titleText.element.classList.add('vol-life-hud__title');
    this.root.appendChild(this.titleText.element);

    this.fullscreenButton =
      options.showFullscreenToggle ?? true
        ? this.scope.addDestroyable(
            new IconButton(new Icon({ name: 'fullscreen' }).element, {
              size: 'sm',
              label: this.fullscreenLabel(),
              onClick: options.onToggleFullscreen,
            }),
          )
        : null;
    if (this.fullscreenButton) {
      this.fullscreenButton.element.classList.add('vol-life-hud__fullscreen');
      this.root.appendChild(this.fullscreenButton.element);
    }

    /*
     * SAĞ ALT: başlık sol üstte, tam ekran düğmesi sağ üstte. Sol alt ileride
     * mini haritanın yeridir (bkz. DESIGN.md §6), sağ alt boş kalır.
     */
    this.root.appendChild(
      this.scope.addDestroyable(new FpsMeter({ position: 'bottom-right' })).element,
    );

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  setFullscreenActive(active: boolean): void {
    if (active === this.fullscreenActive) return;
    this.fullscreenActive = active;
    this.fullscreenButton?.setLabel(this.fullscreenLabel());
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.scope.dispose();
  }

  private fullscreenLabel(): string {
    return this.fullscreenActive
      ? i18next.t('life:hud.fullscreenExit')
      : i18next.t('life:hud.fullscreenEnter');
  }
}
