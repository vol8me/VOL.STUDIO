import { FullscreenController } from '@volstudio/core/platform';
import { startAppSound } from './appSound';
import {
  Button,
  CursorController,
  FocusNavController,
  Icon,
  IconButton,
  type IconName,
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

/**
 * Dar pencerede (telefon, küçük tablet dikey) kenar çubuğu 220 px kaplar ve içeriğe 173 px bırakır;
 * bu genişlikten itibaren sekmeler üstte tek satırda kayan şeride, üst çubuk tek satıra iner.
 */
const COMPACT_QUERY = '(max-width: 720px)';

/** Sekme kimliği → ikon (süs; sekme adı metindedir). */
const TAB_ICONS: ReadonlyArray<readonly [ShowcaseTabId, IconName]> = [
  ['buttons', 'select'],
  ['text', 'font'],
  ['panels', 'layers'],
  ['hud', 'health'],
  ['cards', 'crown'],
  ['forms', 'tune'],
  ['workbench', 'gears'],
  ['palette', 'palette'],
  ['advanced', 'apps'],
  ['scroll', 'moveDown'],
  ['touch', 'touch'],
  ['loading', 'refresh'],
  ['ses', 'speaker'],
  ['kimlik', 'star'],
];

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
  private langButton: Button | null = null;
  private skinButton: Button | null = null;
  private fullscreenButton: IconButton | null = null;
  private readonly theme: ThemeController;
  private readonly cursors: CursorController;
  private renderScope: DisposableScope | null = null;
  private readonly lifecycle = new DisposableScope();
  private readonly fullscreen: FullscreenController;
  private readonly focusNav: FocusNavController;
  private activeTabId: ShowcaseTabId = 'buttons';
  private tabOrder: ShowcaseTabId[] = [];
  private destroyed = false;
  private compact = false;
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
    this.watchCompact();
    this.rebuild();
  }

  /** Pencere dar eşiği geçince kabuk yeniden kurulur (aktif sekme korunur). */
  private watchCompact(): void {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(COMPACT_QUERY);
    this.compact = query.matches;
    const onChange = (): void => {
      if (this.destroyed || query.matches === this.compact) return;
      this.compact = query.matches;
      this.rebuild();
    };
    query.addEventListener('change', onChange);
    this.lifecycle.addSubscription(() => query.removeEventListener('change', onChange));
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
    this.skinButton.setLabel(label);
    this.skinButton.element.setAttribute('aria-label', label);
    this.skinButton.element.dataset.skin = theme;
  }

  private stepTab(delta: number): void {
    if (this.tabOrder.length === 0 || !this.tabs) return;
    const index = this.tabOrder.indexOf(this.activeTabId);
    const next = this.tabOrder[(index + delta + this.tabOrder.length) % this.tabOrder.length];
    // LB/RB bir kullanıcı eylemidir: sekme geçişi tıklamayla aynı `navigate` sesini alır.
    this.tabs.select(next, new Event('vol-navigate'));
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
    this.fullscreenButton = null;
    this.element.remove();
  }

  private rebuild(): void {
    // Belge dili sayfa kurulmadan önce yazılır: WebKit büyük harf dönüşümünü ilk yerleşimdeki dil
    // kuralıyla yapar (index.html varsayılanı `tr`; İngilizce başlık "SETTİNGS" olmasın).
    document.documentElement.lang = i18next.language ?? 'tr';
    this.renderScope?.dispose();
    const renderScope = new DisposableScope();
    this.renderScope = renderScope;
    this.element.replaceChildren();

    const header = document.createElement('header');
    header.className = 'vol-showcase-header';

    // Marka bloğu: elmas işareti (marka rengi; skin ile değişir), ad ve alt yazı.
    const brand = document.createElement('div');
    brand.className = 'vol-showcase-brand';
    const mark = document.createElement('span');
    mark.className = 'vol-showcase-brand__mark';
    mark.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'vol-showcase-brand__name';
    name.textContent = i18next.t('volui:app.title');
    const tagline = document.createElement('span');
    tagline.className = 'vol-showcase-brand__tagline';
    tagline.textContent = i18next.t('volui:app.tagline');
    brand.append(mark, name, tagline);
    header.appendChild(brand);

    // Üst çubuk düğmeleri çekirdeğin gerçek bileşenleridir: malzeme, ses, titreşim ve odak aynı yoldan gelir.
    this.langButton = renderScope.addDestroyable(
      new Button(i18next.t('volui:app.language'), {
        size: 'sm',
        iconLeft: new Icon({ name: 'language', size: 16 }).element,
        onClick: () => this.onLangButtonClick(),
      }),
    );
    this.langButton.element.classList.add('vol-showcase-lang-button');
    this.langButton.element.setAttribute('aria-label', i18next.t('volui:app.language'));

    this.skinButton = renderScope.addDestroyable(
      new Button('', { size: 'sm', onClick: () => this.onSkinButtonClick() }),
    );
    this.skinButton.element.classList.add('vol-showcase-skin-button');
    this.renderSkinLabel();

    this.fullscreenButton = renderScope.addDestroyable(
      new IconButton(new Icon({ name: 'fullscreen', size: 18 }).element, {
        size: 'sm',
        label: i18next.t('volui:app.fullscreen'),
        onClick: () => void this.fullscreen.toggle(),
      }),
    );
    this.fullscreenButton.element.classList.add('vol-showcase-fullscreen-button');
    this.renderFullscreenLabel(this.fullscreenButton.element);

    const actions = document.createElement('div');
    actions.className = 'vol-showcase-header__actions';
    actions.append(this.skinButton.element, this.langButton.element, this.fullscreenButton.element);
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
    const entries = specs.map((spec) => {
      const label = i18next.t(`volui:tabs.${spec.labelKey}`);
      const built = spec.builder();
      // Her sayfa başlık şeridiyle açılır: ne olduğu ve neyi gösterdiği ilk bakışta okunur.
      const page = document.createElement('div');
      page.className = 'vol-showcase-page';
      const pageHeader = document.createElement('div');
      pageHeader.className = 'vol-showcase-page__header';
      const pageTitle = document.createElement('h1');
      pageTitle.className = 'vol-showcase-page__title';
      pageTitle.textContent = label;
      const pageDescription = document.createElement('p');
      pageDescription.className = 'vol-showcase-page__description';
      pageDescription.textContent = i18next.t(`volui:tabDescriptions.${spec.id}`);
      pageHeader.append(pageTitle, pageDescription);
      page.append(pageHeader, built.element);
      return {
        id: spec.id,
        label,
        content: { element: page, destroy: () => built.destroy?.() },
      };
    });
    this.tabOrder = specs.map((spec) => spec.id);
    const tabs = new Tabs(entries, {
      orientation: this.compact ? 'horizontal' : 'vertical',
      listHeader: header,
      onChange: (id) => {
        const selected = specs.find((spec) => spec.id === id);
        if (selected) this.activeTabId = selected.id;
      },
    });
    this.tabs = renderScope.addDestroyable(tabs);
    this.decorateTabs(tabs);
    if (entries.some((entry) => entry.id === this.activeTabId)) {
      this.tabs.select(this.activeTabId);
    } else {
      this.activeTabId = entries[0].id;
    }
    this.element.appendChild(this.tabs.element);
    document.title = i18next.t('volui:app.title');
  }

  /** Sekme düğmelerine ikon ekler (`-tab-<id>` kimliğinden): ikon süstür, ad metindedir. */
  private decorateTabs(tabs: Tabs): void {
    for (const tab of tabs.element.querySelectorAll<HTMLElement>('[role="tab"]')) {
      const id = TAB_ICONS.find(([tabId]) => tab.id.endsWith(`-tab-${tabId}`));
      if (!id) continue;
      const icon = new Icon({ name: id[1], size: 18 }).element;
      icon.classList.add('vol-showcase-tab-icon');
      icon.setAttribute('aria-hidden', 'true');
      tab.prepend(icon);
    }
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
