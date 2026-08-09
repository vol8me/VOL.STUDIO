import { describe, it, expect, afterEach } from 'vitest';
import { i18next } from '../../src/systems/I18n';
import { NumberStepper } from '../../src/ui/primitives/NumberStepper';
import { Select } from '../../src/ui/primitives/Select';
import { Bar } from '../../src/ui/feedback/Bar';
import { ResourceBar } from '../../src/ui/feedback/ResourceBar';
import { WaveCounter } from '../../src/ui/feedback/WaveCounter';
import { PauseResumeButton } from '../../src/ui/controls/PauseResumeButton';
import { Carousel } from '../../src/ui/controls/Carousel';
import { DPad } from '../../src/ui/controls/DPad';
import { DataTable } from '../../src/ui/data/DataTable';
import { EventLog } from '../../src/ui/data/EventLog';

const tracked: Array<{ destroy(): void }> = [];
function track<T extends { destroy(): void }>(instance: T): T {
  tracked.push(instance);
  return instance;
}
afterEach(() => {
  while (tracked.length > 0) tracked.pop()!.destroy();
});

async function changeLanguage(lang: string): Promise<void> {
  await i18next.changeLanguage(lang);
}

describe('languageChanged — canli dil degisimi', () => {
  it('NumberStepper aria-label\'leri dil degisiminde guncellenir', async () => {
    const stepper = track(new NumberStepper());
    const dec = stepper.element.querySelector<HTMLButtonElement>('[aria-label]');
    expect(dec?.getAttribute('aria-label')).toBe(i18next.t('core:stepper.decrement'));

    await changeLanguage('en');
    expect(dec?.getAttribute('aria-label')).toBe(i18next.t('core:stepper.decrement'));

    await changeLanguage('tr');
  });

  it('Select placeholder i18n default ise dil degisiminde guncellenir', async () => {
    const select = track(new Select({ options: [{ value: 'a', label: 'A' }] }));
    const label = select.element.querySelector<HTMLSpanElement>('.vol-select__label');
    expect(label?.textContent).toBe(i18next.t('core:select.placeholder'));

    await changeLanguage('en');
    expect(label?.textContent).toBe(i18next.t('core:select.placeholder'));

    await changeLanguage('tr');
  });

  it('Bar aria-label (label yoksa) dil degisiminde guncellenir', async () => {
    const bar = track(new Bar({ max: 100, value: 50 }));
    expect(bar.element.getAttribute('aria-label')).toBe(i18next.t('core:bar.ariaLabel', { variant: 'health' }));

    await changeLanguage('en');
    expect(bar.element.getAttribute('aria-label')).toBe(i18next.t('core:bar.ariaLabel', { variant: 'health' }));

    await changeLanguage('tr');
  });

  it('ResourceBar aria-label dil degisiminde guncellenir', async () => {
    const rb = track(new ResourceBar({ resources: [{ key: 'gold', label: 'Altin', value: 100, icon: '💰' }] }));
    expect(rb.element.getAttribute('aria-label')).toBe(i18next.t('core:resourcebar.label'));

    await changeLanguage('en');
    expect(rb.element.getAttribute('aria-label')).toBe(i18next.t('core:resourcebar.label'));

    await changeLanguage('tr');
  });

  it('WaveCounter dalga metni dil degisiminde guncellenir', async () => {
    const wc = track(new WaveCounter({ totalWaves: 10 }));
    wc.setWave(3);
    const waveEl = wc.element.querySelector<HTMLSpanElement>('.vol-wave-counter__wave');
    expect(waveEl?.textContent).toBe(i18next.t('core:wavecounter.waveTotal', { wave: 3, total: 10 }));

    await changeLanguage('en');
    expect(waveEl?.textContent).toBe(i18next.t('core:wavecounter.waveTotal', { wave: 3, total: 10 }));

    await changeLanguage('tr');
  });

  it('PauseResumeButton aria-label dil degisiminde guncellenir', async () => {
    const btn = track(new PauseResumeButton());
    expect(btn.element.getAttribute('aria-label')).toBe(i18next.t('core:pause.pause'));

    await changeLanguage('en');
    expect(btn.element.getAttribute('aria-label')).toBe(i18next.t('core:pause.pause'));

    await changeLanguage('tr');
  });

  it('Carousel arrow aria-label\'leri dil degisiminde guncellenir', async () => {
    const carousel = track(
      new Carousel({
        slides: [{ id: 's1', element: document.createElement('div') }],
      }),
    );
    const arrows = carousel.element.querySelectorAll<HTMLButtonElement>('.vol-carousel__arrow');
    expect(arrows.length).toBeGreaterThanOrEqual(1);

    const leftArrow = Array.from(arrows).find((a) => a.classList.contains('vol-carousel__arrow--left'));
    expect(leftArrow?.getAttribute('aria-label')).toBe(i18next.t('core:carousel.prev'));

    await changeLanguage('en');
    expect(leftArrow?.getAttribute('aria-label')).toBe(i18next.t('core:carousel.prev'));

    await changeLanguage('tr');
  });

  it('DPad direction button label\'lari dil degisiminde guncellenir', async () => {
    const dpad = track(new DPad());
    const upBtn = dpad.element.querySelector<HTMLButtonElement>('.vol-dpad__slot--up');
    expect(upBtn?.getAttribute('aria-label')).toBe(i18next.t('core:dpad.up'));

    await changeLanguage('en');
    expect(upBtn?.getAttribute('aria-label')).toBe(i18next.t('core:dpad.up'));

    await changeLanguage('tr');
  });

  it('DataTable emptyText i18n default ise dil degisiminde guncellenir', async () => {
    const table = track(
      new DataTable({
        columns: [{ key: 'name', header: 'Isim' }],
        rows: [],
      }),
    );
    const emptyCell = table.element.querySelector<HTMLTableCellElement>('.vol-datatable__empty');
    expect(emptyCell?.textContent).toBe(i18next.t('core:datatable.empty'));

    await changeLanguage('en');
    const emptyCellEn = table.element.querySelector<HTMLTableCellElement>('.vol-datatable__empty');
    expect(emptyCellEn?.textContent).toBe(i18next.t('core:datatable.empty'));

    await changeLanguage('tr');
  });

  it('EventLog filter button label\'lari dil degisiminde guncellenir', async () => {
    const log = track(new EventLog({ showFilters: true }));
    const buttons = log.element.querySelectorAll<HTMLButtonElement>('.vol-event-log__filter');
    expect(buttons.length).toBe(5);
    expect(buttons[0].textContent).toBe(i18next.t('core:eventlog.filter.all'));

    await changeLanguage('en');
    const buttonsEn = log.element.querySelectorAll<HTMLButtonElement>('.vol-event-log__filter');
    expect(buttonsEn[0].textContent).toBe(i18next.t('core:eventlog.filter.all'));

    await changeLanguage('tr');
  });
});
