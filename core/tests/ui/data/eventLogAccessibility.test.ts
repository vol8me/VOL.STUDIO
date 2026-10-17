import { afterEach, describe, expect, it } from 'vitest';
import { EventLog } from '../../../src/ui/data/EventLog';

const mounted: EventLog[] = [];

function make(options: ConstructorParameters<typeof EventLog>[0] = {}): EventLog {
  const log = new EventLog(options);
  document.body.appendChild(log.element);
  mounted.push(log);
  return log;
}

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.destroy();
  document.body.innerHTML = '';
});

describe('EventLog erişilebilirlik', () => {
  it('liste canlı bölge değildir; yalnız yeni kayıt ayrı duyuru bölgesinden okunur', () => {
    const log = make();
    const list = log.element.querySelector('[role="log"]')!;
    const announcer = log.element.querySelector('[role="status"]')!;
    expect(list.getAttribute('aria-live')).toBe('off');
    log.push({ text: 'Birinci', timestamp: '12:00' });
    expect(announcer.textContent).toBe('12:00 Birinci');
    log.push({ text: 'İkinci' });
    expect(announcer.textContent).toBe('İkinci');
    expect(announcer.textContent).not.toContain('Birinci');
  });

  it('süzgeçle eşleşmeyen kayıt duyurulmaz; yinelenen kayıt sayaçla duyurulur', () => {
    const log = make({ showFilters: true, collapseDuplicates: true });
    const announcer = log.element.querySelector('[role="status"]')!;
    log.element.querySelectorAll<HTMLButtonElement>('.vol-event-log__filter')[2].click(); // warning
    log.push({ text: 'bilgi', tone: 'info' });
    expect(announcer.textContent).toBe('');
    log.push({ text: 'uyarı', tone: 'warning' });
    log.push({ text: 'uyarı', tone: 'warning' });
    expect(announcer.textContent).toBe('uyarı ×2');
  });

  it('süzgeç düğmeleri aria-pressed taşır', () => {
    const log = make({ showFilters: true });
    const buttons = [...log.element.querySelectorAll<HTMLButtonElement>('.vol-event-log__filter')];
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
    ]);
    buttons[3].click();
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'false',
      'true',
      'false',
    ]);
  });

  it('kaydırılabilir alan klavyeyle odaklanabilir', () => {
    const log = make();
    expect(log.element.querySelector<HTMLElement>('.vol-event-log__scroll-area')!.tabIndex).toBe(0);
  });

  it('klavyeyle sabitleyince odak aynı kaydın yeni düğmesinde kalır', () => {
    const log = make({ pinnable: true });
    log.push({ text: 'a' });
    log.push({ text: 'b' });
    const pins = () => [...log.element.querySelectorAll<HTMLButtonElement>('.vol-event-log__pin')];
    pins()[1].focus();
    pins()[1].click(); // b sabitlenir → en üste çıkar, satırlar yeniden kurulur
    const active = document.activeElement as HTMLElement;
    expect(active.classList.contains('vol-event-log__pin')).toBe(true);
    expect(active.classList.contains('vol-event-log__pin--active')).toBe(true);
    expect(active.closest('.vol-event-log__row')!.textContent).toContain('b');
  });
});
