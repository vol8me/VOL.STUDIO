export interface PanelOptions {
  /** Ek class adı; çağıran taraf merkezleme/konumlamayı (ör. CSS inset + transform) bununla ayarlar. */
  className?: string;
}

/** Fade in/out'lu flex-column DOM kapsayıcı. `hide()` sonrası element opacity 0 ile DOM'da kalır, kaldırılmaz. */
export class Panel {
  readonly element: HTMLDivElement;

  constructor(options: PanelOptions = {}) {
    this.element = document.createElement('div');
    this.element.className = ['vol-panel', options.className].filter(Boolean).join(' ');
    this.element.inert = true;
  }

  add(node: { element: HTMLElement }): this {
    this.element.appendChild(node.element);
    return this;
  }

  remove(node: { element: HTMLElement }): this {
    node.element.remove();
    return this;
  }

  show(): void {
    this.element.classList.add('vol-panel--visible');
    this.element.inert = false;
  }

  hide(): void {
    this.element.classList.remove('vol-panel--visible');
    this.element.inert = true;
  }

  isVisible(): boolean {
    return !this.element.inert;
  }

  destroy(): void {
    this.element.remove();
  }
}
