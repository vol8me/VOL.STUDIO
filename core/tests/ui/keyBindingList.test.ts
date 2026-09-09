import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { KeyBindingList, type KeyBindingRow } from '../../src/ui/controls/KeyBindingList';
import { i18n, i18next } from '../../src/systems/I18n';

const ROWS: KeyBindingRow[] = [
  { action: 'dash', label: 'Atılım', binding: { source: 'key', keyCode: 32 } },
  { action: 'fire', label: 'Ateş', binding: { source: 'pointerButton', button: 'left' } },
];

function bindingButtons(list: KeyBindingList): HTMLButtonElement[] {
  return [...list.element.querySelectorAll<HTMLButtonElement>('.vol-key-bindings__binding')];
}

describe('KeyBindingList', () => {
  beforeAll(async () => {
    await i18n.init();
  }, 60_000);

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('her eylemi etiketi ve okunur bağıyla çizer', () => {
    const list = new KeyBindingList({ rows: ROWS, onRebind: vi.fn() });
    expect(list.element.querySelectorAll('.vol-key-bindings__row')).toHaveLength(2);
    expect(bindingButtons(list)[0].textContent).toBe('Space');
    expect(bindingButtons(list)[1].textContent).toBe('LMB');
    list.destroy();
  });

  it('düğmeye basınca dinlemeye geçer', () => {
    const list = new KeyBindingList({ rows: ROWS, onRebind: vi.fn() });
    bindingButtons(list)[0].click();
    expect(list.isCapturing()).toBe(true);
    expect(bindingButtons(list)[0].dataset.capturing).toBe('true');
    list.destroy();
  });

  it('yakalanan tuşu niyet olarak bildirir; KENDİ defterini tutmaz', () => {
    const onRebind = vi.fn();
    const list = new KeyBindingList({ rows: ROWS, onRebind });

    bindingButtons(list)[0].click();
    window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 81, bubbles: true }));

    expect(onRebind).toHaveBeenCalledWith('dash', { source: 'key', keyCode: 81 });
    // Görüntü DEĞİŞMEDİ: yeni durumu çağıran `setRows` ile verir.
    expect(bindingButtons(list)[0].textContent).toBe('Space');
    expect(list.isCapturing()).toBe(false);
    list.destroy();
  });

  /* Esc bir tuş atama ekranından çıkışın evrensel yoludur; bağlanmaz. */
  it('Esc yakalamayı İPTAL eder, Esc`e bağlamaz', () => {
    const onRebind = vi.fn();
    const list = new KeyBindingList({ rows: ROWS, onRebind });

    bindingButtons(list)[0].click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onRebind).not.toHaveBeenCalled();
    expect(list.isCapturing()).toBe(false);
    list.destroy();
  });

  it('setRows çağrıldığında yeni bağı çizer', () => {
    const list = new KeyBindingList({ rows: ROWS, onRebind: vi.fn() });
    list.setRows([{ ...ROWS[0], binding: { source: 'key', keyCode: 81 } }, ROWS[1]]);
    expect(bindingButtons(list)[0].textContent).toBe('Q');
    list.destroy();
  });

  it('editable olmayan satır devre dışıdır', () => {
    const list = new KeyBindingList({
      rows: [{ ...ROWS[0], editable: false }],
      onRebind: vi.fn(),
    });
    expect(bindingButtons(list)[0].disabled).toBe(true);
    list.destroy();
  });

  it('onReset verilmezse sıfırlama düğmesi çizilmez', () => {
    const without = new KeyBindingList({ rows: ROWS, onRebind: vi.fn() });
    expect(without.element.querySelectorAll('.vol-key-bindings__reset')).toHaveLength(0);
    without.destroy();

    const onReset = vi.fn();
    const withReset = new KeyBindingList({ rows: ROWS, onRebind: vi.fn(), onReset });
    const buttons = withReset.element.querySelectorAll<HTMLButtonElement>(
      '.vol-key-bindings__reset',
    );
    expect(buttons).toHaveLength(2);
    buttons[0].click();
    expect(onReset).toHaveBeenCalledWith('dash');
    withReset.destroy();
  });

  it('formatBinding oyunun kendi kelimesini yazdırır', () => {
    const list = new KeyBindingList({
      rows: ROWS,
      onRebind: vi.fn(),
      formatBinding: () => 'ÖZEL',
    });
    expect(bindingButtons(list)[0].textContent).toBe('ÖZEL');
    list.destroy();
  });

  /*
   * Yakalama sırasında basılan tuş sayfadaki başka bir kısayola GİTMEMELİDİR;
   * dinleyici `capture: true` ile kurulur ve olayı tüketir.
   */
  it('yakalama sırasında olayı akıştan alır', () => {
    const list = new KeyBindingList({ rows: ROWS, onRebind: vi.fn() });
    bindingButtons(list)[0].click();

    const event = new KeyboardEvent('keydown', { keyCode: 81, bubbles: true, cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    list.destroy();
  });

  /* Listener eklenen her yerde kaldırılır (AGENTS Kural 6). */
  it('destroy dinleyicileri ve elemanı toplar', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const off = vi.spyOn(i18next, 'off');
    const list = new KeyBindingList({ rows: ROWS, onRebind: vi.fn() });

    bindingButtons(list)[0].click();
    document.body.appendChild(list.element);
    list.destroy();

    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    expect(off).toHaveBeenCalledWith('languageChanged', expect.any(Function));
    expect(list.element.parentElement).toBeNull();
    remove.mockRestore();
    off.mockRestore();
  });
});
