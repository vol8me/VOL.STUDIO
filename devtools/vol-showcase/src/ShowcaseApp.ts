import { FullscreenController } from '@volstudio/core/platform';
import { startAppSound } from './appSound';
import {
  CursorController,
  FocusNavController,
  THEME_IDS,
  Tabs,
  ThemeController,
  showConfirm,
  type ThemeId,
  type ThemeStore,
} from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { buildAdvancedTab } from './sections/advancedTab';
import { buildButtonsTab } from './sections/buttonsTab';
import { buildCardsTab } from './sections/cardsTab';
import { buildFormsTab } from './sections/formsTab';
import { buildHudTab } from './sections/hudTab';
import { buildKimlikTab } from './sections/kimlikTab';
import { buildLoadingTab } from './sections/loadingTab';
import { buildPaletteTab } from './sections/paletteTab';
import { buildPanelsTab } from './sections/panelsTab';
import { buildScrollTab } from './sections/scrollTab';
import { buildSesTab } from './sections/sesTab';
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
  | 'loading'
  | 'ses'
  | 'kimlik';

interface TabSpec {
  id: ShowcaseTabId;
  labelKey: ShowcaseTabId;
  builder: () => { element: HTMLElement; destroy?: () => void };
}

/** Skin → imleç vurgu rengi (RTS komut vurgusu); varsayılan skin çekirdek rengini korur. */
const SKIN_CURSOR_ACCENT: Readonly<Record<string, string>> = {
  default: '#ffb27a',
  aurum: '#f0c568',
};

/** Skin seçimi bu tarayıcıda kalıcıdır; depolama yoksa ya da bozuksa varsayılan skin açılır. */
function localThemeStore(): ThemeStore {
  return {
    load: <T>(key: string, fallback: T): Promise<T> => {
      try {
        const raw = localStorage.getItem(key);
        return Promise.resolve(raw === null ? fallback : (JSON.parse(raw) as T));
      } catch {
        return Promise.resolve(fallback);
      }
    },
    save: <T>(key: string, value: T): Promise<void> => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // depolama kapalı: seçim oturumla sınırlı kalır
      }
      return Promise.resolve();
    },
  };
}

/** CORE bileşen kataloğunun Phaser ve oyun döngüsü taşımayan web kabuğu. */
export class ShowcaseApp {
  readonly element: HTMLDivElement;

  private tabs: Tabs | null = null;
  private langButton: HTMLButtonElement | null = null;
  private skinButton: HTMLButtonElement | null = null;
  private readonly theme: ThemeController;
  private readonly cursors: CursorController;
  private renderScope: DisposableScope | null = null;
  private readonly lifecycle = new DisposableScope();
  private readonly fullscreen: FullscreenController;
  private readonly focusNav: FocusNavController;
  private activeTabId: ShowcaseTabId = 'buttons';
  private tabOrder: ShowcaseTabId[] = [];
  private destroyed = false;
  private readonly onLangButtonClick = (): void => {
    void i18next.changeLanguage(i18next.language === 'tr' ? 'en' : 'tr');
  };
  private readonly onSkinButtonClick = (): void => {
    const index = THEME_IDS.indexOf(this.theme.state.theme);
    this.theme.setTheme(THEME_IDS[(index + 1) % THEME_IDS.length]);
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
    // Kol gezinmesi vitrin genelinde yaşar: rebuild sekmeleri yeniden kurar
    // ama controller'ın document dinleyicileri ve rAF'ı sabit kalır.
    this.focusNav = this.lifecycle.addDestroyable(
      new FocusNavController({
        onMenu: () => {
          void showConfirm({ title: i18next.t('volui:app.paused') });
        },
        onPrevTab: () => this.stepTab(-1),
        onNextTab: () => this.stepTab(1),
      }),
    );
    this.focusNav.start();
    // Skin (tema): kök elemana `data-vol-theme` yazar; ses paleti ve imleç vurgusu ona bağlanır.
    this.theme = new ThemeController({ store: localThemeStore() });
    this.lifecycle.add(this.theme.attach(document.documentElement));
    this.lifecycle.add(this.theme);
    this.lifecycle.add(this.theme.onChange((state) => this.onThemeChanged(state.theme)));
    void this.theme.restore();
    // Uygulama genelinde oyun imleçleri: düğme eli, metin, sürükleme, boyutlandırma.
    this.cursors = new CursorController({ mode: 'ui' });
    this.lifecycle.add(this.cursors);
    this.onThemeChanged(this.theme.state.theme);
    // Uygulama genelinde arayüz sesi: niyetler, hover ve odak; bağlam ilk jestte kurulur.
    this.lifecycle.add(startAppSound(this.element, this.theme));
    this.rebuild();
  }

  /** Skin değişince imleç vurgusu ve düğme etiketi yenilenir (ses paleti `followTheme` ile kendiliğinden). */
  private onThemeChanged(theme: ThemeId): void {
    this.cursors.setPalette({ accent: SKIN_CURSOR_ACCENT[theme] ?? '#ffb27a' });
    this.renderSkinLabel();
  }

  private renderSkinLabel(): void {
    if (!this.skinButton) return;
    const theme = this.theme.state.theme;
    const label = i18next.t('volui:app.skin', {
      skin: i18next.t(theme === 'aurum' ? 'volui:app.skinAurum' : 'volui:app.skinDefault'),
    });
    this.skinButton.textContent = label;
    this.skinButton.setAttribute('aria-label', label);
    this.skinButton.dataset.skin = theme;
  }

  private stepTab(delta: number): void {
    if (this.tabOrder.length === 0 || !this.tabs) return;
    const index = this.tabOrder.indexOf(this.activeTabId);
    const next = this.tabOrder[(index + delta + this.tabOrder.length) % this.tabOrder.length];
    this.tabs.select(next);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.renderScope?.dispose();
    this.renderScope = null;
    this.lifecycle.dispose();
    this.tabs = null;
    this.langButton = null;
    this.skinButton = null;
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

    this.skinButton = document.createElement('button');
    this.skinButton.type = 'button';
    this.skinButton.className = 'vol-showcase-lang-button vol-showcase-skin-button';
    renderScope.addListener(this.skinButton, 'click', this.onSkinButtonClick);
    this.renderSkinLabel();

    const fullscreenButton = document.createElement('button');
    fullscreenButton.type = 'button';
    fullscreenButton.className = 'vol-showcase-fullscreen-button';
    fullscreenButton.textContent = '⛶';
    renderScope.addListener(fullscreenButton, 'click', () => void this.fullscreen.toggle());
    this.renderFullscreenLabel(fullscreenButton);

    const actions = document.createElement('div');
    actions.className = 'vol-showcase-header__actions';
    actions.append(this.skinButton, this.langButton, fullscreenButton);
    header.appendChild(actions);

    const specs: TabSpec[] = [
      // LB/RB sekme geçişinin sıra kaynağı — liste tek yerden türetilir.
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
      { id: 'ses', labelKey: 'ses', builder: buildSesTab },
      { id: 'kimlik', labelKey: 'kimlik', builder: buildKimlikTab },
    ];
    const entries = specs.map((spec) => ({
      id: spec.id,
      label: i18next.t(`volui:tabs.${spec.labelKey}`),
      content: spec.builder(),
    }));
    this.tabOrder = specs.map((spec) => spec.id);
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
