import { afterEach, describe, expect, it } from 'vitest';
import { i18next } from '@volstudio/core/i18n';
import { ClimateStatus } from '@/hud/ClimateStatus';

afterEach(async () => {
  await i18next.changeLanguage('tr');
});

describe('ClimateStatus', () => {
  it('mevsim ve hava ayrı görünür; yağış değişince mevsim aynı kalır', () => {
    const status = new ClimateStatus();
    status.update({ season: 'spring', kind: 'rain' });
    expect(status.element.textContent).toBe('İlkbahar · Yağmur');
    status.update({ season: 'spring', kind: 'clear' });
    expect(status.element.textContent).toBe('İlkbahar · Açık');
    status.update(undefined);
    expect(status.element.hidden).toBe(true);
    status.destroy();
  });

  it('dil değişikliği mevcut hava kaydını yeniler ve söküm güvenlidir', async () => {
    const status = new ClimateStatus();
    status.update({ season: 'winter', kind: 'snow' });
    document.body.append(status.element);
    await i18next.changeLanguage('en');
    status.refreshLabels();
    expect(status.element.textContent).toBe('Winter · Snow');
    status.destroy();
    expect(status.element.isConnected).toBe(false);
  });
});
