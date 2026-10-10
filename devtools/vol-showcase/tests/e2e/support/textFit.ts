import type { Page } from '@playwright/test';

/**
 * Metin sığma taraması (UI-07.2/07.3): her sekmede metin taşıyan öğenin içeriği kendi kutusuna sığmalı ya da
 * kaydırılabilir olmalıdır; kırpılma (overflow gizli + scrollWidth > clientWidth) ve kutudan/sayfadan taşma bulgudur.
 * Sahte dil (`pseudoLocale.spec.ts`) ve yedek yazı tipi (`fontLoad.spec.ts`) taramaları aynı ölçüyü kullanır.
 */
export interface Finding {
  tab: string;
  viewport: string;
  selector: string;
  text: string;
  kind: 'clipped' | 'spill' | 'page-overflow';
}

export async function scan(
  page: Page,
  tab: string,
  viewport: string,
  rootSelector?: string,
): Promise<Finding[]> {
  return page.evaluate(
    ([tabId, vp, root]) => {
      const panel = document.querySelector<HTMLElement>(
        root || `[role="tabpanel"][id$="-panel-${tabId}"]:not([aria-hidden="true"])`,
      );
      const out: Finding[] = [];
      if (!panel) return out;
      const label = (el: Element): string => {
        const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : '';
        const cls = [...el.classList].slice(0, 2).join('.');
        return `${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ''}`;
      };
      for (const el of panel.querySelectorAll<HTMLElement>('*')) {
        const text = (
          el.childNodes.length === 1 && el.firstChild?.nodeType === 3 ? el.textContent : ''
        )?.trim();
        if (!text) continue;
        const style = getComputedStyle(el);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          el.classList.contains('vol-sr-only')
        )
          continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const hidesOverflow = ['hidden', 'clip'].includes(style.overflowX);
        // Üç nokta bilinçli kısaltmadır, tam metin `title` ile kurtarılabilirse kabul edilir.
        const recoverable = style.textOverflow === 'ellipsis' && Boolean(el.closest('[title]'));
        if (hidesOverflow && !recoverable && el.scrollWidth > el.clientWidth + 1) {
          out.push({
            tab: tabId,
            viewport: vp,
            selector: label(el),
            text: text.slice(0, 40),
            kind: 'clipped',
          });
        }
      }
      // Metin kutusu en yakın kutulu atasının dışına taşıyorsa (kenarlık/arka plan dışında okunur) taşmadır.
      for (const el of panel.querySelectorAll<HTMLElement>('*')) {
        const text = (
          el.childNodes.length === 1 && el.firstChild?.nodeType === 3 ? el.textContent : ''
        )?.trim();
        if (!text || el.classList.contains('vol-sr-only')) continue;
        // Çalışan animasyon (pop/shake) ölçeği geçici olarak büyütür; yerleşim değil animasyon durumudur.
        if (getComputedStyle(el).animationName !== 'none') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        let box: HTMLElement | null = el.parentElement;
        while (box && box !== panel && getComputedStyle(box).display === 'inline')
          box = box.parentElement;
        if (!box || box === panel) continue;
        const boxRect = box.getBoundingClientRect();
        if (
          boxRect.width === 0 ||
          ['hidden', 'clip', 'auto', 'scroll'].includes(getComputedStyle(box).overflowX)
        )
          continue;
        if (rect.right > boxRect.right + 1.5 || rect.left < boxRect.left - 1.5) {
          out.push({
            tab: tabId,
            viewport: vp,
            selector: `${label(el)} in ${label(box)} [${Math.round(rect.left)}-${Math.round(rect.right)} vs ${Math.round(boxRect.left)}-${Math.round(boxRect.right)}]`,
            text: text.slice(0, 40),
            kind: 'spill',
          });
        }
      }
      const doc = document.documentElement;
      if (doc.scrollWidth > doc.clientWidth + 1) {
        out.push({
          tab: tabId,
          viewport: vp,
          selector: 'document',
          text: '',
          kind: 'page-overflow',
        });
      }
      return out;
    },
    [tab, viewport, rootSelector ?? ''] as const,
  );
}
