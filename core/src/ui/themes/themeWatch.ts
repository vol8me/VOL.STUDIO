import type { Disposable } from '../../lifecycle/DisposableScope';

const THEME_ATTR = 'data-vol-theme';

/**
 * Bir elemanın GEÇERLİ kaplamasını izler: en yakın `[data-vol-theme]` sahibi ya da değeri değişince `onChange` çağrılır.
 * CSS dışı çizimler (canvas) için tek yoldur — token'ı çizim anında okurlar, bu yüzden tema değişince kendiliğinden yenilenmezler.
 *
 * - Ata zinciri izlenir: kapsamlı önizleme kökünün değeri, daha yakın bir kök (iç içe önizleme) ya da küresel kök değişebilir;
 *   eleman başka kapsama taşınınca zincir yeniden bağlanır.
 * - Ayrık eleman bağlanana kadar ekleme keşfi çalışır (DOM yeni atayı bildirmez), bağlanınca keşif durur.
 * - Oluşumdan sonraki ilk karede zincir bir kez daha bağlanır ve `onChange` KOŞULSUZ çağrılır: kurucuda henüz belgeye bağlı
 *   olmayan eleman, bağlanınca tema renkleriyle bir kez yeniden çizilir.
 * - `MutationObserver` yoksa (eski motor/test ortamı) yalnız ilk kare yenilemesi çalışır.
 */
export function watchTheme(element: Element, onChange: () => void): Disposable {
  const supported = typeof MutationObserver === 'function';
  let disposed = false;
  let ancestors: Element[] = [];
  let owner: Element | null = null;
  let value: string | null = null;
  let discoveryDocument: Document | null = null;
  let frame = 0;

  const themeObserver = supported ? new MutationObserver(() => bind(true)) : null;
  const mountObserver = supported
    ? new MutationObserver(() => {
        if (element.isConnected) bind(true);
      })
    : null;

  function bind(notify: boolean): void {
    if (disposed) return;
    const ownerDocument = element.ownerDocument;
    if (element.isConnected) {
      mountObserver?.disconnect();
      discoveryDocument = null;
    } else if (discoveryDocument !== ownerDocument) {
      // Ayrık öğenin yeni atasını DOM bildirmez: yalnız bağlanana kadar ekleme keşfi gerekir.
      mountObserver?.disconnect();
      mountObserver?.observe(ownerDocument.documentElement, { childList: true, subtree: true });
      discoveryDocument = ownerDocument;
    }
    const chain: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) chain.push(node);
    // İlk bağlama karesinden önce küresel tema değişimi de kaybolmasın.
    const documentRoot = ownerDocument.documentElement;
    if (!chain.includes(documentRoot)) chain.push(documentRoot);
    if (
      chain.length !== ancestors.length ||
      chain.some((node, index) => node !== ancestors[index])
    ) {
      themeObserver?.disconnect();
      ancestors = chain;
      for (const node of chain) {
        themeObserver?.observe(node, {
          attributes: true,
          attributeFilter: [THEME_ATTR],
          childList: true,
        });
      }
    }
    const nextOwner = element.closest(`[${THEME_ATTR}]`);
    const nextValue = nextOwner?.getAttribute(THEME_ATTR) ?? null;
    if (nextOwner === owner && nextValue === value) return;
    owner = nextOwner;
    value = nextValue;
    if (notify) onChange();
  }

  bind(false);
  frame = requestAnimationFrame(() => {
    frame = 0;
    bind(false);
    if (!disposed) onChange();
  });

  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      themeObserver?.disconnect();
      mountObserver?.disconnect();
      discoveryDocument = null;
      ancestors = [];
      owner = null;
      if (frame) cancelAnimationFrame(frame);
    },
  };
}
