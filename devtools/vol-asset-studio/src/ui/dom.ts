export type Child = Node | string | null | undefined | false;

export interface ElementOptions {
  className?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  children?: Child[];
}

/** Küçük, güvenli DOM kurucusu; HTML string'i yorumlamaz. */
export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (value === true) node.setAttribute(name, '');
    else node.setAttribute(name, String(value));
  }
  append(node, ...(options.children ?? []));
  return node;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

export function replaceChildren(parent: Element, ...children: Child[]): void {
  const fragment = document.createDocumentFragment();
  append(fragment, ...children);
  parent.replaceChildren(fragment);
}

export function formatBytes(bytes: number, locale: string): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: index === 0 ? 0 : 1 }).format(
    value,
  )} ${units[index]}`;
}
