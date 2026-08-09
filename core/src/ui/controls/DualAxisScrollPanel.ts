export interface DualAxisScrollPanelOptions {
  /** Görünür alan genişliği/yüksekliği (piksel). Belirtilmezse parent'a esner. */
  width?: number;
  height?: number;
}

/**
 * İki eksende serbestçe kaydırılabilen geniş içerik alanı (envanter
 * ızgarası, harita gibi kullanımlar için). ScrollView'dan farkı: fare
 * sürükleme ve dokunmatik pan'ı birlikte destekler.
 */
export class DualAxisScrollPanel {
  readonly element: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private scrollStartX = 0;
  private scrollStartY = 0;
  private activePointerId: number | null = null;

  constructor(options: DualAxisScrollPanelOptions = {}) {
    const { width, height } = options;

    this.element = document.createElement('div');
    this.element.className = 'vol-dual-scroll';
    if (width) this.element.style.width = `${width}px`;
    if (height) this.element.style.height = `${height}px`;

    this.content = document.createElement('div');
    this.content.className = 'vol-dual-scroll__content';
    this.element.appendChild(this.content);

    this.element.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.element.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.element.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.element.addEventListener('pointercancel', (event) => this.onPointerUp(event));
  }

  add(node: { element: HTMLElement }): this {
    this.content.appendChild(node.element);
    return this;
  }

  clear(): void {
    this.content.replaceChildren();
  }

  setContentSize(width: number, height: number): void {
    this.content.style.width = `${width}px`;
    this.content.style.height = `${height}px`;
  }

  destroy(): void {
    this.element.remove();
  }

  private onPointerDown(event: PointerEvent): void {
    this.isDragging = true;
    this.activePointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.scrollStartX = this.element.scrollLeft;
    this.scrollStartY = this.element.scrollTop;
    this.element.setPointerCapture(event.pointerId);
    this.element.classList.add('vol-dual-scroll--dragging');
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.isDragging || event.pointerId !== this.activePointerId) {
      return;
    }
    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;
    this.element.scrollLeft = this.scrollStartX - dx;
    this.element.scrollTop = this.scrollStartY - dy;
  }

  private onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) {
      return;
    }
    this.isDragging = false;
    this.activePointerId = null;
    this.element.releasePointerCapture(event.pointerId);
    this.element.classList.remove('vol-dual-scroll--dragging');
  }
}
