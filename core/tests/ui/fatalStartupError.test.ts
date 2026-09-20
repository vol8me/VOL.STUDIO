import { describe, expect, it } from 'vitest';
import { showFatalStartupError } from '../../src/ui/overlays/FatalStartupError';

describe('showFatalStartupError', () => {
  it('başlık ve hata ayrıntısını erişilebilir yüzeye yazar', () => {
    const parent = document.createElement('section');
    const overlay = showFatalStartupError({
      title: 'Başlatılamadı',
      error: new Error('WebGL yok'),
      parent,
      className: 'product-fatal',
    });

    expect(parent.firstElementChild).toBe(overlay);
    expect(overlay.getAttribute('role')).toBe('alert');
    expect(overlay.classList.contains('product-fatal')).toBe(true);
    expect(overlay.querySelector('h1')?.textContent).toBe('Başlatılamadı');
    expect(overlay.querySelector('p')?.textContent).toBe('WebGL yok');
  });

  it('Error olmayan ayrıntıyı güvenli biçimde metne çevirir', () => {
    const parent = document.createElement('div');
    const overlay = showFatalStartupError({ title: 'Hata', error: 42, parent });
    expect(overlay.querySelector('p')?.textContent).toBe('42');
  });
});
