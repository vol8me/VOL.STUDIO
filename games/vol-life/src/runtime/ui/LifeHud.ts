import {
  DisposableScope,
  FpsMeter,
  Icon,
  IconButton,
  Sheet,
  Text,
  UIRoot,
  i18next,
} from '@volstudio/core';

export interface LifeHudOptions {
  readonly fullscreen?: {
    readonly initialActive: boolean;
    readonly onToggle: () => void;
  };
  readonly optionsContent: { readonly element: HTMLElement };
  readonly showFps: boolean;
}

/** VOL.LIFE'ın marka, seçenek ve isteğe bağlı tanı göstergesi kabuğu. */
export class LifeHud {
  private readonly scope = new DisposableScope();
  private readonly uiRoot: UIRoot;
  private readonly root: HTMLDivElement;
  private readonly titleText: Text;
  private readonly fullscreenButton: IconButton | null;
  private readonly optionsButton: IconButton;
  private readonly optionsSheet: Sheet;
  private fpsMeter: FpsMeter | null = null;
  private fullscreenActive: boolean;
  private readonly onLanguageChanged = (): void => this.refreshLabels();

  constructor(parent: HTMLElement | undefined, options: LifeHudOptions) {
    this.fullscreenActive = options.fullscreen?.initialActive ?? false;
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

    const actions = document.createElement('div');
    actions.className = 'vol-life-hud__actions';
    this.root.appendChild(actions);

    this.fullscreenButton = options.fullscreen
      ? this.scope.addDestroyable(
          new IconButton(new Icon({ name: 'fullscreen' }).element, {
            size: 'md',
            label: this.fullscreenLabel(),
            onClick: options.fullscreen.onToggle,
          }),
        )
      : null;
    if (this.fullscreenButton) {
      this.fullscreenButton.element.classList.add('vol-life-hud__fullscreen');
      actions.appendChild(this.fullscreenButton.element);
    }

    this.optionsButton = this.scope.addDestroyable(
      new IconButton(new Icon({ name: 'settings' }).element, {
        size: 'md',
        label: i18next.t('life:hud.options'),
      }),
    );
    this.optionsButton.element.classList.add('vol-life-hud__options');
    this.optionsButton.element.setAttribute('aria-expanded', 'false');
    actions.appendChild(this.optionsButton.element);

    this.optionsSheet = this.scope.addDestroyable(
      new Sheet({
        title: i18next.t('life:options.title'),
        closeLabel: i18next.t('life:options.close'),
        className: 'vol-life-options-sheet',
        onClose: () => this.optionsButton.element.setAttribute('aria-expanded', 'false'),
      }),
    );
    this.optionsSheet.add(options.optionsContent);
    this.uiRoot.mount(this.optionsSheet.element);
    this.optionsButton.onClick(() => {
      this.optionsSheet.toggle();
      this.optionsButton.element.setAttribute('aria-expanded', String(this.optionsSheet.isOpen()));
    });

    this.scope.add({ dispose: () => this.fpsMeter?.destroy() });
    this.setFpsVisible(options.showFps);

    i18next.on('languageChanged', this.onLanguageChanged);
    this.scope.addSubscription(() => i18next.off('languageChanged', this.onLanguageChanged));
  }

  setFullscreenActive(active: boolean): void {
    if (active === this.fullscreenActive) return;
    this.fullscreenActive = active;
    this.fullscreenButton?.setLabel(this.fullscreenLabel());
  }

  setFpsVisible(visible: boolean): void {
    if (visible === Boolean(this.fpsMeter)) return;
    if (!visible) {
      this.fpsMeter?.destroy();
      this.fpsMeter = null;
      return;
    }
    this.fpsMeter = new FpsMeter({ position: 'bottom-right', refreshMs: 250 });
    this.fpsMeter.element.classList.add('vol-life-fps-meter');
    this.uiRoot.mount(this.fpsMeter.element);
  }

  isOptionsOpen(): boolean {
    return this.optionsSheet.isOpen();
  }

  destroy(): void {
    this.scope.dispose();
    this.fpsMeter = null;
  }

  private refreshLabels(): void {
    this.root.setAttribute('aria-label', i18next.t('life:hud.ariaLabel'));
    this.titleText.setContent(i18next.t('life:app.title'));
    this.fullscreenButton?.setLabel(this.fullscreenLabel());
    this.optionsButton.setLabel(i18next.t('life:hud.options'));
    this.optionsSheet.setTitle(i18next.t('life:options.title'));
    this.optionsSheet.setCloseLabel(i18next.t('life:options.close'));
  }

  private fullscreenLabel(): string {
    return this.fullscreenActive
      ? i18next.t('life:hud.fullscreenExit')
      : i18next.t('life:hud.fullscreenEnter');
  }
}
