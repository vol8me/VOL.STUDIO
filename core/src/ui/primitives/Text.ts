export type TextVariant = 'title' | 'heading' | 'body' | 'muted';
export type TextTag = 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'label';

export interface TextOptions {
  variant?: TextVariant;
  tag?: TextTag;
}

export class Text {
  readonly element: HTMLElement;
  private variant: TextVariant;

  constructor(content: string, options: TextOptions = {}) {
    const { variant = 'body', tag = 'p' } = options;

    this.variant = variant;
    this.element = document.createElement(tag);
    this.element.className = `vol-text vol-text--${variant}`;
    this.element.textContent = content;
  }

  setContent(content: string): void {
    this.element.textContent = content;
  }

  setVariant(variant: TextVariant): void {
    this.element.classList.remove(`vol-text--${this.variant}`);
    this.variant = variant;
    this.element.classList.add(`vol-text--${variant}`);
  }

  destroy(): void {
    this.element.remove();
  }
}
