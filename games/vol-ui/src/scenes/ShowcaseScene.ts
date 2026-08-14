import Phaser from 'phaser';
import { Tabs, UIRoot, i18next } from '@volstudio/core';
import { buildButtonsTab } from '../sections/buttonsTab';
import { buildTextTab } from '../sections/textTab';
import { buildPanelsTab } from '../sections/panelsTab';
import { buildHudTab } from '../sections/hudTab';
import { buildFormsTab } from '../sections/formsTab';
import { buildPaletteTab } from '../sections/paletteTab';
import { buildAdvancedTab } from '../sections/advancedTab';
import { buildScrollTab } from '../sections/scrollTab';
import { buildTouchTab } from '../sections/touchTab';
import { buildLoadingTab } from '../sections/loadingTab';
import { buildCardsTab } from '../sections/cardsTab';

export class ShowcaseScene extends Phaser.Scene {
  private ui!: UIRoot;
  private root!: HTMLDivElement;
  private tabs!: Tabs;
  private langButton!: HTMLButtonElement;
  private activeTabId = 'buttons';

  constructor() {
    super({ key: 'Showcase' });
  }

  create(): void {
    this.ui = new UIRoot();

    this.root = document.createElement('div');
    this.root.className = 'vol-showcase-root';

    this.buildTabs();

    this.ui.mount(this.root);

    i18next.on('languageChanged', this.onLanguageChanged);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  private buildTabs(): void {
    const header = document.createElement('header');
    header.className = 'vol-showcase-header';

    const title = document.createElement('span');
    title.textContent = 'VOL.UI';
    header.appendChild(title);

    this.langButton = document.createElement('button');
    this.langButton.type = 'button';
    this.langButton.className = 'vol-showcase-lang-button';
    this.langButton.textContent = i18next.language?.toUpperCase() ?? 'TR';
    this.langButton.addEventListener('click', () => {
      const next = i18next.language === 'tr' ? 'en' : 'tr';
      void i18next.changeLanguage(next);
    });
    header.appendChild(this.langButton);

    const tabDefs = [
      {
        id: 'buttons',
        label: i18next.t('volui:tabs.buttons'),
        builder: () => buildButtonsTab(this.ui.element),
      },
      { id: 'text', label: i18next.t('volui:tabs.text'), builder: () => buildTextTab() },
      {
        id: 'panels',
        label: i18next.t('volui:tabs.panels'),
        builder: () => buildPanelsTab(this.ui.element),
      },
      { id: 'hud', label: i18next.t('volui:tabs.hud'), builder: () => buildHudTab() },
      { id: 'cards', label: i18next.t('volui:tabs.cards'), builder: () => buildCardsTab() },
      {
        id: 'forms',
        label: i18next.t('volui:tabs.forms'),
        builder: () => buildFormsTab(this.ui.element),
      },
      { id: 'palette', label: i18next.t('volui:tabs.palette'), builder: () => buildPaletteTab() },
      {
        id: 'advanced',
        label: i18next.t('volui:tabs.advanced'),
        builder: () => buildAdvancedTab(this.ui.element),
      },
      { id: 'scroll', label: i18next.t('volui:tabs.scroll'), builder: () => buildScrollTab() },
      { id: 'touch', label: i18next.t('volui:tabs.touch'), builder: () => buildTouchTab() },
      { id: 'loading', label: i18next.t('volui:tabs.loading'), builder: () => buildLoadingTab() },
    ];

    const tabEntries = tabDefs.map(({ id, label, builder }) => {
      const result = builder();
      return { id, label, content: result };
    });

    this.tabs = new Tabs(tabEntries, {
      orientation: 'vertical',
      listHeader: header,
      onChange: (id) => {
        this.activeTabId = id;
      },
    });

    if (this.activeTabId !== tabEntries[0].id) {
      this.tabs.select(this.activeTabId);
    }

    this.root.appendChild(this.tabs.element);
  }

  private readonly onLanguageChanged = (): void => {
    this.langButton.textContent = i18next.language?.toUpperCase() ?? 'TR';

    this.tabs.destroy();
    this.root.replaceChildren();

    this.buildTabs();
  };

  private onShutdown(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.tabs.destroy();
    this.root.remove();
    this.ui.destroy();
  }
}
