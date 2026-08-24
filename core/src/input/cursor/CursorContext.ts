import type { CursorId, CursorTheme } from './types';
import { DomCursorRenderer } from './DomCursorRenderer';

/** Bir DOM elementinden cursor kimliği çözümleyen fonksiyon. */
export type DomCursorResolver = (target: Element | null) => CursorId | undefined;

/**
 * Bir elementin cursor bağlamına göre uygun cursor kimliğini döner.
 *
 * - `data-cursor` özniteliği varsa o değeri kullanır.
 * - `disabled` veya `aria-disabled="true"` ise `not-allowed`.
 * - Metin girişleri (`input`, `textarea`, `contenteditable`) için `text`.
 * - Tıklanabilir elementler (`a`, `button`, `[role=button]`) için `pointer`.
 * - `data-cursor-danger` veya `data-cursor="not-allowed"` varsa `not-allowed`.
 */
export function defaultDomCursorResolver(target: Element | null): CursorId | undefined {
  if (!target) return undefined;

  const explicit = target.getAttribute('data-cursor');
  if (explicit) return explicit as CursorId;

  if (
    (target as HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)
      .disabled ||
    target.getAttribute('aria-disabled') === 'true'
  ) {
    return 'not-allowed';
  }

  if (target.hasAttribute('data-cursor-danger')) {
    return 'not-allowed';
  }

  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
    const input = target as HTMLInputElement;
    if (
      target.tagName === 'TEXTAREA' ||
      ['text', 'search', 'url', 'email', 'password', 'number', 'tel'].includes(input.type)
    ) {
      return 'text';
    }
  }

  if (target.getAttribute('contenteditable') === 'true') {
    return 'text';
  }

  if (
    target.tagName === 'BUTTON' ||
    target.tagName === 'A' ||
    target.getAttribute('role') === 'button' ||
    target.getAttribute('role') === 'link' ||
    target.getAttribute('onclick') !== null
  ) {
    return 'pointer';
  }

  return undefined;
}

export interface DomCursorContextOptions {
  resolver?: DomCursorResolver;
  size?: number;
  /** Yerel imleci gizle (root `cursor: none`). */
  hideNativeCursor?: boolean;
  /** İşlem yapılmayan elementler için varsayılan cursor kimliği. */
  defaultCursor?: CursorId;
}

/**
 * DOM içinde cursor bağlamını akıllıca yönetir.
 *
 * `pointerover`/`pointerout` olaylarını dinler, hedef elemente göre uygun
 * cursor kimliğini `DomCursorRenderer` üzerinden gösterir. Metin alanları,
 * tıklama alanları ve tehlikeli işlemler için hazır eşleme içerir.
 */
export class DomCursorContext {
  readonly root: HTMLElement;
  readonly renderer: DomCursorRenderer;
  readonly resolver: DomCursorResolver;
  private readonly previousRootCursor: string;
  private readonly boundPointerOver: (event: PointerEvent) => void;
  private readonly boundPointerOut: (event: PointerEvent) => void;

  constructor(root: HTMLElement, theme: CursorTheme, options: DomCursorContextOptions = {}) {
    this.root = root;
    this.renderer = new DomCursorRenderer(root, theme);
    this.resolver = options.resolver ?? defaultDomCursorResolver;

    if (options.size) {
      this.renderer.setSize(options.size);
    }

    this.previousRootCursor = root.style.cursor;
    if (options.hideNativeCursor !== false) {
      root.style.cursor = 'none';
    }

    this.boundPointerOver = this.onPointerOver.bind(this);
    this.boundPointerOut = this.onPointerOut.bind(this);

    this.root.addEventListener('pointerover', this.boundPointerOver, true);
    this.root.addEventListener('pointerout', this.boundPointerOut, true);

    const initial = options.defaultCursor ?? 'default';
    this.renderer.set(initial);
  }

  set(id: CursorId): void {
    this.renderer.set(id);
  }

  reset(): void {
    this.renderer.reset();
  }

  destroy(): void {
    this.root.removeEventListener('pointerover', this.boundPointerOver, true);
    this.root.removeEventListener('pointerout', this.boundPointerOut, true);
    this.root.style.cursor = this.previousRootCursor;
    this.renderer.destroy();
  }

  private onPointerOver(event: PointerEvent): void {
    const id = this.resolver(event.target as Element | null);
    if (id) {
      this.renderer.set(id);
    } else {
      this.renderer.reset();
    }
  }

  private onPointerOut(event: PointerEvent): void {
    const related = event.relatedTarget as Element | null;
    const id = this.resolver(related);
    if (id) {
      this.renderer.set(id);
    } else {
      this.renderer.reset();
    }
  }
}
