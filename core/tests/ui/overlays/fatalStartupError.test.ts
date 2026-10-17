import { describe, expect, it } from 'vitest';
import { showFatalStartupError } from '../../../src/ui/overlays/FatalStartupError';

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

  it('kaydırılabilir yüzey klavyeyle odaklanabilir; odak yalnız istenince alınır', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const quiet = showFatalStartupError({ title: 'Hata', error: 'x', parent });
    expect(quiet.tabIndex).toBe(0);
    expect(document.activeElement).not.toBe(quiet);

    const focused = showFatalStartupError({ title: 'Hata', error: 'x', parent, autoFocus: true });
    expect(document.activeElement).toBe(focused);
    parent.remove();
  });
});
