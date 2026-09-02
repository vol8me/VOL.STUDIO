import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n, i18next } from '@volstudio/core';
import { arenaConfig } from '@/config/arena';
import tr from '@/i18n/tr.json';
import en from '@/i18n/en.json';
import '@/i18next-augment';
import { ArachnidHud } from '@/runtime/ui/ArachnidHud';

describe('ArachnidHud', () => {
  let parent: HTMLDivElement;
  let hud: ArachnidHud | null;
  let onToggleFullscreen: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    i18n.addResources('tr', 'arachnid', tr);
    i18n.addResources('en', 'arachnid', en);
    await i18n.init();
  });

  beforeEach(async () => {
    await i18next.changeLanguage('tr');
    parent = document.createElement('div');
    document.body.appendChild(parent);
    onToggleFullscreen = vi.fn();
    hud = new ArachnidHud(parent, { onToggleFullscreen });
  });

  afterEach(() => {
    hud?.destroy();
    hud = null;
    document.body.replaceChildren();
  });

  const root = () => parent.querySelector<HTMLElement>('.vol-arachnid-hud');

  it('CORE UI köküne yerleşir, başlığı ve dikey barı kurar', () => {
    const element = parent.querySelector<HTMLElement>('.vol-ui-root > .vol-arachnid-hud');

    expect(element).not.toBeNull();
    expect(element?.getAttribute('aria-label')).toBe('Hareket göstergeleri');
    expect(element?.querySelector('.vol-arachnid-hud__title')?.textContent).toBe('VOL.ARACHNID');

    const bar = element?.querySelector('.vol-bar');
    expect(bar?.classList.contains('vol-bar--vertical')).toBe(true);
    expect(bar?.getAttribute('aria-orientation')).toBe('vertical');
    expect(bar?.getAttribute('aria-label')).toBe('Atılma hazırlığı');
    // Bar ETİKETSİZDİR: gösterge metinle değil renkle ve dolulukla okunur.
    expect(bar?.querySelector('.vol-bar__label')).toBeNull();
  });

  it('sayısal telemetriye adlandırılabilir bir rol verir', () => {
    const telemetry = root()?.querySelector('.vol-arachnid-hud__telemetry');

    expect(telemetry?.getAttribute('role')).toBe('group');
    expect(telemetry?.getAttribute('aria-label')).toBe('Gövde hızı');
  });

  it('dokunmatik yerleşimde hızı sağ-alt atılım düğmesinden uzak tutar', () => {
    hud?.destroy();
    hud = new ArachnidHud(parent, {
      onToggleFullscreen,
      showFullscreenToggle: false,
    });

    expect(root()?.classList.contains('vol-arachnid-hud--touch-layout')).toBe(true);
    expect(root()?.querySelector('.vol-arachnid-hud__fullscreen')).toBeNull();
    expect(root()?.querySelector('.vol-arachnid-hud__telemetry')).not.toBeNull();
  });

  it('kamera boşluklarını CSS değişkeni olarak yayımlar', () => {
    const element = root();

    expect(element?.style.getPropertyValue('--vol-arachnid-gutter-left')).toBe(
      `${arenaConfig.viewportGutterPx.left}px`,
    );
    expect(element?.style.getPropertyValue('--vol-arachnid-gutter-top')).toBe(
      `${arenaConfig.viewportGutterPx.top}px`,
    );
    expect(element?.style.getPropertyValue('--vol-arachnid-gutter-bottom')).toBe(
      `${arenaConfig.viewportGutterPx.bottom}px`,
    );
  });

  it('dash oranını ve yuvarlanmış hızı tazeler', () => {
    hud?.refresh({ dashProgress: 0.42, speedPxPerSec: 123, isDashing: false });

    expect(root()?.querySelector('.vol-bar')?.getAttribute('aria-valuenow')).toBe('42');
    expect(root()?.querySelector('.vol-arachnid-hud__speed')?.textContent).toBe('125 px/sn');
    expect(root()?.classList.contains('vol-arachnid-hud--dash-ready')).toBe(false);
    expect(root()?.classList.contains('vol-arachnid-hud--moving')).toBe(true);
  });

  it('dash sürerken vurgu sınıfını değiştirir', () => {
    hud?.refresh({ dashProgress: 0, speedPxPerSec: 680, isDashing: true });

    expect(root()?.classList.contains('vol-arachnid-hud--dashing')).toBe(true);
    expect(root()?.classList.contains('vol-arachnid-hud--moving')).toBe(false);
  });

  it('tam ekran butonu niyeti bildirir, pencereye kendi dokunmaz', () => {
    const button = root()?.querySelector<HTMLButtonElement>('.vol-arachnid-hud__fullscreen');

    expect(button?.getAttribute('aria-label')).toBe('Tam ekrana geç');
    button?.click();
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);

    hud?.setFullscreenActive(true);
    expect(button?.getAttribute('aria-label')).toBe('Tam ekrandan çık');
  });

  it('dil değişiminde sayısal durumu koruyup etiketleri yeniler', async () => {
    hud?.refresh({ dashProgress: 0.6, speedPxPerSec: 151, isDashing: false });

    await i18next.changeLanguage('en');

    expect(root()?.getAttribute('aria-label')).toBe('Movement indicators');
    expect(root()?.querySelector('.vol-arachnid-hud__speed')?.textContent).toBe('150 px/s');
    expect(root()?.querySelector('.vol-arachnid-hud__fullscreen')?.getAttribute('aria-label')).toBe(
      'Enter fullscreen',
    );
  });

  it('geçersiz akış değerlerini güvenli sınırlara düşürür', () => {
    hud?.refresh({
      dashProgress: Number.NaN,
      speedPxPerSec: Number.POSITIVE_INFINITY,
      isDashing: false,
    });

    expect(root()?.querySelector('.vol-bar')?.getAttribute('aria-valuenow')).toBe('0');
    expect(root()?.querySelector('.vol-arachnid-hud__speed')?.textContent).toBe('0 px/sn');
  });

  it('destroy kendi DOM yüzeyini toplar ve ikinci çağrıda güvenlidir', () => {
    hud?.destroy();
    hud?.destroy();

    expect(parent.querySelector('.vol-arachnid-hud')).toBeNull();
    expect(parent.querySelector('.vol-ui-root')).toBeNull();
  });
});
