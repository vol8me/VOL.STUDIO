import { afterEach, describe, expect, it } from 'vitest';
import { i18next } from '../../../src/i18n/I18n';
import { SelectionInfoPanel } from '../../../src/ui/hud/SelectionInfoPanel';
import { StatsPanel } from '../../../src/ui/hud/StatsPanel';

/**
 * HUD bilgi panellerinin okuyucu sözleşmesi (UI-08.2): adlı bölge, yalnız seçili öğenin adını duyuran durum bölgesi,
 * adlı can çubuğu, liste anlamı. Gerçek tarayıcı sonucu `devtools/vol-showcase/tests/e2e/hudPanels.spec.ts`tedir.
 */
const tracked: Array<{ destroy(): void }> = [];
function track<T extends { destroy(): void }>(instance: T): T {
  tracked.push(instance);
  return instance;
}

afterEach(async () => {
  while (tracked.length > 0) tracked.pop()!.destroy();
  document.body.replaceChildren();
  await i18next.changeLanguage('tr');
});

const status = (panel: SelectionInfoPanel): string =>
  panel.element.querySelector('[role="status"]')!.textContent ?? '';

describe('SelectionInfoPanel okuyucu', () => {
  it('kök adlı bir bölgedir ve portre dekoratiftir', () => {
    const panel = track(new SelectionInfoPanel());
    expect(panel.element.getAttribute('role')).toBe('region');
    expect(panel.element.getAttribute('aria-label')).toBe('Seçim');
    expect(
      panel.element.querySelector('.vol-selection-panel__portrait')!.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('seçim değişince durum bölgesi yalnız adı söyler; boşalınca boş durumu söyler', () => {
    const panel = track(new SelectionInfoPanel());
    expect(status(panel)).toBe('Seçili öğe yok');
    panel.show({ name: 'Okçu Kulesi', stats: [{ label: 'Hasar', value: '12' }] });
    expect(status(panel)).toBe('Seçili: Okçu Kulesi');
    panel.clear();
    expect(status(panel)).toBe('Seçili öğe yok');
  });

  it('aynı seçim yeniden gösterilince durum bölgesi yeniden yazılmaz (yeniden duyuru yok)', async () => {
    const panel = track(new SelectionInfoPanel());
    panel.show({ name: 'Kule' });
    const region = panel.element.querySelector('[role="status"]')!;
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((batch) => records.push(...batch));
    observer.observe(region, { childList: true, characterData: true, subtree: true });
    panel.show({ name: 'Kule', stats: [{ label: 'Hasar', value: '3' }] });
    panel.setHealth(5);
    await Promise.resolve();
    observer.disconnect();
    expect(records.length).toBe(0);
  });

  it('can çubuğu adlıdır, değeri okunur ve düşük durum metinle söylenir', () => {
    const panel = track(new SelectionInfoPanel());
    panel.show({ name: 'Kule', health: { max: 100, value: 60 } });
    const bar = panel.element.querySelector('.vol-bar')!;
    expect(bar.getAttribute('aria-label')).toBe('Can');
    expect(bar.getAttribute('aria-valuetext')).toBe('60 / 100');
    panel.setHealth(10);
    expect(bar.getAttribute('aria-valuetext')).toBe('10 / 100, düşük');
  });

  it('verilen can adı çeviriyle ezilmez; verilmeyen ad dil değişince yenilenir', async () => {
    const custom = track(new SelectionInfoPanel());
    custom.show({ name: 'Kule', health: { max: 10, value: 10, ariaLabel: 'Dayanıklılık' } });
    const standard = track(new SelectionInfoPanel());
    standard.show({ name: 'Kule', health: { max: 10, value: 10 } });
    await i18next.changeLanguage('en');
    expect(custom.element.querySelector('.vol-bar')!.getAttribute('aria-label')).toBe(
      'Dayanıklılık',
    );
    expect(standard.element.querySelector('.vol-bar')!.getAttribute('aria-label')).toBe('Health');
    expect(standard.element.getAttribute('aria-label')).toBe('Selection');
    expect(status(standard)).toBe('Selected: Kule');
  });

  it('istatistik satırları liste öğesidir', () => {
    const panel = track(new SelectionInfoPanel());
    panel.show({
      name: 'Kule',
      stats: [
        { label: 'Hasar', value: '12' },
        { label: 'Menzil', value: '6' },
      ],
    });
    const list = panel.element.querySelector('.vol-selection-panel__stats')!;
    expect(list.getAttribute('role')).toBe('list');
    expect(list.querySelectorAll('[role="listitem"]')).toHaveLength(2);
  });

  it('destroy dil dinleyicisini bırakır', async () => {
    const panel = new SelectionInfoPanel();
    panel.destroy();
    await i18next.changeLanguage('en');
    expect(panel.element.getAttribute('aria-label')).toBe('Seçim');
  });
});

describe('StatsPanel okuyucu', () => {
  const groups = [
    {
      id: 'player',
      label: 'Oyuncu',
      entries: [
        { id: 'hp', label: 'Can', value: '100' },
        { id: 'speed', label: 'Hız', value: '5' },
      ],
    },
    { id: 'plain', entries: [{ id: 'gold', label: 'Altın', value: '9' }] },
  ];

  it('başlıklı bölüm başlığıyla adlanır, başlıksız bölüm bölge olmaz', () => {
    const panel = track(new StatsPanel({ title: 'İstatistik' }));
    panel.setGroups(groups);
    const [labelled, unlabelled] = [
      ...panel.element.querySelectorAll<HTMLElement>('.vol-stats-panel__group'),
    ];
    const heading = labelled.querySelector('h3')!;
    expect(labelled.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(heading.id).not.toBe('');
    expect(unlabelled.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('başlık sonradan kalkarsa adlandırma da kalkar', () => {
    const panel = track(new StatsPanel({ title: 'İstatistik' }));
    panel.setGroups(groups);
    panel.setGroups([{ ...groups[0], label: undefined }, groups[1]]);
    const first = panel.element.querySelector<HTMLElement>('.vol-stats-panel__group')!;
    expect(first.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('girdiler liste öğesidir', () => {
    const panel = track(new StatsPanel({ title: 'İstatistik' }));
    panel.setGroups(groups);
    const lists = panel.element.querySelectorAll('.vol-stats-panel__entries');
    expect([...lists].map((list) => list.getAttribute('role'))).toEqual(['list', 'list']);
    expect(panel.element.querySelectorAll('[role="listitem"]')).toHaveLength(3);
  });
});
