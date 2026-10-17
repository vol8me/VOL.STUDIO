type FocusTarget = Element & { focus(options?: FocusOptions): void };

/**
 * Katman dönüşü: async düğmenin `disabled`ı click Promise'i bitince kalkar. Hemen odak verilemiyorsa
 * mikroişlerden sonraki tek karede tekrar denenir; yeni odak/katman, inert veya sökülmüş hedef ezilmez.
 */
export function restoreFocusAfterAction(target: FocusTarget | null | undefined): void {
  if (!target?.isConnected || target.closest('[inert]')) return;
  if (!target.matches(':disabled')) {
    target.focus({ preventScroll: true });
    return;
  }
  const previous = document.activeElement;
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active !== previous && active !== document.body) return;
    if (!target.isConnected || target.matches(':disabled') || target.closest('[inert]')) return;
    target.focus({ preventScroll: true });
  });
}
