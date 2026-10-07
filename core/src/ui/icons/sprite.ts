import { CHROME_ICONS, ICON_CATEGORIES, type IconName as CatalogIconName } from './iconNames';

export type { CatalogIconName };
export type IconSprite = 'chrome' | 'game';

export const SPRITE_PREFIX = 'vol-icon-';
const SPRITE_FILES: Readonly<Record<IconSprite, string>> = {
  chrome: 'chrome.svg',
  game: 'game.svg',
};

let spriteRoot = 'assets/icons';
const loading = new Map<IconSprite, Promise<void>>();

const catalog = new Set<string>(Object.values(ICON_CATEGORIES).flat());
const chromeNames = new Set<string>(CHROME_ICONS);

/**
 * Eski (çizgi, kebab-case) ikon adlarından kataloğun kalın dolu karşılıklarına eşleme. Eşlemesi
 * olmayan eski adlar (editör araçları) eski çizgi gövdesiyle çizilmeye devam eder.
 */
export const LEGACY_ICON_ALIASES: Readonly<Record<string, CatalogIconName>> = {
  'chevron-down': 'chevronDown',
  'chevron-left': 'chevronLeft',
  'chevron-right': 'chevronRight',
  'chevron-up': 'chevronUp',
  close: 'close',
  more: 'more',
  pause: 'pause',
  play: 'play',
  stop: 'stop',
  refresh: 'refresh',
  search: 'search',
  settings: 'settings',
  warning: 'warning',
  save: 'save',
  fullscreen: 'fullscreen',
  volume: 'speaker',
  music: 'music',
  trash: 'trash',
  pencil: 'pencil',
  copy: 'copy',
  fill: 'paintBucket',
  eyedropper: 'eyedropper',
  undo: 'undo',
  redo: 'redo',
  'zoom-in': 'zoomIn',
  'zoom-out': 'zoomOut',
  apps: 'apps',
  audio: 'audio',
  collapse: 'collapse',
  expand: 'expand',
  file: 'file',
  font: 'font',
  grid: 'grid',
  image: 'image',
  list: 'menu',
  modified: 'dot',
  layers: 'layers',
  'layer-add': 'layerAdd',
  'move-up': 'moveUp',
  'move-down': 'moveDown',
  visible: 'eye',
  hidden: 'eyeOff',
  eraser: 'eraser',
  fit: 'fit',
  reset: 'undo',
};

/** Ad katalogdaysa (ya da eski ad bir katalog ikonuna eşlenmişse) katalog kimliği; yoksa `null`. */
export function resolveCatalogIcon(name: string): CatalogIconName | null {
  if (catalog.has(name)) return name as CatalogIconName;
  return LEGACY_ICON_ALIASES[name] ?? null;
}

/** Bir katalog ikonunun hangi sprite'ta durduğu. */
export function spriteOf(name: CatalogIconName): IconSprite {
  return chromeNames.has(name) ? 'chrome' : 'game';
}

/**
 * İkon sprite'larının kökü (sona `/` almaz). `publicDir` konvansiyonunda `assets/icons`tir;
 * farklı sunan tüketici kendi kökünü verir. Değişim yalnız henüz yüklenmemiş sprite'ları etkiler.
 */
export function configureIcons(options: { baseUrl?: string }): void {
  if (options.baseUrl !== undefined) spriteRoot = options.baseUrl.replace(/\/+$/, '');
}

function marker(kind: IconSprite): string {
  return `[data-vol-icon-sprite="${kind}"]`;
}

export function isIconSpriteLoaded(kind: IconSprite): boolean {
  return document.querySelector(marker(kind)) !== null;
}

/** Sprite metnini belgeye yerleştirir (tek kez); sunucusuz ortamlarda ve testlerde doğrudan kullanılır. */
export function registerIconSprite(kind: IconSprite, svgText: string): void {
  if (isIconSpriteLoaded(kind)) return;
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;
  if (parsed.nodeName !== 'svg') throw new Error(`İkon sprite'ı geçersiz: ${kind}`);
  const imported = document.importNode(parsed, true);
  imported.setAttribute('data-vol-icon-sprite', kind);
  document.body.prepend(imported);
}

/**
 * Sprite'ı getirir ve yerleştirir; eşzamanlı çağrılar tek istekte birleşir. Başarısızlık (ağ,
 * ayrıştırma) bir uyarıyla bildirilir ve sonraki çağrıda yeniden denenir; ikon yoksa `Icon` boş
 * kalır, erişilebilir adı ve yerleşimi bozulmaz.
 */
export function loadIconSprite(kind: IconSprite): Promise<void> {
  if (isIconSpriteLoaded(kind)) return Promise.resolve();
  const pending = loading.get(kind);
  if (pending) return pending;
  if (typeof fetch !== 'function') return Promise.resolve();
  const task = fetch(`${spriteRoot}/${SPRITE_FILES[kind]}`)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    })
    .then((text) => registerIconSprite(kind, text))
    .catch((error: unknown) => {
      console.warn(`[VOL.UI] İkon sprite'ı yüklenemedi (${kind}):`, error);
    })
    .finally(() => loading.delete(kind));
  loading.set(kind, task);
  return task;
}
