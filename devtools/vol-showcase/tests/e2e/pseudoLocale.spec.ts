import { settleTransitions } from './support/settle';
import { expect, test } from '@playwright/test';
import { pseudoize } from '../../src/pseudoize';
import { SHOWCASE_TABS, selectTab } from './support/determinism';
import { scan, type Finding } from './support/textFit';

/**
 * Uzatılmış metin taraması (UI-07.2): `?lang=pseudo` deterministik %30 uzun sahte dili açar (gerçek çeviri değildir).
 * Her sekmede metin taşıyan öğenin içeriği kendi kutusuna sığmalı ya da kaydırılabilir olmalıdır; kırpılma
 * (overflow gizli + scrollWidth > clientWidth) ve sayfa dışına taşma hata sayılır. Kayıtlı istisna dosyası YOKTUR:
 * ölçü dışı yalnız görünmeyen/sr-only/sıfır boyutlu öğeler, kaydırılabilir kutular ve üç nokta + `title` ile
 * kurtarılabilen kısaltmadır (`support/textFit.ts`); her bulgu doğrudan hatadır.
 */
const VIEWPORTS = [
  { name: '1280x800', width: 1280, height: 800 },
  // %200 tarayıcı yakınlaştırması: 1280×800 pencerenin CSS görünümü 640×400'dür (UI-07.2).
  { name: '640x400', width: 640, height: 400 },
  { name: '360x740', width: 360, height: 740 },
  { name: '320x568', width: 320, height: 568 },
] as const;

for (const [viewport, dir] of VIEWPORTS.flatMap((vp) => [
  [vp, 'ltr'] as const,
  [vp, 'rtl'] as const,
])) {
  const query = dir === 'rtl' ? '/?lang=pseudo&dir=rtl' : '/?lang=pseudo';
  test(`sahte dil (+%30, ${dir}) ${viewport.name}: hiçbir sekmede metin kırpılmaz`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(query);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector('[role="tablist"]');
    await expect(page.locator('html')).toHaveAttribute('lang', 'qps');
    if (dir === 'rtl') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const surfaces: Partial<Record<(typeof SHOWCASE_TABS)[number], Record<string, string>>> = {
      buttons: { Button: '.vol-button', IconButton: '.vol-icon-button', Icon: '.vol-icon' },
      text: { Text: '.vol-text' },
      panels: { Panel: '.vol-panel' },
      scroll: { ScrollView: '.vol-scroll-view' },
      hud: {
        Bar: '.vol-bar',
        XPBar: '.vol-xp-bar',
        FpsMeter: '.vol-fps-meter',
        MinimapPanel: '.vol-minimap',
      },
      cards: { CardTile: '.vol-card' },
      forms: {
        Checkbox: '.vol-checkbox',
        Input: 'input.vol-input',
        SegmentedControl: '.vol-segmented',
        Select: '.vol-select',
        Slider: '.vol-slider',
      },
      advanced: { DataTable: '.vol-datatable', EventLog: '.vol-event-log' },
      touch: { HoldButton: '.vol-hold-button', Glyph: '.vol-glyph' },
    };
    const long30Findings: Finding[] = [];
    for (const tab of SHOWCASE_TABS) {
      await selectTab(page, tab);
      for (const [name, selector] of Object.entries(surfaces[tab] ?? {})) {
        expect(
          await page.getByRole('tabpanel').filter({ visible: true }).locator(selector).count(),
          name + ' gerçek vitrin tüketimi',
        ).toBeGreaterThan(0);
      }
      long30Findings.push(...(await scan(page, tab, viewport.name)));
    }
    console.log(JSON.stringify(long30Findings, null, 1));
    expect(long30Findings).toEqual([]);
  });
}

/** Katman açıcılar: sekme, açan düğmenin İngilizce kaynak metni (sahte dönüşümle aranır), katman kökü. */
const OVERLAYS: ReadonlyArray<{
  id: string;
  tab: (typeof SHOWCASE_TABS)[number];
  open: string;
  root: string;
}> = [
  { id: 'modal', tab: 'panels', open: 'Open Modal', root: '.vol-modal--visible' },
  { id: 'sheet', tab: 'panels', open: 'Open Sheet', root: '.vol-modal--visible' },
  { id: 'confirm', tab: 'panels', open: 'Delete Save', root: '.vol-modal--visible' },
  { id: 'osk', tab: 'forms', open: 'Open keyboard', root: '.vol-osk' },
  { id: 'popup', tab: 'panels', open: 'Open Popup', root: '.vol-popup' },
  {
    id: 'popover',
    tab: 'panels',
    open: 'Open Popover',
    root: '.vol-popover',
  },
  {
    id: 'level-up',
    tab: 'cards',
    open: 'OPEN LEVEL-UP',
    root: '.vol-showcase-card-layer:not([hidden])',
  },
  { id: 'shop', tab: 'cards', open: 'OPEN SHOP', root: '.vol-showcase-card-layer:not([hidden])' },
  { id: 'loading', tab: 'loading', open: 'Preview full flow', root: '.vol-loading' },
  { id: 'toast', tab: 'panels', open: 'Show Danger', root: '.vol-toast--visible' },
  { id: 'dialogue', tab: 'advanced', open: 'Start Dialogue', root: '.vol-dialogue' },
  {
    id: 'command-palette',
    tab: 'advanced',
    open: 'Command Palette',
    root: '.vol-command-palette__panel',
  },
];

for (const viewport of VIEWPORTS.filter((vp) => vp.name !== '320x568')) {
  test(`sahte dil (+%30) ${viewport.name}: açık katmanlarda metin kırpılmaz`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/?lang=pseudo');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector('[role="tablist"]');
    const layerSurfaces = {
      Modal: '.vol-modal--visible',
      CardPicker: '.vol-card-picker',
      LevelUpPicker: '.vol-card-picker--levelup',
      ShopPicker: '.vol-card-picker--shop',
      LoadingScreen: '.vol-loading',
      ToastManager: '.vol-toast--visible',
    };
    const long30Findings: Finding[] = [];
    for (const overlay of OVERLAYS) {
      await selectTab(page, overlay.tab);
      await page
        .getByRole('tabpanel')
        .filter({ visible: true })
        .getByRole('button', { name: pseudoize(overlay.open), exact: true })
        .click();
      await page.locator(overlay.root).first().waitFor();
      await settleTransitions(page);
      const expected =
        {
          modal: ['Modal'],
          sheet: ['Modal'],
          confirm: ['Modal'],
          'level-up': ['CardPicker', 'LevelUpPicker'],
          shop: ['CardPicker', 'ShopPicker'],
          loading: ['LoadingScreen'],
          toast: ['ToastManager'],
        }[overlay.id] ?? [];
      for (const name of expected) {
        await expect(
          page
            .locator(layerSurfaces[name as keyof typeof layerSurfaces])
            .filter({ visible: true })
            .first(),
          name + ' açık katmanda bulunur',
        ).toBeVisible();
      }
      long30Findings.push(...(await scan(page, overlay.id, viewport.name, overlay.root)));
      // Her katman temiz bir sayfada denenir (zorunlu seçimli katmanlar Escape ile kapanmaz).
      await page.goto('/?lang=pseudo');
      await page.waitForSelector('[role="tablist"]');
    }
    expect(long30Findings).toEqual([]);
  });
}
