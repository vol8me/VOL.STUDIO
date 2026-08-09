import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { CommandPalette, type CommandItem } from '../../src/ui/overlays/CommandPalette';
import { showConfirm } from '../../src/ui/overlays/Confirm';
import { DialogueBox } from '../../src/ui/overlays/DialogueBox';
import { RichTooltip } from '../../src/ui/overlays/RichTooltip';

// jsdom scrollIntoView'ı hiç implemente etmez (CommandPalette.renderActiveState
// çağırır) — global bir no-op stub olmadan her klavye navigasyonu testi
// yakalanmamış bir TypeError fırlatırdı. beforeEach/afterEach ile kurulup
// restore edilir: dosya seviyesinde kalıcı atama diğer test dosyalarına sızar.
const originalScrollIntoView = Element.prototype.scrollIntoView;

const tracked: Array<{ destroy(): void }> = [];
function track<T extends { destroy(): void }>(instance: T): T {
  tracked.push(instance);
  return instance;
}
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  while (tracked.length > 0) tracked.pop()!.destroy();
  vi.useRealTimers();
  document.body.innerHTML = '';
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

describe('CommandPalette', () => {
  function makeItems(): CommandItem[] {
    return [
      {
        id: 'tower',
        label: 'Kule İnşa Et',
        description: 'Yeni bir savunma kulesi kurar',
        category: 'İnşa',
        onSelect: vi.fn(),
      },
      { id: 'wave', label: 'Dalgayı Başlat', category: 'Sistem', onSelect: vi.fn() },
      { id: 'speed', label: 'Hız x2', category: 'Sistem', onSelect: vi.fn() },
    ];
  }

  it("open() input'u temizler, odaklanır ve inert kaldırır", () => {
    const palette = track(new CommandPalette());
    document.body.appendChild(palette.element);
    palette.setItems(makeItems());

    palette.open();
    expect(palette.isOpen()).toBe(true);
    expect(palette.element.inert).toBe(false);
    expect(document.activeElement).toBe(palette.element.querySelector('input'));
  });

  it('çoklu kelimeli arama (sırası önemsiz) label/description içinde eşleşenleri filtreler', () => {
    const palette = track(new CommandPalette());
    document.body.appendChild(palette.element);
    palette.setItems(makeItems());
    palette.open();

    const input = palette.element.querySelector<HTMLInputElement>('input')!;
    input.value = 'inşa kule';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const rows = palette.element.querySelectorAll('.vol-command-palette__item');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Kule İnşa Et');
  });

  it('eşleşme yoksa noMatchText gösterilir', () => {
    const palette = track(new CommandPalette({ noMatchText: '"{query}" bulunamadı' }));
    document.body.appendChild(palette.element);
    palette.setItems(makeItems());
    palette.open();

    const input = palette.element.querySelector<HTMLInputElement>('input')!;
    input.value = 'zzzzz';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const empty = palette.element.querySelector('.vol-command-palette__empty');
    expect(empty?.textContent).toBe('"zzzzz" bulunamadı');
  });

  it('ArrowDown/Enter ile klavyeden bir öğe seçilebilir, seçince kapanır', () => {
    const items = makeItems();
    const palette = track(new CommandPalette());
    document.body.appendChild(palette.element);
    palette.setItems(items);
    palette.open();

    const input = palette.element.querySelector<HTMLInputElement>('input')!;
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );

    expect(items[1].onSelect).toHaveBeenCalledTimes(1); // ArrowDown ile ikinci öğeye geçildi
    expect(palette.isOpen()).toBe(false);
  });

  it('Escape kapatır ve önceki odaklı elementi geri getirir', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const palette = track(new CommandPalette());
    document.body.appendChild(palette.element);
    palette.open();

    const input = palette.element.querySelector<HTMLInputElement>('input')!;
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );

    expect(palette.isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('destroy tüm listenerlarini temizler', () => {
    const palette = new CommandPalette();
    const input = palette.element.querySelector<HTMLInputElement>('input')!;
    const removeInputListener = vi.spyOn(input, 'removeEventListener');
    const removeDocListener = vi.spyOn(document, 'removeEventListener');

    palette.destroy();
    expect(removeInputListener).toHaveBeenCalledWith('input', expect.any(Function));
    expect(removeInputListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeDocListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});

describe('showConfirm', () => {
  it('confirm butonuna tıklanınca Promise true ile çözülür', async () => {
    vi.useFakeTimers();
    const promise = showConfirm({ title: 'Silinsin mi?' });

    const confirmButton = document.querySelector<HTMLButtonElement>(
      '.vol-confirm__actions button:last-child',
    )!;
    confirmButton.click();

    vi.advanceTimersByTime(300);
    await expect(promise).resolves.toBe(true);
  });

  it('cancel butonuna tıklanınca Promise false ile çözülür', async () => {
    vi.useFakeTimers();
    const promise = showConfirm({ title: 'Silinsin mi?' });

    const cancelButton = document.querySelector<HTMLButtonElement>(
      '.vol-confirm__actions button:first-child',
    )!;
    cancelButton.click();

    vi.advanceTimersByTime(300);
    await expect(promise).resolves.toBe(false);
  });

  it('modal onClose (ör. Escape/scrim) ile de false döner, ve yalnızca BİR KEZ resolve edilir', async () => {
    vi.useFakeTimers();
    const promise = showConfirm({ title: 'Silinsin mi?' });

    const cancelButton = document.querySelector<HTMLButtonElement>(
      '.vol-confirm__actions button:first-child',
    )!;
    const confirmButton = document.querySelector<HTMLButtonElement>(
      '.vol-confirm__actions button:last-child',
    )!;

    // Cancel'a tıklamak Modal.onClose'u da tetikleyebilir (close() çağrısı
    // üzerinden) — finish() ikinci kez çağrılsa bile Promise yalnızca ilk
    // sonuçla çözülmüş olmalı.
    cancelButton.click();
    confirmButton.click(); // artık modal kapanıyor, bu tıklama etkisiz olmalı

    vi.advanceTimersByTime(300);
    await expect(promise).resolves.toBe(false);
  });

  it('başlık metni modal içine render edilir', () => {
    vi.useFakeTimers();
    void showConfirm({ title: 'Kalıcı olarak sil?' });
    expect(document.body.textContent).toContain('Kalıcı olarak sil?');

    const cancelButton = document.querySelector<HTMLButtonElement>(
      '.vol-confirm__actions button:first-child',
    )!;
    cancelButton.click();
    vi.advanceTimersByTime(300);
  });
});

describe('DialogueBox', () => {
  it('show() ilk satırı sırayla karakter-karakter yazar', () => {
    vi.useFakeTimers();
    const box = track(new DialogueBox({ typeSpeedMs: 10 }));
    box.show([{ speaker: 'Elf', text: 'Merhaba' }]);

    expect(box.element.classList.contains('vol-dialogue--visible')).toBe(true);
    const textEl = box.element.querySelector('.vol-dialogue__text')!;
    expect(textEl.textContent).toBe('');

    vi.advanceTimersByTime(10 * 7); // 'Merhaba' = 7 karakter
    expect(textEl.textContent).toBe('Merhaba');
  });

  it('typeSpeedMs:0 ile metin anında tamamlanır', () => {
    const box = track(new DialogueBox({ typeSpeedMs: 0 }));
    box.show([{ text: 'Anında' }]);
    expect(box.element.querySelector('.vol-dialogue__text')?.textContent).toBe('Anında');
  });

  it('yazım sırasında tıklamak (next) anında tamamlar, ikinci tıklama sıradaki satıra geçer', () => {
    vi.useFakeTimers();
    const box = track(new DialogueBox({ typeSpeedMs: 100 }));
    box.show([{ text: 'Uzun bir cümle' }, { text: 'İkinci satır' }]);

    box.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const textEl = box.element.querySelector('.vol-dialogue__text')!;
    expect(textEl.textContent).toBe('Uzun bir cümle'); // anında tamamlandı

    box.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(textEl.textContent).toBe(''); // ikinci satırın yazımı başladı
  });

  it('choices verilen satırda otomatik ilerlemez, seçim yapılınca onSelect çağrılır ve devam eder', () => {
    vi.useFakeTimers();
    const onSelectA = vi.fn();
    const box = track(new DialogueBox({ typeSpeedMs: 0 }));
    box.show([
      {
        text: 'Ne yaparsın?',
        choices: [
          { label: 'Evet', onSelect: onSelectA },
          { label: 'Hayır', onSelect: vi.fn() },
        ],
      },
      { text: 'Son satır' },
    ]);

    const choiceButtons = box.element.querySelectorAll<HTMLButtonElement>('.vol-dialogue__choice');
    expect(choiceButtons.length).toBe(2);

    choiceButtons[0].click();
    expect(onSelectA).toHaveBeenCalledTimes(1);
    expect(box.element.querySelector('.vol-dialogue__text')?.textContent).toBe('Son satır');
  });

  it('kuyruk biterse onComplete çağrılır ve kutu gizlenir', () => {
    const onComplete = vi.fn();
    const box = track(new DialogueBox({ typeSpeedMs: 0, onComplete }));
    box.show([{ text: 'Tek satır' }]);

    box.next(); // kuyrukta başka satır yok -> hide() + onComplete
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(box.element.classList.contains('vol-dialogue--visible')).toBe(false);
  });

  it("showControls:true ile hızlandır butonu typeSpeedMs'i değiştirir", () => {
    const box = track(new DialogueBox({ typeSpeedMs: 24, fastTypeSpeedMs: 2, showControls: true }));
    const fastForwardButton =
      box.element.querySelector<HTMLButtonElement>('.vol-dialogue__control')!;

    fastForwardButton.click();
    expect(fastForwardButton.getAttribute('aria-pressed')).toBe('true');

    // typeSpeedMs private, dolaylı olarak: hızlandırılmış modda show() sonrası daha hızlı tamamlanmalı.
    vi.useFakeTimers();
    box.show([{ text: 'AB' }]);
    vi.advanceTimersByTime(2 * 2); // fastTypeSpeedMs * karakter sayısı
    expect(box.element.querySelector('.vol-dialogue__text')?.textContent).toBe('AB');
  });

  it('skipAll seçenek gerektirmeyen tüm kuyruğu atlayıp kapatır', () => {
    const onComplete = vi.fn();
    const box = track(new DialogueBox({ typeSpeedMs: 100, onComplete }));
    box.show([{ text: 'A' }, { text: 'B' }, { text: 'C' }]);

    box.skipAll();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(box.element.classList.contains('vol-dialogue--visible')).toBe(false);
  });

  it("destroy click listener'ı temizler ve bekleyen typing interval'i durdurur", () => {
    vi.useFakeTimers();
    const box = new DialogueBox({ typeSpeedMs: 50 });
    box.show([{ text: 'Test' }]);
    const removeListener = vi.spyOn(box.element, 'removeEventListener');
    const clearSpy = vi.spyOn(window, 'clearInterval');

    box.destroy();
    expect(removeListener).toHaveBeenCalledWith('click', expect.any(Function));
    expect(clearSpy).toHaveBeenCalled();
  });
});

describe('RichTooltip', () => {
  it('mouseenter sonrası delayMs geçince görünür olur, içerik render edilir', () => {
    vi.useFakeTimers();
    const target = document.createElement('button');
    document.body.appendChild(target);

    const _tooltip = track(
      new RichTooltip(
        target,
        {
          title: 'Kılıç',
          description: 'Keskin bir kılıç',
          stats: [{ label: 'Hasar', value: '42' }],
        },
        { delayMs: 300 },
      ),
    );

    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(300);

    const bubble = document.querySelector('.vol-rich-tooltip')!;
    expect(bubble.classList.contains('vol-rich-tooltip--visible')).toBe(true);
    expect(bubble.querySelector('.vol-rich-tooltip__title')?.textContent).toBe('Kılıç');
    expect(bubble.querySelector('.vol-rich-tooltip__stat-value')?.textContent).toBe('42');
  });

  it('mouseleave gecikme dolmadan gerçekleşirse tooltip hiç görünmez', () => {
    vi.useFakeTimers();
    const target = document.createElement('button');
    document.body.appendChild(target);
    const _tooltip = track(new RichTooltip(target, { title: 'Kılıç' }, { delayMs: 300 }));

    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(100);
    target.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    vi.advanceTimersByTime(300);

    const bubble = document.querySelector('.vol-rich-tooltip');
    expect(bubble?.classList.contains('vol-rich-tooltip--visible')).toBeFalsy();
  });

  it('setContent görünen içeriği günceller', () => {
    const target = document.createElement('button');
    const tooltip = track(new RichTooltip(target, { title: 'Eski' }));

    tooltip.setContent({ title: 'Yeni' });
    // bubble henüz DOM'a eklenmedi (show() çağrılmadı) ama içerik güncellenmeli.
    // renderContent element referansı üzerinden çalışır, doğrudan sorgula.
    expect(
      (tooltip as unknown as { bubble: HTMLDivElement }).bubble.querySelector(
        '.vol-rich-tooltip__title',
      )?.textContent,
    ).toBe('Yeni');
  });

  it('destroy tüm target listenerlarini temizler', () => {
    const target = document.createElement('button');
    const tooltip = new RichTooltip(target, { title: 'X' });
    const removeListener = vi.spyOn(target, 'removeEventListener');

    tooltip.destroy();
    expect(removeListener).toHaveBeenCalledWith('mouseenter', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('mouseleave', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('blur', expect.any(Function));
  });
});
