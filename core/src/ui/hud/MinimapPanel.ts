import { i18next } from '../../i18n/I18n';
import type { Disposable } from '../../lifecycle/DisposableScope';
import { Icon } from '../primitives/Icon';
import { IconButton } from '../primitives/IconButton';
import { watchTheme } from '../themes/themeWatch';
import {
  drawBounds,
  drawCursor,
  drawEdgeMarker,
  drawFrustum,
  drawGrid,
  drawMarker,
  drawNorth,
  drawPing,
  drawScaleBar,
  resolveMinimapPalette,
  type DrawableMarker,
  type MinimapPalette,
  type MinimapRect,
  type MinimapView,
} from './minimapDraw';

export interface MinimapPanelOptions {
  /** Minimap'in ekran boyutu (px). */
  width: number;
  height: number;
  /** Oyun dünyasının toplam boyutu (dünya birimi/piksel) — marker koordinatları bu uzaya göre verilir. */
  worldWidth: number;
  worldHeight: number;
  /** Dünyanın sol-üst köşesinin gerçek koordinatı. Varsayılan (0,0); merkez-orijinli bir dünya için sol-üst köşeye ayarlayın. */
  worldOffsetX?: number;
  worldOffsetY?: number;
  /** Statik arazi/harita görseli; canvas'ın altına, marker'lardan önce çizilir. */
  backgroundImage?: CanvasImageSource;
  /** Görünür dünya alanını daraltır (zoom). 1 = tüm dünya görünür (varsayılan). `setZoom()`/`pan()` ile çalışma anında değiştirilebilir. */
  zoom?: number;
  /** Minimap'e tıklanınca dünya koordinatını döndürür (kamera zıplatma çağıran tarafta yapılır). */
  onClick?: (worldX: number, worldY: number) => void;
  /** Ekran okuyucu adı. Sağlayıcı dil değişiminde yeniden okunur; varsayılan CORE dil anahtarıdır. */
  label?: string | (() => string);
  /** Dünya ızgarası: `step` dünya birimidir, her `majorEvery` çizgide bir belirgin çizgi (varsayılan 5). Tema renginde, canvas içinde çizilir. */
  grid?: { step: number; majorEvery?: number };
  /** Dünya sınırı çerçevesi. Varsayılan true. */
  showBounds?: boolean;
  /** Sol altta ölçek çubuğu: bir metre kaç dünya birimidir. Çubuk uzunluğu zoom'a göre 1-2-5 dizisinden seçilir. */
  scaleBar?: { unitsPerMetre: number; unit?: string };
  /** Sağ üstte kuzey işareti (yukarı). Varsayılan false. */
  north?: boolean;
  /** Zemin opaklığı (0–1): HUD haritası oyunu yarı saydam gösterir. Varsayılan 0.8. */
  opacity?: number;
  /** İşaretçi basılıyken ve sürüklenirken dünya koordinatını bildirir (kamera sürükleme). `onClick`ten bağımsızdır. */
  onNavigate?: (worldX: number, worldY: number) => void;
  /** Tekerlek imleç konumunda yakınlaştırır. Varsayılan false. */
  wheelZoom?: boolean;
  /** Kullanıcı yakınlaştırmasının üst sınırı (setZoom bunun dışına çıkabilir). Varsayılan 8. */
  maxZoom?: number;
  /** Köşede +/− yakınlaştırma düğmeleri (dokunma ve kol için tekerleğin karşılığı). Varsayılan false. */
  controls?: boolean;
  /** Ekran okuyucu özeti: `kind` başına işaret sayısı ve yakınlaştırma. Verilmezse genel sayı özeti. */
  describe?: (counts: Readonly<Record<string, number>>, zoom: number) => string;
}

export type MinimapMarkerShape = 'dot' | 'arrow' | 'square' | 'diamond';

export interface MinimapMarker {
  worldX: number;
  worldY: number;
  color: string;
  /** Marker temel boyutu (px, minimap'in kendi ölçeğine göre otomatik ayarlanır). Varsayılan 3. */
  radius?: number;
  /** 'dot' (varsayılan), 'arrow' (yön/rotasyon), 'square' (yapı/hedef) ya da 'diamond' (amaç). */
  shape?: MinimapMarkerShape;
  /** shape: 'arrow' iken bakış yönü, radyan (0 = sağ, saat yönünde artar). */
  rotation?: number;
  /** Okuyucu özetinde sayılan tür ("player", "enemy"…). */
  kind?: string;
  /** Çizim sırası: büyük olan üstte (oyuncu en üstte olsun diye). Varsayılan 0. */
  priority?: number;
  /** Koyu kenar çizgisi (zemin ne olursa olsun okunur). Varsayılan true. */
  outline?: boolean;
  /** true ise görünür alanın dışına çıkınca kenarda yön oku olarak gösterilir (yakınlaştırılmış haritada). */
  edge?: boolean;
  /**
   * Dünya birimi cinsinden alan yarıçapı (bölge, menzil): işaretin altına yarı saydam disk ve halka
   * çizilir, yakınlaştırınca dünya ile birlikte büyür. Varsayılan 0 (alan yok).
   */
  worldRadius?: number;
}

interface Ping {
  x: number;
  y: number;
  color: string;
  start: number;
}

const WELL_ALPHA = 0.8;
const PING_MS = 1200;
const MAX_PINGS = 8;
const MAX_DPR = 2;
/** Çizim isteyen en küçük yön değişimi (radyan, ≈0,6°). */
const ROTATION_EPSILON = 0.01;

interface StoredMarker {
  worldX: number;
  worldY: number;
  color: string;
  radius: number;
  shape: MinimapMarkerShape;
  rotation: number;
  kind: string;
  priority: number;
  outline: boolean;
  edge: boolean;
  worldRadius: number;
  /** Son `setMarker` çağrısının senkron nesli (`syncMarkers` görülmeyeni bununla ayıklar). */
  stamp: number;
}

function createStored(marker: MinimapMarker, stamp: number): StoredMarker {
  return {
    worldX: marker.worldX,
    worldY: marker.worldY,
    color: marker.color,
    radius: marker.radius ?? 3,
    shape: marker.shape ?? 'dot',
    rotation: marker.rotation ?? 0,
    kind: marker.kind ?? 'marker',
    priority: marker.priority ?? 0,
    outline: marker.outline ?? true,
    edge: marker.edge ?? false,
    worldRadius: marker.worldRadius ?? 0,
    stamp,
  };
}

/**
 * Canvas tabanlı harita. Dünya koordinatlarını piksele çevirir; ızgara, dünya sınırı, kamera görüş alanı,
 * işaretler, ölçek çubuğu ve halka dalgalarını çizer. Kamera zıplatma çağıranda kalır.
 *
 * Performans sözleşmesi: değişiklikler biriktirilir ve çerçeve başına BİR kez çizilir (`batch` ile açıkça da
 * gruplanabilir); piksel altı değişim (aynı işaret, pikselin 1/8'inden az hareket) hiç çizim istemez, durağan
 * harita CPU harcamaz. Canvas cihaz piksel oranına (en çok 2) göre ölçeklenir.
 */
export class MinimapPanel {
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly width: number;
  private readonly height: number;
  private readonly dpr: number;
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly worldOffsetX: number;
  private readonly worldOffsetY: number;
  private readonly baseScale: number;
  private readonly options: MinimapPanelOptions;
  private readonly maxZoom: number;
  private backgroundImage?: CanvasImageSource;
  private zoom: number;
  private panX: number;
  private panY: number;
  private cursor: { x: number; y: number } | null = null;
  private followId: string | null = null;
  private readonly markers = new Map<string, StoredMarker>();
  /** Çizim sırası (öncelik artan); işaret eklenince, çıkınca ya da önceliği değişince yeniden kurulur. */
  private order: StoredMarker[] | null = null;
  private generation = 0;
  private readonly drawable: DrawableMarker = {
    worldX: 0,
    worldY: 0,
    color: '',
    radius: 0,
    shape: 'dot',
    rotation: 0,
    outline: true,
    edge: false,
    worldRadius: 0,
  };
  private readonly counts: Record<string, number> = {};
  private readonly pings: Ping[] = [];
  private viewport: MinimapRect | null = null;
  private palette: MinimapPalette | null = null;
  private paletteKey = '';
  private dirty = false;
  private scheduled = false;
  private batching = 0;
  private destroyed = false;
  private focused = false;
  private pingFrame = 0;
  private dragPointer: number | null = null;
  private description = '';
  private zoomIn?: IconButton;
  private zoomOut?: IconButton;
  private readonly themeWatch: Disposable;
  private readonly setMarkerBound = (id: string, marker: MinimapMarker): void =>
    this.setMarker(id, marker);
  private readonly labelIsI18n: boolean;
  private label: string;
  private readonly interactive: boolean;
  private readonly cleanups: Array<() => void> = [];
  private readonly onLanguageChanged = (): void => {
    if (typeof this.options.label === 'function') this.label = this.options.label();
    else if (this.labelIsI18n) this.label = i18next.t('core:minimap.label');
    this.applyLabels();
  };

  constructor(options: MinimapPanelOptions) {
    const {
      width,
      height,
      worldWidth,
      worldHeight,
      worldOffsetX = 0,
      worldOffsetY = 0,
      backgroundImage,
      zoom = 1,
      onClick,
      onNavigate,
      label,
    } = options;
    this.options = options;
    this.labelIsI18n = label === undefined;
    this.label = typeof label === 'function' ? label() : (label ?? i18next.t('core:minimap.label'));
    this.width = width;
    this.height = height;
    this.dpr = Math.min(MAX_DPR, Math.max(1, globalThis.devicePixelRatio || 1));
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.worldOffsetX = worldOffsetX;
    this.worldOffsetY = worldOffsetY;
    this.backgroundImage = backgroundImage;
    this.maxZoom = Math.max(1, options.maxZoom ?? 8);
    this.zoom = Math.max(1, zoom);
    // Dünyanın gerçek merkezi ile initialize edilir (worldOffset sıfır olmayan dünyalarda clamp doğru köşeden başlasın diye).
    this.panX = worldOffsetX + worldWidth / 2;
    this.panY = worldOffsetY + worldHeight / 2;
    // Marker/ok boyutlarını minimap ekran boyutuna orantılar (160x160 referans).
    this.baseScale = (width + height) / 2 / 160;
    this.interactive = Boolean(onClick ?? onNavigate);

    this.element = document.createElement('div');
    this.element.className = 'vol-minimap';

    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    // Görüntü boyutu CSS değişkeninden gelir: tüketici (örn. dar ekranda küçültme) kendi kuralıyla ezebilir.
    this.element.style.setProperty('--vol-minimap-width', `${width}px`);
    this.element.style.setProperty('--vol-minimap-height', `${height}px`);
    this.canvas.className = 'vol-minimap__canvas';
    this.element.appendChild(this.canvas);

    // CPU tuvali (`willReadFrequently`): küçük arayüz tuvali; Steam Deck gamescope'ta (WebKitGTK, DMA-BUF kompozit)
    // hızlandırılmış 2D tuval BOŞ kalıyordu, CPU tuval aynı sayfada çizer (UI-06.4).
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('MinimapPanel: 2D canvas context alınamadı');
    }
    this.ctx = ctx;

    this.bindInput();
    if (options.controls) this.buildControls();
    this.applyLabels();
    this.draw();

    // Kaplama değişimi, taşınma ve ilk bağlanma `watchTheme`dedir: palet atılır, harita bir kez yeniden çizilir.
    this.themeWatch = watchTheme(this.element, () => {
      this.palette = null;
      this.invalidate();
    });

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  // ---- genel API ----

  /**
   * İşareti ekler ya da günceller. Var olan işaret yerinde güncellenir (çerçeve başına nesne
   * üretilmez); piksel altı değişim hiçbir şey yapmaz. Özet yalnız tür sayıları değişince tazelenir:
   * hareket eden bir işaret çerçeve başına çeviri ve DOM yazımı istemez.
   */
  setMarker(id: string, marker: MinimapMarker): void {
    const stored = this.markers.get(id);
    if (!stored) {
      const created = createStored(marker, this.generation);
      this.markers.set(id, created);
      this.order = null;
      this.counts[created.kind] = (this.counts[created.kind] ?? 0) + 1;
      if (this.followId === id && this.zoom > 1) this.recenter(created.worldX, created.worldY);
      this.refreshDescription();
      this.invalidate();
      return;
    }
    stored.stamp = this.generation;
    if (!this.markerChanged(stored, marker)) return;
    const kind = marker.kind ?? 'marker';
    const priority = marker.priority ?? 0;
    const recount = kind !== stored.kind;
    if (recount) {
      this.counts[stored.kind] = (this.counts[stored.kind] ?? 1) - 1;
      this.counts[kind] = (this.counts[kind] ?? 0) + 1;
    }
    if (priority !== stored.priority) this.order = null;
    stored.worldX = marker.worldX;
    stored.worldY = marker.worldY;
    stored.color = marker.color;
    stored.radius = marker.radius ?? 3;
    stored.shape = marker.shape ?? 'dot';
    stored.rotation = marker.rotation ?? 0;
    stored.kind = kind;
    stored.priority = priority;
    stored.outline = marker.outline ?? true;
    stored.edge = marker.edge ?? false;
    stored.worldRadius = marker.worldRadius ?? 0;
    if (this.followId === id && this.zoom > 1) this.recenter(stored.worldX, stored.worldY);
    if (recount) this.refreshDescription();
    this.invalidate();
  }

  removeMarker(id: string): void {
    const previous = this.markers.get(id);
    if (!previous) return;
    this.markers.delete(id);
    this.order = null;
    this.counts[previous.kind] = (this.counts[previous.kind] ?? 1) - 1;
    if (this.followId === id) this.followId = null;
    this.refreshDescription();
    this.invalidate();
  }

  /**
   * Senkron liste: `fill` içinde verilen işaretler eklenir/güncellenir, verilmeyenler kaldırılır, tek
   * çizim istenir. Her çerçevede çağrılabilir; `set` çağrıları nesne üretmez.
   */
  syncMarkers(fill: (set: (id: string, marker: MinimapMarker) => void) => void): void {
    this.batch(() => {
      this.generation += 1;
      fill(this.setMarkerBound);
      for (const [id, marker] of this.markers)
        if (marker.stamp !== this.generation) this.removeMarker(id);
    });
  }

  /** Kimliği verilen işaretlerin dışındakileri kaldırır, verilenleri ekler/günceller: tek çizimle senkron liste. */
  setMarkers(entries: Iterable<readonly [string, MinimapMarker]>): void {
    this.syncMarkers((set) => {
      for (const [id, marker] of entries) set(id, marker);
    });
  }

  setViewport(x: number, y: number, width: number, height: number): void {
    const eps = this.epsilon();
    const v = this.viewport;
    if (
      v &&
      Math.abs(v.x - x) < eps &&
      Math.abs(v.y - y) < eps &&
      Math.abs(v.width - width) < eps &&
      Math.abs(v.height - height) < eps
    )
      return;
    this.viewport = { x, y, width, height };
    this.invalidate();
  }

  setBackgroundImage(image: CanvasImageSource | undefined): void {
    this.backgroundImage = image;
    this.invalidate();
  }

  /** Birden çok değişikliği tek çizimde toplar (çıkışta bir çizim istenir). */
  batch(change: () => void): void {
    this.batching += 1;
    try {
      change();
    } finally {
      this.batching -= 1;
      if (this.batching === 0 && this.dirty) this.invalidate();
    }
  }

  setZoom(zoom: number): void {
    this.zoom = Math.max(1, zoom);
    this.clampPan();
    this.refreshDescription();
    this.invalidate();
  }

  getZoom(): number {
    return this.zoom;
  }

  /** Kullanıcı yakınlaştırması: `anchor` verilirse o dünya noktası ekranda yerinde kalır; sınırlar [1, maxZoom]. */
  zoomBy(factor: number, anchor?: { x: number; y: number; ratioX: number; ratioY: number }): void {
    const next = Math.min(this.maxZoom, Math.max(1, this.zoom * factor));
    if (next === this.zoom) return;
    this.zoom = next;
    const visibleWidth = this.worldWidth / next;
    const visibleHeight = this.worldHeight / next;
    if (anchor) {
      this.panX = anchor.x - (anchor.ratioX - 0.5) * visibleWidth;
      this.panY = anchor.y - (anchor.ratioY - 0.5) * visibleHeight;
    }
    this.clampPan();
    this.updateZoomButtons();
    this.refreshDescription();
    this.invalidate();
  }

  /** Yakınlaştırmayı ve klavye imlecini sıfırlar (tüm dünya, imleç merkezde). */
  resetView(): void {
    this.zoom = 1;
    this.cursor = null;
    this.clampPan();
    this.updateZoomButtons();
    this.refreshDescription();
    this.invalidate();
  }

  /** Görünür alanın merkezini kaydırır (zoom > 1 iken anlamlıdır). */
  pan(worldX: number, worldY: number): void {
    this.panX = worldX;
    this.panY = worldY;
    this.clampPan();
    this.invalidate();
  }

  /** Verilen işareti yakınlaştırılmış haritada ortada tutar; `null` takibi bırakır. */
  follow(id: string | null): void {
    if (id === this.followId) return;
    this.followId = id;
    const marker = id ? this.markers.get(id) : undefined;
    if (marker && this.zoom > 1) this.recenter(marker.worldX, marker.worldY);
    this.invalidate();
  }

  /** Dünya noktasında halka dalgası (uyarı, işaretleme). Hareket azaltılmışta halka büyümez, yalnız solar. */
  ping(worldX: number, worldY: number, color?: string): void {
    this.pings.push({
      x: worldX,
      y: worldY,
      color: color ?? this.currentPalette().accent,
      start: performance.now(),
    });
    if (this.pings.length > MAX_PINGS) this.pings.shift();
    this.schedulePingFrame();
  }

  /** Şu an görünen dünya dikdörtgeni. */
  getVisibleRect(): MinimapRect {
    return { ...this.visibleWorldRect() };
  }

  /** Bekleyen çizimi hemen yapar (test ve kare sonu senkronu için). */
  flush(): void {
    if (this.dirty && !this.destroyed) this.draw();
  }

  destroy(): void {
    this.destroyed = true;
    i18next.off('languageChanged', this.onLanguageChanged);
    this.themeWatch.dispose();
    if (this.pingFrame) cancelAnimationFrame(this.pingFrame);
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.zoomIn?.destroy();
    this.zoomOut?.destroy();
    this.element.remove();
  }

  // ---- girdi ----

  private bindInput(): void {
    const { onClick, onNavigate, wheelZoom } = this.options;
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: (event: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ): void => {
      const listener = handler as EventListener;
      if (opts) this.canvas.addEventListener(type, listener, opts);
      else this.canvas.addEventListener(type, listener);
      this.cleanups.push(() => {
        if (opts) this.canvas.removeEventListener(type, listener, opts);
        else this.canvas.removeEventListener(type, listener);
      });
    };

    if (!this.interactive) {
      this.canvas.setAttribute('role', 'img');
    } else {
      // Tıklanabilir harita "buton" semantiği taşır: klavye odaklanabilir; ok tuşları imleci, Enter imlecin dünya konumunu seçer.
      this.canvas.setAttribute('role', 'button');
      this.canvas.tabIndex = 0;
      this.canvas.setAttribute(
        'aria-keyshortcuts',
        'ArrowUp ArrowDown ArrowLeft ArrowRight Enter + - Home',
      );
      on('focus', () => {
        this.focused = true;
        this.invalidate();
      });
      on('blur', () => {
        this.focused = false;
        this.invalidate();
      });
      on('keydown', (event) => this.onKeydown(event));
    }

    if (onClick) {
      on('click', (event) => {
        const rect = this.canvas.getBoundingClientRect();
        const { worldX, worldY } = this.screenRatioToWorld(
          (event.clientX - rect.left) / rect.width,
          (event.clientY - rect.top) / rect.height,
        );
        onClick(worldX, worldY);
      });
    }

    if (onNavigate) {
      this.canvas.classList.add('vol-minimap__canvas--navigable');
      const navigate = (event: PointerEvent): void => {
        const rect = this.canvas.getBoundingClientRect();
        const { worldX, worldY } = this.screenRatioToWorld(
          (event.clientX - rect.left) / rect.width,
          (event.clientY - rect.top) / rect.height,
        );
        onNavigate(worldX, worldY);
      };
      on('pointerdown', (event) => {
        if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
        this.dragPointer = event.pointerId;
        this.canvas.setPointerCapture(event.pointerId);
        navigate(event);
      });
      on('pointermove', (event) => {
        if (this.dragPointer === event.pointerId) navigate(event);
      });
      const end = (event: PointerEvent): void => {
        if (this.dragPointer !== event.pointerId) return;
        this.dragPointer = null;
        if (this.canvas.hasPointerCapture(event.pointerId)) {
          this.canvas.releasePointerCapture(event.pointerId);
        }
      };
      on('pointerup', end);
      on('pointercancel', end);
    }

    if (wheelZoom) {
      on(
        'wheel',
        (event) => {
          event.preventDefault();
          const rect = this.canvas.getBoundingClientRect();
          const ratioX = (event.clientX - rect.left) / rect.width;
          const ratioY = (event.clientY - rect.top) / rect.height;
          const at = this.screenRatioToWorld(ratioX, ratioY);
          this.zoomBy(event.deltaY < 0 ? 1.25 : 1 / 1.25, {
            x: at.worldX,
            y: at.worldY,
            ratioX,
            ratioY,
          });
        },
        { passive: false },
      );
    }
  }

  private onKeydown(event: KeyboardEvent): void {
    const { onClick, onNavigate } = this.options;
    const visible = this.visibleWorldRect();
    const step = (event.shiftKey ? 0.3 : 0.1) * visible.width;
    const stepY = (event.shiftKey ? 0.3 : 0.1) * visible.height;
    const current = this.cursor ?? {
      x: visible.x + visible.width / 2,
      y: visible.y + visible.height / 2,
    };
    const move = (dx: number, dy: number): void => {
      event.preventDefault();
      const x = Math.min(
        this.worldOffsetX + this.worldWidth,
        Math.max(this.worldOffsetX, current.x + dx),
      );
      const y = Math.min(
        this.worldOffsetY + this.worldHeight,
        Math.max(this.worldOffsetY, current.y + dy),
      );
      this.cursor = { x, y };
      // İmleç görünür alanın dışına çıkarsa harita onu izler (yakınlaştırılmışken).
      const rect = this.visibleWorldRect();
      if (
        this.zoom > 1 &&
        (x < rect.x || x > rect.x + rect.width || y < rect.y || y > rect.y + rect.height)
      ) {
        this.recenter(x, y);
      }
      this.invalidate();
    };
    switch (event.key) {
      case 'ArrowLeft':
        return move(-step, 0);
      case 'ArrowRight':
        return move(step, 0);
      case 'ArrowUp':
        return move(0, -stepY);
      case 'ArrowDown':
        return move(0, stepY);
      case 'Enter':
      case ' ':
        event.preventDefault();
        (onClick ?? onNavigate)?.(current.x, current.y);
        return;
      case '+':
      case '=':
      case 'PageUp':
        event.preventDefault();
        this.zoomBy(1.5);
        return;
      case '-':
      case 'PageDown':
        event.preventDefault();
        this.zoomBy(1 / 1.5);
        return;
      case 'Home':
        event.preventDefault();
        this.resetView();
        return;
      default:
    }
  }

  private buildControls(): void {
    const bar = document.createElement('div');
    bar.className = 'vol-minimap__controls';
    this.zoomIn = new IconButton(new Icon({ name: 'plus', size: 12 }).element, {
      size: 'sm',
      label: i18next.t('core:minimap.zoomIn'),
      onClick: () => this.zoomBy(1.5),
    });
    this.zoomOut = new IconButton(new Icon({ name: 'minus', size: 12 }).element, {
      size: 'sm',
      label: i18next.t('core:minimap.zoomOut'),
      onClick: () => this.zoomBy(1 / 1.5),
    });
    this.zoomIn.element.classList.add('vol-minimap__zoom');
    this.zoomOut.element.classList.add('vol-minimap__zoom');
    bar.append(this.zoomIn.element, this.zoomOut.element);
    this.element.appendChild(bar);
    this.updateZoomButtons();
  }

  /** Sınırda düğme `disabled` olsaydı odaktaki düğme odağı yitirirdi: yalnız `aria-disabled` ve görünüm değişir. */
  private updateZoomButtons(): void {
    this.zoomIn?.element.setAttribute('aria-disabled', String(this.zoom >= this.maxZoom));
    this.zoomOut?.element.setAttribute('aria-disabled', String(this.zoom <= 1));
  }

  // ---- ad ve özet ----

  private applyLabels(): void {
    const { onClick, onNavigate } = this.options;
    this.canvas.setAttribute(
      'aria-label',
      (onClick ?? onNavigate)
        ? i18next.t('core:minimap.interactive', { label: this.label })
        : this.label,
    );
    if (this.zoomIn && this.zoomOut) {
      this.zoomIn.element.setAttribute('aria-label', i18next.t('core:minimap.zoomIn'));
      this.zoomOut.element.setAttribute('aria-label', i18next.t('core:minimap.zoomOut'));
    }
    this.description = '';
    this.refreshDescription();
  }

  /** Özet (tür başına sayı + yakınlaştırma) yalnız değişince DOM'a yazılır; okuyucu her kare güncellenmez. */
  private refreshDescription(): void {
    const total = Object.values(this.counts).reduce((sum, n) => sum + Math.max(0, n), 0);
    const zoom = Math.round(this.zoom * 10) / 10;
    const text = this.options.describe
      ? this.options.describe(this.counts, zoom)
      : i18next.t('core:minimap.summary', { label: this.label, count: total, zoom });
    if (text === this.description) return;
    this.description = text;
    this.canvas.setAttribute('aria-description', text);
  }

  // ---- dönüşümler ----

  /** Çizim isteyen en küçük konum değişimi (dünya birimi): bir CSS pikselinin 1/8'i. */
  private epsilon(): number {
    return this.worldWidth / this.zoom / this.width / 8;
  }

  private markerChanged(stored: StoredMarker, next: MinimapMarker): boolean {
    const eps = this.epsilon();
    return (
      stored.color !== next.color ||
      stored.radius !== (next.radius ?? 3) ||
      stored.shape !== (next.shape ?? 'dot') ||
      stored.kind !== (next.kind ?? 'marker') ||
      stored.priority !== (next.priority ?? 0) ||
      stored.outline !== (next.outline ?? true) ||
      stored.edge !== (next.edge ?? false) ||
      stored.worldRadius !== (next.worldRadius ?? 0) ||
      Math.abs(stored.worldX - next.worldX) >= eps ||
      Math.abs(stored.worldY - next.worldY) >= eps ||
      Math.abs(stored.rotation - (next.rotation ?? 0)) >= ROTATION_EPSILON
    );
  }

  private recenter(worldX: number, worldY: number): void {
    this.panX = worldX;
    this.panY = worldY;
    this.clampPan();
  }

  private clampPan(): void {
    const visibleWidth = this.worldWidth / this.zoom;
    const visibleHeight = this.worldHeight / this.zoom;
    const minX = this.worldOffsetX + visibleWidth / 2;
    const maxX = this.worldOffsetX + this.worldWidth - visibleWidth / 2;
    const minY = this.worldOffsetY + visibleHeight / 2;
    const maxY = this.worldOffsetY + this.worldHeight - visibleHeight / 2;
    this.panX =
      this.zoom > 1
        ? Math.min(maxX, Math.max(minX, this.panX))
        : this.worldOffsetX + this.worldWidth / 2;
    this.panY =
      this.zoom > 1
        ? Math.min(maxY, Math.max(minY, this.panY))
        : this.worldOffsetY + this.worldHeight / 2;
  }

  private visibleWorldRect(): MinimapRect {
    const width = this.worldWidth / this.zoom;
    const height = this.worldHeight / this.zoom;
    const centerX = this.zoom > 1 ? this.panX : this.worldOffsetX + this.worldWidth / 2;
    const centerY = this.zoom > 1 ? this.panY : this.worldOffsetY + this.worldHeight / 2;
    return { x: centerX - width / 2, y: centerY - height / 2, width, height };
  }

  private screenRatioToWorld(px: number, py: number): { worldX: number; worldY: number } {
    const visible = this.visibleWorldRect();
    return {
      worldX: visible.x + px * visible.width,
      worldY: visible.y + py * visible.height,
    };
  }

  // ---- çizim ----

  private invalidate(): void {
    this.dirty = true;
    if (this.batching > 0 || this.scheduled || this.destroyed) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (!this.destroyed) this.flush();
    });
  }

  private currentPalette(): MinimapPalette {
    const key = this.element.closest('[data-vol-theme]')?.getAttribute('data-vol-theme') ?? '';
    if (!this.palette || this.paletteKey !== key) {
      this.palette = resolveMinimapPalette(this.element);
      this.paletteKey = key;
    }
    return this.palette;
  }

  private reducedMotion(): boolean {
    return (
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  private schedulePingFrame(): void {
    if (this.pingFrame || this.destroyed) return;
    const tick = (): void => {
      this.pingFrame = 0;
      const now = performance.now();
      while (this.pings.length > 0 && now - this.pings[0].start >= PING_MS) this.pings.shift();
      this.dirty = true;
      this.flush();
      if (this.pings.length > 0 && !this.destroyed) this.pingFrame = requestAnimationFrame(tick);
    };
    this.pingFrame = requestAnimationFrame(tick);
  }

  private drawOrder(): readonly StoredMarker[] {
    if (!this.order) {
      this.order = [...this.markers.values()].sort((a, b) => a.priority - b.priority);
    }
    return this.order;
  }

  private draw(): void {
    this.dirty = false;
    const { ctx, width, height } = this;
    const palette = this.currentPalette();
    const view: MinimapView = { visible: this.visibleWorldRect(), width, height };
    const world: MinimapRect = {
      x: this.worldOffsetX,
      y: this.worldOffsetY,
      width: this.worldWidth,
      height: this.worldHeight,
    };

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = this.options.opacity ?? WELL_ALPHA;
    ctx.fillStyle = palette.well;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;

    if (this.backgroundImage) {
      const scaleX = width / view.visible.width;
      const scaleY = height / view.visible.height;
      ctx.save();
      ctx.translate(-view.visible.x * scaleX, -view.visible.y * scaleY);
      ctx.scale(scaleX, scaleY);
      ctx.drawImage(this.backgroundImage, world.x, world.y, world.width, world.height);
      ctx.restore();
    }

    const { grid, scaleBar } = this.options;
    if (grid) {
      drawGrid(ctx, view, palette, { x: world.x, y: world.y }, grid.step, grid.majorEvery ?? 5);
    }
    if (this.options.showBounds ?? true) drawBounds(ctx, view, palette, world);
    if (this.viewport) drawFrustum(ctx, view, palette, this.viewport);

    const drawable = this.drawable;
    for (const marker of this.drawOrder()) {
      drawable.worldX = marker.worldX;
      drawable.worldY = marker.worldY;
      drawable.color = marker.color;
      drawable.radius = marker.radius * this.baseScale;
      drawable.shape = marker.shape;
      drawable.rotation = marker.rotation;
      drawable.outline = marker.outline;
      drawable.edge = marker.edge;
      drawable.worldRadius = marker.worldRadius;
      drawMarker(ctx, view, palette, drawable);
      if (marker.edge) drawEdgeMarker(ctx, view, palette, drawable);
    }

    if (this.pings.length > 0) {
      const now = performance.now();
      const expand = !this.reducedMotion();
      for (const ping of this.pings) {
        drawPing(ctx, view, ping.x, ping.y, ping.color, (now - ping.start) / PING_MS, expand);
      }
    }
    if (this.focused && this.interactive) {
      const c = this.cursor ?? {
        x: view.visible.x + view.visible.width / 2,
        y: view.visible.y + view.visible.height / 2,
      };
      drawCursor(ctx, view, palette, c.x, c.y);
    }
    if (scaleBar) {
      drawScaleBar(ctx, view, palette, scaleBar.unitsPerMetre, scaleBar.unit ?? 'm');
    }
    if (this.options.north) drawNorth(ctx, view, palette);
  }
}
