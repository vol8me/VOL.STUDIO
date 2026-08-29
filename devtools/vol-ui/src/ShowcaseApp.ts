import { FullscreenController, Tabs } from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { buildAdvancedTab } from './sections/advancedTab';
import { buildButtonsTab } from './sections/buttonsTab';
import { buildCardsTab } from './sections/cardsTab';
import { buildFormsTab } from './sections/formsTab';
import { buildHudTab } from './sections/hudTab';
import { buildLoadingTab } from './sections/loadingTab';
import { buildPaletteTab } from './sections/paletteTab';
import { buildPanelsTab } from './sections/panelsTab';
import { buildScrollTab } from './sections/scrollTab';
import { buildTextTab } from './sections/textTab';
import { buildTouchTab } from './sections/touchTab';
import { buildWorkbenchTab } from './sections/workbenchTab';

type ShowcaseTabId =
  | 'buttons'
  | 'text'
  | 'panels'
  | 'hud'
  | 'cards'
  | 'forms'
  | 'workbench'
  | 'palette'
  | 'advanced'
  | 'scroll'
  | 'touch'
  | 'loading';

interface TabSpec {
  id: ShowcaseTabId;
  labelKey: ShowcaseTabId;
  builder: () => { element: HTMLElement; destroy?: () => void };
}

/** CORE bileşen kataloğunun Phaser ve oyun döngüsü taşımayan web kabuğu. */
export class ShowcaseApp {
  readonly element: HTMLDivElement;

  private tabs: Tabs | null = null;
  private langButton: HTMLButtonElement | null = null;
  private renderScope: DisposableScope | null = null;
  private readonly lifecycle = new DisposableScope();
  private readonly fullscreen: FullscreenController;
  private activeTabId: ShowcaseTabId = 'buttons';
  private destroyed = false;
  private readonly onLangButtonClick = (): void => {
    void i18next.changeLanguage(i18next.language === 'tr' ? 'en' : 'tr');
  };
  private readonly onLanguageChanged = (): void => {
    if (!this.destroyed) this.rebuild();
  };

  constructor(private readonly mount: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'vol-showcase-root';
    this.mount.replaceChildren(this.element);
    this.fullscreen = this.lifecycle.addDestroyable(
      new FullscreenController({
        target: this.element,
        onChange: () => this.renderFullscreenLabel(),
        onError: (error) => console.warn('[VOL.UI] Tam ekran açılamadı:', error),
      }),
    );
    i18next.on('languageChanged', this.onLanguageChanged);
    this.lifecycle.addSubscription(() => i18next.off('languageChanged', this.onLanguageChanged));
    this.rebuild();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.renderScope?.dispose();
    this.renderScope = null;
    this.lifecycle.dispose();
    this.tabs = null;
    this.langButton = null;
    this.element.remove();
  }

  private rebuild(): void {
    this.renderScope?.dispose();
    const renderScope = new DisposableScope();
    this.renderScope = renderScope;
    this.element.replaceChildren();

    const header = document.createElement('header');
    header.className = 'vol-showcase-header';
    const title = document.createElement('span');
    title.textContent = i18next.t('volui:app.title');
    header.appendChild(title);

    this.langButton = document.createElement('button');
    this.langButton.type = 'button';
    this.langButton.className = 'vol-showcase-lang-button';
    this.langButton.textContent = i18next.t('volui:app.language');
    this.langButton.setAttribute('aria-label', i18next.t('volui:app.language'));
    renderScope.addListener(this.langButton, 'click', this.onLangButtonClick);

    const fullscreenButton = document.createElement('button');
    fullscreenButton.type = 'button';
    fullscreenButton.className = 'vol-showcase-fullscreen-button';
    fullscreenButton.textContent = '⛶';
    renderScope.addListener(fullscreenButton, 'click', () => void this.fullscreen.toggle());
    this.renderFullscreenLabel(fullscreenButton);

    const actions = document.createElement('div');
    actions.className = 'vol-showcase-header__actions';
    actions.append(this.langButton, fullscreenButton);
    header.appendChild(actions);

    const specs: TabSpec[] = [
      { id: 'buttons', labelKey: 'buttons', builder: () => buildButtonsTab(this.element) },
      { id: 'text', labelKey: 'text', builder: buildTextTab },
      { id: 'panels', labelKey: 'panels', builder: () => buildPanelsTab(this.element) },
      { id: 'hud', labelKey: 'hud', builder: buildHudTab },
      { id: 'cards', labelKey: 'cards', builder: () => buildCardsTab(this.element) },
      { id: 'forms', labelKey: 'forms', builder: () => buildFormsTab(this.element) },
      { id: 'workbench', labelKey: 'workbench', builder: buildWorkbenchTab },
      { id: 'palette', labelKey: 'palette', builder: buildPaletteTab },
      { id: 'advanced', labelKey: 'advanced', builder: () => buildAdvancedTab(this.element) },
      { id: 'scroll', labelKey: 'scroll', builder: buildScrollTab },
      { id: 'touch', labelKey: 'touch', builder: buildTouchTab },
      { id: 'loading', labelKey: 'loading', builder: buildLoadingTab },
    ];
    const entries = specs.map((spec) => ({
      id: spec.id,
      label: i18next.t(`volui:tabs.${spec.labelKey}`),
      content: spec.builder(),
    }));
    const tabs = new Tabs(entries, {
      orientation: 'vertical',
      listHeader: header,
      onChange: (id) => {
        const selected = specs.find((spec) => spec.id === id);
        if (selected) this.activeTabId = selected.id;
      },
    });
    this.tabs = renderScope.addDestroyable(tabs);
    if (entries.some((entry) => entry.id === this.activeTabId)) {
      this.tabs.select(this.activeTabId);
    } else {
      this.activeTabId = entries[0].id;
    }
    this.element.appendChild(this.tabs.element);
    document.documentElement.lang = i18next.language ?? 'tr';
    document.title = i18next.t('volui:app.title');
  }

  private renderFullscreenLabel(button?: HTMLButtonElement): void {
    const target =
      button ?? this.element.querySelector<HTMLButtonElement>('.vol-showcase-fullscreen-button');
    if (!target) return;
    const key = this.fullscreen.isFullscreen()
      ? 'volui:app.leaveFullscreen'
      : 'volui:app.fullscreen';
    target.setAttribute('aria-label', i18next.t(key));
    target.setAttribute('title', i18next.t(key));
    target.setAttribute('aria-pressed', String(this.fullscreen.isFullscreen()));
  }
}
