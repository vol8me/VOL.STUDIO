export type ScrollDirection = 'vertical' | 'horizontal';

export interface ScrollViewOptions {
  direction?: ScrollDirection;
  /** Sabit yükseklik (dikey) veya genişlik (yatay) piksel. Verilmezse parent'a esner. */
  size?: number;
}

/** Sınırlı, native scroll davranışlı kaydırılabilir içerik alanı; scrollbar'ı temaya göre stiller (WebKit + Firefox scrollbar-* özellikleri). */
export class ScrollView {
  readonly element: HTMLDivElement;
  private readonly content: HTMLDivElement;

  constructor(options: ScrollViewOptions = {}) {
    const { direction = 'vertical', size } = options;

    this.element = document.createElement('div');
    this.element.className = `vol-scroll-view vol-scroll-view--${direction}`;
    // tabindex="0" bu overflow:auto kapsayıcını odaklanabilir/klavye-kaydırılabilir
    // yapar (VirtualList.ts ile aynı düzeltme); olmadan klavye-only kullanıcılar kaydıramaz.
    this.element.tabIndex = 0;
    if (size) {
      if (direction === 'vertical') {
        this.element.style.height = `${size}px`;
      } else {
        this.element.style.width = `${size}px`;
      }
    }

    this.content = document.createElement('div');
    this.content.className = 'vol-scroll-view__content';
    this.element.appendChild(this.content);
  }

  add(node: { element: HTMLElement }): this {
    this.content.appendChild(node.element);
    return this;
  }

  clear(): void {
    this.content.replaceChildren();
  }

  scrollToTop(): void {
    this.element.scrollTo({ top: 0, behavior: 'smooth' });
  }

  scrollToBottom(): void {
    this.element.scrollTo({ top: this.element.scrollHeight, behavior: 'smooth' });
  }

  destroy(): void {
    this.element.remove();
  }
}
