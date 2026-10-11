import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tabBuilders } from './sections/tabBuilders';
import * as Core from '@volstudio/core';

const EXPECTED_TABS = [
  'buttons',
  'text',
  'panels',
  'hud',
  'cards',
  'forms',
  'workbench',
  'palette',
  'theme',
  'advanced',
  'scroll',
  'touch',
  'loading',
  'ses',
  'kimlik',
];

/**
 * VOL.UI Qualification Parity Testi (Option B).
 *
 * Mimari Sözleşme:
 * 1. `@volstudio/core`: UI bileşenlerinin (Button, Input, Panel, Dialog, Tabs,
 *    CardTile, RangeSlider, DataTable, SplitPane vb.) tek kanonik kaynak kodudur.
 * 2. `devtools/vol-showcase`: Bu bileşenlerin tarayıcı ortamında (DOM, tema, CSS değişkenleri,
 *    dokunma ve klavye etkileşimleri) görsel olarak doğrulandığı, test edildiği
 *    ve Playwright visual regresyon testlerine tabi tutulduğu DEVTOOL / QUALIFICATION
 *    yüzeyidir.
 * 3. Oyunlar vol-showcase'e bağımlı DEĞİLDİR; vol-showcase bir çalışma
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

  it('CORE UI görsel bileşen sınıfları dışa aktarılır ve vol-showcase tarafından tüketilir', () => {
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

  it('Showcase sekmeleri beklenen sırayla kayıtlıdır', () => {
    expect(tabBuilders(() => uiRoot).map((b) => b.name)).toEqual(EXPECTED_TABS);
  });

  // Her sekme kendi sınamasıdır: 15 sekmeyi tek sınamada kurmak paralel kapsam koşusunda 5 sn
  // bütçesini aşıyordu ve düşen sekmeyi adıyla göstermiyordu.
  it.each(EXPECTED_TABS)(
    'Showcase "%s" sekmesi bileşen ailesini nitelendirir ve temizler',
    (tab) => {
      const entry = tabBuilders(() => uiRoot).find((b) => b.name === tab);
      expect(entry).toBeDefined();
      const { element, destroy } = entry!.build();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.classList.contains('vol-showcase-section')).toBe(true);
      expect(typeof destroy).toBe('function');
      destroy();
      expect(uiRoot.children.length).toBe(0);
    },
  );
});
