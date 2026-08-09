import { i18next } from '../../systems/I18n';

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
  /** Ekran okuyucular için açıklama. Varsayılan "Harita". */
  label?: string;
}

export type MinimapMarkerShape = 'dot' | 'arrow';

export interface MinimapMarker {
  worldX: number;
  worldY: number;
  color: string;
  /** Marker temel boyutu (px, minimap'in kendi ölçeğine göre otomatik ayarlanır). Varsayılan 3. */
  radius?: number;
  /** 'dot' (varsayılan): basit nokta. 'arrow': yön/rotasyon gösteren üçgen (oyuncu/birim göstergesi için). */
  shape?: MinimapMarkerShape;
  /** shape: 'arrow' iken bakış yönü, radyan (0 = sağ, saat yönünde artar). */
  rotation?: number;
}

/** Canvas tabanlı minimap. Dünya koordinatlarını minimap pikseline dönüştürüp marker'ları/viewport'u çizer; kamera zıplatma dışarıda kalır. */
export class MinimapPanel {
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly worldOffsetX: number;
  private readonly worldOffsetY: number;
  private readonly baseScale: number;
  private backgroundImage?: CanvasImageSource;
  private zoom: number;
  private panX: number;
  private panY: number;
  private readonly markers = new Map<string, MinimapMarker>();
  private viewport: { x: number; y: number; width: number; height: number } | null = null;
  private boundClick?: (event: MouseEvent) => void;
  private boundKeydown?: (event: KeyboardEvent) => void;
  private readonly labelIsI18n: boolean;
  private label: string;
  private readonly onClickHandler?: (worldX: number, worldY: number) => void;
  private readonly onLanguageChanged = (): void => {
    if (this.labelIsI18n) this.label = i18next.t('core:minimap.label');
    if (this.onClickHandler) {
      this.canvas.setAttribute(
        'aria-label',
        i18next.t('core:minimap.interactive', { label: this.label }),
      );
    } else {
      this.canvas.setAttribute('aria-label', this.label);
    }
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
      label,
    } = options;
    this.labelIsI18n = label === undefined;
    this.label = label ?? i18next.t('core:minimap.label');
    this.onClickHandler = onClick;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.worldOffsetX = worldOffsetX;
    this.worldOffsetY = worldOffsetY;
    this.backgroundImage = backgroundImage;
    this.zoom = Math.max(1, zoom);
    // Dünyanın gerçek merkezi ile initialize edilir (worldOffset sıfır olmayan dünyalarda clamp doğru köşeden başlasın diye).
    this.panX = worldOffsetX + worldWidth / 2;
    this.panY = worldOffsetY + worldHeight / 2;
    // Marker/ok boyutlarını minimap ekran boyutuna orantılar (160x160 referans).
    this.baseScale = (width + height) / 2 / 160;

    this.element = document.createElement('div');
    this.element.className = 'vol-minimap';

    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.className = 'vol-minimap__canvas';
    this.element.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('MinimapPanel: 2D canvas context alınamadı');
    }
    this.ctx = ctx;

    if (onClick) {
      // Tıklanabilir minimap "buton" semantiği taşır: klavye odaklanabilir, Enter/Space merkeze tıklamayı simüle eder.
      this.canvas.setAttribute('role', 'button');
      this.canvas.tabIndex = 0;
      this.canvas.setAttribute(
        'aria-label',
        i18next.t('core:minimap.interactive', { label: this.label }),
      );

      this.boundClick = (event) => {
        const rect = this.canvas.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width;
        const py = (event.clientY - rect.top) / rect.height;
        const { worldX, worldY } = this.screenRatioToWorld(px, py);
        onClick(worldX, worldY);
      };
      this.canvas.addEventListener('click', this.boundClick);

      this.boundKeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          const { worldX, worldY } = this.screenRatioToWorld(0.5, 0.5);
          onClick(worldX, worldY);
        }
      };
      this.canvas.addEventListener('keydown', this.boundKeydown);
    } else {
      this.canvas.setAttribute('role', 'img');
      this.canvas.setAttribute('aria-label', this.label);
    }

    this.render();

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  setMarker(id: string, marker: MinimapMarker): void {
    this.markers.set(id, marker);
    this.render();
  }

  removeMarker(id: string): void {
    this.markers.delete(id);
    this.render();
  }

  setViewport(x: number, y: number, width: number, height: number): void {
    this.viewport = { x, y, width, height };
    this.render();
  }

  setBackgroundImage(image: CanvasImageSource | undefined): void {
    this.backgroundImage = image;
    this.render();
  }

  setZoom(zoom: number): void {
    this.zoom = Math.max(1, zoom);
    this.clampPan();
    this.render();
  }

  getZoom(): number {
    return this.zoom;
  }

  /** Görünür alanın merkezini kaydırır (zoom > 1 iken anlamlıdır). */
  pan(worldX: number, worldY: number): void {
    this.panX = worldX;
    this.panY = worldY;
    this.clampPan();
    this.render();
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    if (this.boundClick) {
      this.canvas.removeEventListener('click', this.boundClick);
    }
    if (this.boundKeydown) {
      this.canvas.removeEventListener('keydown', this.boundKeydown);
    }
    this.element.remove();
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

  private visibleWorldRect(): { x: number; y: number; width: number; height: number } {
    const width = this.worldWidth / this.zoom;
    const height = this.worldHeight / this.zoom;
    const centerX = this.zoom > 1 ? this.panX : this.worldOffsetX + this.worldWidth / 2;
    const centerY = this.zoom > 1 ? this.panY : this.worldOffsetY + this.worldHeight / 2;
    return { x: centerX - width / 2, y: centerY - height / 2, width, height };
  }

  private worldToCanvas(worldX: number, worldY: number): { x: number; y: number } {
    const visible = this.visibleWorldRect();
    const { width, height } = this.canvas;
    return {
      x: ((worldX - visible.x) / visible.width) * width,
      y: ((worldY - visible.y) / visible.height) * height,
    };
  }

  private screenRatioToWorld(px: number, py: number): { worldX: number; worldY: number } {
    const visible = this.visibleWorldRect();
    return {
      worldX: visible.x + px * visible.width,
      worldY: visible.y + py * visible.height,
    };
  }

  private render(): void {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    if (this.backgroundImage) {
      const visible = this.visibleWorldRect();
      const scaleX = width / visible.width;
      const scaleY = height / visible.height;
      this.ctx.save();
      this.ctx.translate(-visible.x * scaleX, -visible.y * scaleY);
      this.ctx.scale(scaleX, scaleY);
      this.ctx.drawImage(
        this.backgroundImage,
        this.worldOffsetX,
        this.worldOffsetY,
        this.worldWidth,
        this.worldHeight,
      );
      this.ctx.restore();
    }

    for (const marker of this.markers.values()) {
      this.drawMarker(marker);
    }

    if (this.viewport) {
      const topLeft = this.worldToCanvas(this.viewport.x, this.viewport.y);
      const bottomRight = this.worldToCanvas(
        this.viewport.x + this.viewport.width,
        this.viewport.y + this.viewport.height,
      );
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(
        topLeft.x,
        topLeft.y,
        bottomRight.x - topLeft.x,
        bottomRight.y - topLeft.y,
      );
    }
  }

  private drawMarker(marker: MinimapMarker): void {
    const { x, y } = this.worldToCanvas(marker.worldX, marker.worldY);
    const radius = (marker.radius ?? 3) * this.baseScale;

    this.ctx.fillStyle = marker.color;

    if (marker.shape === 'arrow') {
      const rotation = marker.rotation ?? 0;
      const size = radius * 1.8;
      this.ctx.save();
      this.ctx.translate(x, y);
      this.ctx.rotate(rotation);
      this.ctx.beginPath();
      this.ctx.moveTo(size, 0);
      this.ctx.lineTo(-size * 0.6, size * 0.6);
      this.ctx.lineTo(-size * 0.6, -size * 0.6);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();
      return;
    }

    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }
}
