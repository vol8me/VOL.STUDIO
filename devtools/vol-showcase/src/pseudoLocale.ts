import { i18n, i18next } from '@volstudio/core/i18n';

/** Sahte dil kodu (BCP 47 özel kullanım: `qps`). Gerçek çeviri iddiası taşımaz. */
export const PSEUDO_LOCALE = 'qps';

import { pseudoize } from './pseudoize';

function pseudoizeTree<T>(node: T): T {
  if (typeof node === 'string') return pseudoize(node) as T;
  if (Array.isArray(node)) return (node as unknown[]).map((item) => pseudoizeTree(item)) as T;
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([key, value]) => [
        key,
        pseudoizeTree(value),
      ]),
    ) as T;
  }
  return node;
}

/** `?dir=rtl`: belge yönünü sağdan sola çevirir (mantıksal CSS sınaması; gerçek bir RTL çevirisi iddiası taşımaz). */
export function applyDirectionFromUrl(search = window.location.search): void {
  if (new URLSearchParams(search).get('dir') === 'rtl') document.documentElement.dir = 'rtl';
}

/** `?lang=pseudo` ile açıldıysa İngilizce kaynaklardan sahte dili kurar ve ona geçer. */
export async function applyPseudoLocaleFromUrl(search = window.location.search): Promise<boolean> {
  if (new URLSearchParams(search).get('lang') !== 'pseudo') return false;
  for (const ns of ['core', 'volui']) {
    const source = i18next.getResourceBundle('en', ns) as Record<string, unknown> | undefined;
    if (source) i18next.addResourceBundle(PSEUDO_LOCALE, ns, pseudoizeTree(source), true, true);
  }
  await i18n.changeLanguage(PSEUDO_LOCALE);
  return true;
}
