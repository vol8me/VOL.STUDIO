import { i18next } from '@volstudio/core';

/**
 * i18next'in anahtarları LİTERAL tiplidir; editörün anahtarlarının bir kısmı
 * ise şemadan türer (`param.<kind>.<name>`) ve derleme anında bilinemez. Tek
 * bir sınır dönüşümü, çağrı yerlerine yayılmış onlarca dönüşümden iyidir.
 */
const translate = i18next.t as unknown as (
  key: string,
  options?: Record<string, unknown>,
) => string;

/** i18n metni — çağrı her zaman fonksiyon İÇİNDE (Bozulamaz Kural 2). */
export function t(key: string, options?: Record<string, unknown>): string {
  return translate(`volforge:${key}`, options ?? {});
}

/**
 * Şema metinlerinin i18n anahtarı.
 *
 * i18next `.` karakterini iç içe geçme ayracı olarak kullandığı için tür adı
 * (`sdf.circle`) doğrudan anahtar olamaz; üreteç de aynı dönüşümü uygular
 * (`core/scripts/gen-param-i18n.ts`).
 */
export function nodeDescription(kind: string): string {
  return t(`node.${kind.replace(/\./g, '_')}.description`);
}

export function paramLabel(kind: string, param: string): string {
  return t(`node.${kind.replace(/\./g, '_')}.params.${param}`);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Başlıklı bölüm — sol ve sağ sütunun ortak kabuğu. */
export function section(titleText: string): { element: HTMLDivElement; body: HTMLDivElement } {
  const element = el('div', 'vf-section');
  element.appendChild(el('div', 'vf-section__title', titleText));
  const body = el('div', 'vf-section__body');
  element.appendChild(body);
  return { element, body };
}

export function row(...children: (HTMLElement | null)[]): HTMLDivElement {
  const element = el('div', 'vf-row');
  for (const child of children) if (child) element.appendChild(child);
  return element;
}

export interface Disposable {
  destroy(): void;
}

/**
 * Bir kabın içeriğini tamamen yenileyen paneller için ortak temizlik.
 *
 * `DisposableScope` bir ÖMÜR yönetir; buradaki ihtiyaç ise aynı panelin
 * içeriğinin defalarca yeniden kurulmasıdır. Bileşenler her yeniden kuruşta
 * bırakılmazsa dinleyicileri DOM'dan koptukları hâlde yaşamaya devam eder.
 */
export class ChildScope {
  private children: Disposable[] = [];

  add<T extends Disposable>(child: T): T {
    this.children.push(child);
    return child;
  }

  clear(): void {
    for (let i = this.children.length - 1; i >= 0; i--) {
      this.children[i].destroy();
    }
    this.children = [];
  }
}
