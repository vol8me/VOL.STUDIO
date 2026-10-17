import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '../../../src/i18n/I18n';
import { getBackHandlerCount } from '../../../src/platform/backNavigation';
import { MODAL_TRANSITION_MS } from '../../../src/ui/overlays/Confirm';
import { showLegalDocument, type Attribution } from '../../../src/ui/overlays/LegalSheet';

const t = (key: string): string => (i18next as unknown as { t(key: string): string }).t(key);

afterEach(() => {
  for (let guard = 0; guard < 20 && getBackHandlerCount() > 0; guard += 1) {
    window.dispatchEvent(new Event('vol:androidback'));
  }
  vi.useRealTimers();
  document.body.innerHTML = '';
  document.body.classList.remove('vol-modal__body-locked');
});

const ATTRIBUTIONS: Attribution[] = [
  {
    name: 'Phosphor Icons',
    version: '2.1.1',
    author: 'Phosphor Icons',
    license: 'MIT',
    source: 'https://github.com/phosphor-icons/core',
  },
  { name: 'Kenney Cursor Pack', license: 'CC0 1.0', note: 'Atıf istenmez; kayıt için yazıldı.' },
];

describe('showLegalDocument', () => {
  it('başlıklı, kaydırılabilir gövdeli sheet açar; bölümler ve atıf listesi yazılır', () => {
    showLegalDocument({
      title: 'Krediler ve lisanslar',
      sections: [
        { heading: 'Telif', paragraphs: ['Telif 2026 vol8me.', 'Apache-2.0 lisanslıdır.'] },
      ],
      attributions: ATTRIBUTIONS,
    });
    const sheet = document.querySelector<HTMLElement>('.vol-legal')!;
    expect(sheet.querySelector('.vol-sheet__title')?.textContent).toBe('Krediler ve lisanslar');
    expect(sheet.querySelector('[role="dialog"]')?.getAttribute('aria-labelledby')).toBe(
      sheet.querySelector('.vol-sheet__title')?.id,
    );
    // Kaydırılabilir gövde klavyeyle odaklanır.
    expect(sheet.querySelector<HTMLElement>('.vol-scroll-view')?.tabIndex).toBe(0);
    expect([...sheet.querySelectorAll('.vol-legal__heading')].map((n) => n.textContent)).toEqual([
      'Telif',
      t('core:dialog.legal.attributions'),
    ]);
    expect([...sheet.querySelectorAll('.vol-legal__paragraph')].map((n) => n.textContent)).toEqual([
      'Telif 2026 vol8me.',
      'Apache-2.0 lisanslıdır.',
    ]);
    const items = [...sheet.querySelectorAll('.vol-legal__attribution')];
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('.vol-legal__name')?.textContent).toBe('Phosphor Icons 2.1.1');
    const fields = [...items[0].querySelectorAll('.vol-legal__field')].map((row) => [
      row.querySelector('dt')?.textContent,
      row.querySelector('dd')?.textContent,
    ]);
    expect(fields).toEqual([
      [t('core:dialog.legal.author'), 'Phosphor Icons'],
      [t('core:dialog.legal.license'), 'MIT'],
      [t('core:dialog.legal.source'), 'https://github.com/phosphor-icons/core'],
    ]);
    expect(items[1].querySelector('.vol-legal__note')?.textContent).toBe(
      'Atıf istenmez; kayıt için yazıldı.',
    );
    // Yazarsız/kaynaksız kayıt boş satır üretmez.
    expect(items[1].querySelectorAll('.vol-legal__field')).toHaveLength(1);
  });

  it('adresler tıklanabilir bağlantı değil seçilebilir metindir; metin HTML olarak yorumlanmaz', () => {
    showLegalDocument({
      title: '<b>Kredi</b>',
      sections: [{ heading: '<i>H</i>', paragraphs: ['<script>alert(1)</script>'] }],
      attributions: [{ name: '<u>Ad</u>', license: 'MIT', source: 'https://example.invalid/x' }],
    });
    const sheet = document.querySelector<HTMLElement>('.vol-legal')!;
    expect(sheet.querySelector('a')).toBeNull();
    expect(sheet.querySelector('script, b, i, u')).toBeNull();
    expect(sheet.querySelector('.vol-sheet__title')?.textContent).toBe('<b>Kredi</b>');
  });

  it('bölüm ve atıf yoksa yalnız başlık ve kapatma vardır', () => {
    showLegalDocument({ title: 'Boş' });
    expect(document.querySelectorAll('.vol-legal__section')).toHaveLength(0);
    expect(document.querySelector('.vol-sheet__close')).not.toBeNull();
  });

  it('kapatma düğmesi, Escape ve Android geri belgeyi kapatır; süre sonunda DOM, kilit ve geri kaydı temizlenir', async () => {
    vi.useFakeTimers();
    const viaButton = showLegalDocument({ title: 'a' });
    expect(getBackHandlerCount()).toBe(1);
    document.querySelector<HTMLButtonElement>('.vol-sheet__close')!.click();
    await expect(viaButton.result).resolves.toBeUndefined();
    expect(getBackHandlerCount()).toBe(0);
    vi.advanceTimersByTime(MODAL_TRANSITION_MS);
    expect(document.querySelector('.vol-legal')).toBeNull();
    expect(document.body.classList.contains('vol-modal__body-locked')).toBe(false);

    const viaEscape = showLegalDocument({ title: 'b' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(viaEscape.result).resolves.toBeUndefined();

    const viaBack = showLegalDocument({ title: 'c' });
    window.dispatchEvent(new Event('vol:androidback'));
    await expect(viaBack.result).resolves.toBeUndefined();

    const viaHandle = showLegalDocument({ title: 'd' });
    viaHandle.close();
    viaHandle.close();
    await expect(viaHandle.result).resolves.toBeUndefined();
    vi.advanceTimersByTime(MODAL_TRANSITION_MS);
    expect(document.querySelector('.vol-legal')).toBeNull();
    expect(getBackHandlerCount()).toBe(0);
  });

  it('sinyal belgeyi kapatır; önceden iptal edilmişse hiç açılmaz', async () => {
    const controller = new AbortController();
    const document1 = showLegalDocument({ title: 'a', signal: controller.signal });
    controller.abort();
    await expect(document1.result).resolves.toBeUndefined();
    expect(getBackHandlerCount()).toBe(0);

    document.body.innerHTML = '';
    const pre = showLegalDocument({ title: 'b', signal: AbortSignal.abort() });
    await expect(pre.result).resolves.toBeUndefined();
    expect(document.querySelector('.vol-legal')).toBeNull();
  });

  it('özel kapatma etiketi ve atıf başlığı kullanılır', () => {
    showLegalDocument({
      title: 'Credits',
      closeLabel: 'Done',
      attributionsTitle: 'Third-party',
      attributions: ATTRIBUTIONS,
    });
    expect(document.querySelector('.vol-sheet__close')?.getAttribute('aria-label')).toBe('Done');
    expect(document.querySelector('.vol-legal__heading')?.textContent).toBe('Third-party');
  });
});
