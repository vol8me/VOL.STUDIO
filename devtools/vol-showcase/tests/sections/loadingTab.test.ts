import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n, i18next } from '@volstudio/core/i18n';
import enResources from '../../src/i18n/en.json';
import trResources from '../../src/i18n/tr.json';
import { buildLoadingTab } from '../../src/sections/loadingTab';

/**
 * Yükleme sekmesindeki örnekler gerçek bileşen akışlarıdır (aşama/ipucu/takılma, hata + yeniden deneme,
 * gösterge türü seçici). Burada sürücüleri uçtan uca zamanlayıcıyla sınanır.
 */
beforeAll(async () => {
  i18n.addResources('tr', 'volui', trResources);
  i18n.addResources('en', 'volui', enResources);
  await i18n.init();
  await i18next.changeLanguage('en');
}, 60_000);

let tab: ReturnType<typeof buildLoadingTab>;
beforeEach(() => {
  vi.useFakeTimers();
  tab = buildLoadingTab();
  document.body.appendChild(tab.element);
});
afterEach(() => {
  tab.destroy();
  document.body.replaceChildren();
  vi.useRealTimers();
});

const button = (name: RegExp): HTMLButtonElement =>
  [...tab.element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    name.test(b.textContent ?? ''),
  )!;

describe('Loading sekmesi örnekleri', () => {
  it('hata kartı: ilerleme durur, alert çıkar; Tekrar dene tamamlatır', () => {
    button(/simulate failed loading/i).click();
    vi.advanceTimersByTime(1500);
    const alert = document.querySelector('.vol-loading [role="alert"]');
    expect(alert).not.toBeNull();
    const [retry, cancel] = [...alert!.querySelectorAll<HTMLButtonElement>('button')];
    expect(cancel).toBeDefined();
    retry.click();
    expect(document.querySelector('.vol-loading [role="alert"]')).toBeNull();
    vi.advanceTimersByTime(8000);
    expect(document.querySelector('.vol-loading')).toBeNull();
  });

  it('hata kartı: Vazgeç ekranı kapatır', () => {
    button(/simulate failed loading/i).click();
    vi.advanceTimersByTime(1500);
    const cancel = document.querySelectorAll<HTMLButtonElement>(
      '.vol-loading .vol-loading__failure button',
    )[1];
    cancel.click();
    vi.advanceTimersByTime(8000);
    expect(document.querySelector('.vol-loading')).toBeNull();
  });

  it('aşama kartı: aşama metinleri sırayla gelir, 60 %te takılma bildirilir ve akış kapanır', () => {
    button(/preview full flow/i).click();
    vi.advanceTimersByTime(300); // gecikmeli gösterim dolar
    const stage = (): string => document.querySelector('.vol-loading__stage')?.textContent ?? '';
    expect(stage()).toMatch(/1 \/ 4/);
    vi.advanceTimersByTime(250 * 3);
    expect(stage()).toMatch(/2 \/ 4|3 \/ 4/);
    vi.advanceTimersByTime(250 * 3 + 1900); // 60 %e varıp 1,8 sn ilerleme olmayınca
    expect((document.querySelector('.vol-loading__stall') as HTMLElement).hidden).toBe(false);
    vi.advanceTimersByTime(20_000);
    expect(document.querySelector('.vol-loading')).toBeNull();
  });

  it('gösterge türü seçici sırayla dönüp önizleme başlatır; yenisi öncekini çıkarır', () => {
    const cycle = tab.element.querySelector<HTMLButtonElement>('.vol-showcase-panel-demo button')!;
    const label = cycle.textContent;
    cycle.click();
    expect(cycle.textContent).not.toBe(label);
    button(/full screen preview/i).click();
    expect(document.querySelectorAll('.vol-loading')).toHaveLength(1);
    button(/titled loading/i).click();
    expect(document.querySelectorAll('.vol-loading')).toHaveLength(1);
  });
});
