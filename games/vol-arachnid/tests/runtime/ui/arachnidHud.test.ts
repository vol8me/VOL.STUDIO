import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { i18n, i18next } from '@volstudio/core';
import tr from '@/i18n/tr.json';
import en from '@/i18n/en.json';
import '@/i18next-augment';
import { ArachnidHud } from '@/runtime/ui/ArachnidHud';

describe('ArachnidHud', () => {
  let parent: HTMLDivElement;
  let hud: ArachnidHud | null;

  beforeAll(async () => {
    i18n.addResources('tr', 'arachnid', tr);
    i18n.addResources('en', 'arachnid', en);
    await i18n.init();
  });

  beforeEach(async () => {
    await i18next.changeLanguage('tr');
    parent = document.createElement('div');
    document.body.appendChild(parent);
    hud = new ArachnidHud(parent);
  });

  afterEach(() => {
    hud?.destroy();
    hud = null;
    document.body.replaceChildren();
  });

  it('CORE UI köküne yerleşir ve ilk durumu Türkçe gösterir', () => {
    const root = parent.querySelector('.vol-ui-root > .vol-arachnid-hud');

    expect(root).not.toBeNull();
    expect(root?.getAttribute('aria-label')).toBe('Hareket göstergeleri');
    expect(root?.textContent).toContain('Atılma · Hazır');
    expect(root?.textContent).toContain('Hız 0 px/sn');
    expect(root?.textContent).toContain('Durum: Beklemede');
  });

  it('dash, yuvarlanmış hız ve hareket durumunu tazeler', () => {
    hud?.refresh({ dashProgress: 0.42, speedPxPerSec: 123, isDashing: false });

    const root = parent.querySelector('.vol-arachnid-hud');
    expect(root?.querySelector('.vol-bar')?.getAttribute('aria-valuenow')).toBe('42');
    expect(root?.textContent).toContain('Atılma · %42');
    expect(root?.textContent).toContain('Hız 125 px/sn');
    expect(root?.textContent).toContain('Durum: Yürüyor');
    expect(root?.classList.contains('vol-arachnid-hud--dash-ready')).toBe(false);
  });

  it('dash sürerken durum ve vurgu sınıfını değiştirir', () => {
    hud?.refresh({ dashProgress: 0, speedPxPerSec: 680, isDashing: true });

    const root = parent.querySelector('.vol-arachnid-hud');
    expect(root?.textContent).toContain('Durum: Atılıyor');
    expect(root?.classList.contains('vol-arachnid-hud--dashing')).toBe(true);
  });

  it('dil değişiminde mevcut sayısal durumu koruyup etiketleri yeniler', async () => {
    hud?.refresh({ dashProgress: 0.6, speedPxPerSec: 151, isDashing: false });

    await i18next.changeLanguage('en');

    const root = parent.querySelector('.vol-arachnid-hud');
    expect(root?.getAttribute('aria-label')).toBe('Movement indicators');
    expect(root?.textContent).toContain('Dash · 60%');
    expect(root?.textContent).toContain('Speed 150 px/s');
    expect(root?.textContent).toContain('Status: Walking');
  });

  it('geçersiz akış değerlerini güvenli sınırlara düşürür', () => {
    hud?.refresh({
      dashProgress: Number.NaN,
      speedPxPerSec: Number.POSITIVE_INFINITY,
      isDashing: false,
    });

    const root = parent.querySelector('.vol-arachnid-hud');
    expect(root?.querySelector('.vol-bar')?.getAttribute('aria-valuenow')).toBe('0');
    expect(root?.textContent).toContain('Hız 0 px/sn');
    expect(root?.textContent).toContain('Durum: Beklemede');
  });

  it('destroy kendi DOM yüzeyini toplar ve ikinci çağrıda güvenlidir', () => {
    hud?.destroy();
    hud?.destroy();

    expect(parent.querySelector('.vol-arachnid-hud')).toBeNull();
    expect(parent.querySelector('.vol-ui-root')).toBeNull();
  });
});
