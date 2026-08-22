import { i18next } from '@volstudio/core';

/** Dinamik katalog anahtarlarını tek i18n sınırında güvenli biçimde çevirir. */
const translate = i18next.t as unknown as (
  key: string,
  options?: Record<string, unknown>,
) => string;

/** i18n metni — çağrı her zaman fonksiyon İÇİNDE (Bozulamaz Kural 2). */
export function t(key: string, options?: Record<string, unknown>): string {
  return translate(`volforge:${key}`, options ?? {});
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
