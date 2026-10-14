import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n, i18next } from '@volstudio/core/i18n';
import { applyLanguage } from '@/app/language';

afterEach(async () => {
  vi.restoreAllMocks();
  await i18next.changeLanguage('tr');
});

describe('applyLanguage', () => {
  it('seçili dili uygular; otomatik cihaz dilini izler', async () => {
    await applyLanguage('en');
    expect(i18next.language).toBe('en');
    const detect = vi.spyOn(i18n, 'detectLocale').mockReturnValue('tr');
    await applyLanguage('auto');
    expect(i18next.language).toBe('tr');
    detect.mockRestore();
  });
});
