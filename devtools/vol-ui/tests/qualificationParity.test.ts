import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tabBuilders } from './sections/tabBuilders';
import * as Core from '@volstudio/core';

/**
 * VOL.UI Qualification Parity Testi (Option B).
 *
 * Mimari Sözleşme:
 * 1. `@volstudio/core`: UI bileşenlerinin (Button, Input, Panel, Dialog, Tabs,
 *    CardTile, RangeSlider, DataTable, SplitPane vb.) tek kanonik kaynak kodudur.
 * 2. `devtools/vol-ui`: Bu bileşenlerin tarayıcı ortamında (DOM, tema, CSS değişkenleri,
 *    dokunma ve klavye etkileşimleri) görsel olarak doğrulandığı, test edildiği
 *    ve Playwright visual regresyon testlerine tabi tutulduğu DEVTOOL / QUALIFICATION
 *    yüzeyidir.
 * 3. Oyunlar (vol-hell, vol-arachnid) vol-ui'ye bağımlı DEĞİLDİR; vol-ui bir çalışma
 *    zamanı (production) kütüphanesi değil, geliştirme ve kabul test tezgahıdır.
 */
describe('VOL.UI Qualification Parity Invariant', () => {
  let uiRoot: HTMLDivElement;

  beforeEach(() => {
    uiRoot = document.createElement('div');
    document.body.appendChild(uiRoot);
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('CORE UI görsel bileşen sınıfları dışa aktarılır ve vol-ui tarafından tüketilir', () => {
    const expectedCoreComponents = [
      'Button',
      'Checkbox',
      'Panel',
      'Tabs',
      'Tree',
      'CardTile',
      'RangeSlider',
      'DataTable',
      'SplitPane',
      'Carousel',
      'SwipeableCardStack',
      'ActionBar',
      'CommandPalette',
      'DialogueBox',
      'RichTooltip',
      'FloatingTextManager',
      'ResourceBar',
      'XPBar',
    ];

    for (const name of expectedCoreComponents) {
      expect(Core).toHaveProperty(name);
      expect((Core as unknown as Record<string, unknown>)[name]).toBeDefined();
    }
  });

  it('Showcase 12 temel sekmede tüm bileşen ailelerini nitelendirir ve temizler', () => {
    const builders = tabBuilders(() => uiRoot);
    expect(builders.length).toBe(12);

    const registeredTabs = builders.map((b) => b.name);
    const expectedTabs = [
      'buttons',
      'text',
      'panels',
      'hud',
      'cards',
      'forms',
      'workbench',
      'palette',
      'advanced',
      'scroll',
      'touch',
      'loading',
    ];
    expect(registeredTabs).toEqual(expectedTabs);

    for (const { name, build } of builders) {
      expect(name).toBeTruthy();
      const { element, destroy } = build();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.classList.contains('vol-showcase-section')).toBe(true);
      expect(typeof destroy).toBe('function');
      destroy();
      expect(uiRoot.children.length).toBe(0);
    }
  });
});
