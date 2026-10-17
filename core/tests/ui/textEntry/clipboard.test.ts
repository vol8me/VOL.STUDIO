import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebClipboardAdapter } from '../../../src/ui/textEntry/clipboard';

/**
 * Bağdaştırıcı asla fırlatmaz; izin reddi / yetenek yokluğu / hata sonuç nesnesidir ve pano içeriği hiçbir yere
 * (konsol dahil) yazılmaz.
 */
const SECRET = 'gizli-pano-icerigi-7731';

function domError(name: string): DOMException {
  return new DOMException('x', name);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('createWebClipboardAdapter', () => {
  it('okuma ve yazma başarısı metni döndürür / yazar', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const adapter = createWebClipboardAdapter({
      readText: vi.fn().mockResolvedValue('merhaba'),
      writeText,
    });
    expect(adapter.canRead).toBe(true);
    expect(adapter.canWrite).toBe(true);
    await expect(adapter.readText()).resolves.toEqual({ ok: true, text: 'merhaba' });
    await expect(adapter.writeText('abc')).resolves.toEqual({ ok: true });
    expect(writeText).toHaveBeenCalledWith('abc');
  });

  it('izin reddi `denied` olur, fırlatmaz ve yazmada yedeğe düşmez', async () => {
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    const adapter = createWebClipboardAdapter({
      readText: vi.fn().mockRejectedValue(domError('NotAllowedError')),
      writeText: vi.fn().mockRejectedValue(domError('NotAllowedError')),
    });
    await expect(adapter.readText()).resolves.toEqual({ ok: false, reason: 'denied' });
    await expect(adapter.writeText(SECRET)).resolves.toEqual({ ok: false, reason: 'denied' });
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('panosu olmayan bağlamda okuma `unavailable`, yazma eski yola düşer', async () => {
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    const adapter = createWebClipboardAdapter(undefined);
    expect(adapter.canRead).toBe(false);
    expect(adapter.canWrite).toBe(true);
    await expect(adapter.readText()).resolves.toEqual({ ok: false, reason: 'unavailable' });
    await expect(adapter.writeText('abc')).resolves.toEqual({ ok: true });
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('.vol-edit-menu-holder')).toBeNull();
  });

  it('eski yol başarısızsa `failed` olur ve odağı önceki öğeye geri verir', async () => {
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const adapter = createWebClipboardAdapter(undefined);
    await expect(adapter.writeText('abc')).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(document.activeElement).toBe(input);
  });

  it('beklenmeyen okuma hatası `failed` olur', async () => {
    const adapter = createWebClipboardAdapter({
      readText: vi.fn().mockRejectedValue(new Error('boom')),
      writeText: vi.fn(),
    });
    await expect(adapter.readText()).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('pano içeriği konsola yazılmaz', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    const adapter = createWebClipboardAdapter({
      readText: vi.fn().mockResolvedValue(SECRET),
      writeText: vi.fn().mockRejectedValue(domError('NotAllowedError')),
    });
    await adapter.readText();
    await adapter.writeText(SECRET);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
