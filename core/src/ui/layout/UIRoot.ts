import '../theme.css';

const ROOT_CLASS = 'vol-ui-root';

/**
 * Canvas/oyun döngüsünden bağımsız tam ekran DOM UI katmanı; menü/HUD
 * component'leri buraya mount edilir. Aynı `parent` için mevcut root element'i
 * yeniden kullanır (ör. bir sahne önce `destroy()` çağırmadan yeniden
 * başlatılırsa).
 */
export class UIRoot {
  readonly element: HTMLDivElement;

  constructor(parent: HTMLElement | string = document.body) {
    const target = typeof parent === 'string' ? document.getElementById(parent) : parent;
    if (!target) {
      throw new Error(
        `UIRoot: parent bulunamadı: ${typeof parent === 'string' ? parent : parent.tagName}`,
      );
    }

    const existing = target.querySelector<HTMLDivElement>(`:scope > .${ROOT_CLASS}`);
    if (existing) {
      this.element = existing;
      return;
    }

    this.element = document.createElement('div');
    this.element.className = ROOT_CLASS;
    target.appendChild(this.element);
  }

  mount(node: HTMLElement): void {
    this.element.appendChild(node);
  }

  unmount(node: HTMLElement): void {
    if (node.parentElement === this.element) {
      node.remove();
    }
  }

  destroy(): void {
    this.element.remove();
  }
}
