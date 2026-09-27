/**
 * Odaklanabilir eleman sözleşmesi.
 *
 * Seçici `Modal`'ın focus-trap listesiyle AYNI'dır — iki ayrı tablo
 * tutulursa klavye tuzağının kapsadığı bir elemanı kol gezinmesi atlar ya
 * da tersi yaşanır; tek kaynak ikisini hizalı tutar.
 */
export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Açık bir modal diyalogun görünür ve inert-olmayan hâli. */
const DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]';

function isNavigable(element: HTMLElement): boolean {
  // `inert` bir atasoyda bulunan eleman odak ve olay alamaz — kapalı
  // modal/sheet'lerin içeriği bu yüzden yarış dışıdır.
  if (element.closest('[inert]')) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Şu an gezinilebilir odak adayları, DOM sırasıyla.
 *
 * En üstte AÇIK bir modal diyalog varsa adaylar onun alt ağacıyla
 * sınırlanır — kol ile gezinme klavye focus-trap ile aynı sınırı
 * paylaşır (`Sheet`/`Modal`/`Confirm` hep `role="dialog"` işaretler).
 */
export function listFocusable(root: ParentNode = document): HTMLElement[] {
  const scopeRoot = root instanceof Document ? root : document;
  const dialogs = Array.from(scopeRoot.querySelectorAll<HTMLElement>(DIALOG_SELECTOR)).filter(
    (dialog) => !dialog.closest('[inert]') && dialog.getBoundingClientRect().width > 0,
  );
  const scope: ParentNode = dialogs.length > 0 ? dialogs[dialogs.length - 1] : root;
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isNavigable);
}
