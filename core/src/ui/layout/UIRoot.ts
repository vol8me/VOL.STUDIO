import '../theme.css';

const ROOT_CLASS = 'vol-ui-root';
/** Ayni DOM element'ini paylasan UIRoot ornek sayisi (dataset uzerinde tutulur). */
const REF_COUNT_ATTR = 'volUiRootRefs';

/**
 * Canvas/oyun döngüsünden bağımsız tam ekran DOM UI katmanı; menü/HUD
 * component'leri buraya mount edilir. Aynı `parent` için mevcut root element'i
 * yeniden kullanır (ör. bir sahne önce `destroy()` çağırmadan yeniden
 * başlatılırsa).
 */
export class UIRoot {
  readonly element: HTMLDivElement;
  private released = false;

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
      this.retain();
      return;
    }

    this.element = document.createElement('div');
    this.element.className = ROOT_CLASS;
    target.appendChild(this.element);
    this.retain();
  }

  private retain(): void {
    const current = Number(this.element.dataset[REF_COUNT_ATTR] ?? '0');
    this.element.dataset[REF_COUNT_ATTR] = String(current + 1);
  }

  mount(node: HTMLElement): void {
    this.element.appendChild(node);
  }

  unmount(node: HTMLElement): void {
    if (node.parentElement === this.element) {
      node.remove();
    }
  }

  /**
   * Element paylasildigi icin (ayni parent'ta ikinci bir UIRoot mevcut olani
   * yeniden kullanir) kosulsuz remove() digerinin altindaki zemini de silerdi.
   * Yalnizca son sahip DOM'dan kaldirir.
   */
  destroy(): void {
    if (this.released) return;
    this.released = true;

    const remaining = Number(this.element.dataset[REF_COUNT_ATTR] ?? '1') - 1;
    if (remaining > 0) {
      this.element.dataset[REF_COUNT_ATTR] = String(remaining);
      return;
    }

    delete this.element.dataset[REF_COUNT_ATTR];
    this.element.remove();
  }
}
