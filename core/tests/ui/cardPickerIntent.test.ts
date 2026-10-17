import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LevelUpPicker } from '../../src/ui/cards/LevelUpPicker';
import { ShopPicker } from '../../src/ui/cards/ShopPicker';
import { type CardTileData } from '../../src/ui/cards/CardTile';
import { FocusNavController } from '../../src/ui/focus/FocusNavController';
import { listFocusable } from '../../src/ui/focus/focusable';
import { triggerBack } from '../../src/platform/backNavigation';
import { Modal } from '../../src/ui/overlays/Modal';

const cards: CardTileData[] = [
  { id: 'a', title: 'A', description: 'A', rarity: 'rare' },
  { id: 'b', title: 'B', description: 'B', rarity: 'rare' },
];

function button(picker: LevelUpPicker | ShopPicker): HTMLButtonElement {
  return picker.element.querySelector<HTMLButtonElement>('.vol-card__action')!;
}

function place(element: HTMLElement): void {
  element.getBoundingClientRect = () => ({ x: 0, y: 0, width: 100, height: 40 }) as DOMRect;
}

function key(
  target: EventTarget,
  type: 'keydown' | 'keyup',
  value: string,
  repeat = false,
): KeyboardEvent {
  const event = new KeyboardEvent(type, { key: value, repeat, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function press(target: HTMLButtonElement, value = 'Enter'): void {
  // jsdom native buton aktivasyonu üretmez; yalnız tüketilmemiş olayın
  // tarayıcıdaki varsayılan click adımı burada canlandırılır.
  const down = key(target, 'keydown', value);
  if (value === 'Enter' && !down.defaultPrevented) target.click();
  const up = key(target.isConnected ? target : document.activeElement!, 'keyup', value);
  if (value === ' ' && !up.defaultPrevented) target.click();
}

function pointer(target: HTMLElement, type: 'pointerdown' | 'pointerup' | 'pointercancel'): void {
  target.dispatchEvent(
    new PointerEvent(type, { pointerId: 1, button: 0, bubbles: true, cancelable: true }),
  );
}

function click(target: HTMLButtonElement): void {
  pointer(target, 'pointerdown');
  pointer(target, 'pointerup');
  target.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true, cancelable: true }));
}

describe('CardPicker taze seçim niyeti', () => {
  let picker: LevelUpPicker;
  let selected: string[];

  beforeEach(() => {
    document.body.innerHTML = '';
    selected = [];
    picker = new LevelUpPicker({
      selectLabel: 'Seç',
      requireFreshActivation: true,
      onSelect: (id) => selected.push(id),
    });
    document.body.appendChild(picker.element);
  });

  afterEach(() => {
    picker.destroy();
    document.body.innerHTML = '';
  });

  it.each(['Enter', ' '])(
    'önceki yüzeyde tutulan %s kartta tekrar veya bırakışla seçmez',
    (value) => {
      key(document, 'keydown', value);
      picker.present(cards);
      const target = button(picker);
      const down = key(target, 'keydown', value, true);
      if (!down.defaultPrevented && value === 'Enter') target.click();
      const up = key(target, 'keyup', value);
      if (!up.defaultPrevented && value === ' ') target.click();
      expect(selected).toEqual([]);
      press(target, value);
      expect(selected).toEqual(['a']);
    },
  );

  it('önceki yüzeyde pointerdown ve kartta pointerup/click seçim yapmaz', () => {
    pointer(document.body, 'pointerdown');
    picker.present(cards);
    pointer(button(picker), 'pointerup');
    button(picker).dispatchEvent(
      new MouseEvent('click', { detail: 1, bubbles: true, cancelable: true }),
    );
    expect(selected).toEqual([]);
    click(button(picker));
    expect(selected).toEqual(['a']);
  });

  it('kanıtsız programatik click seçmez', () => {
    picker.present(cards);
    button(picker).click();
    expect(selected).toEqual([]);
  });

  it('paneldeki metin düzenlemesinin Enter ve Space olaylarını devralmaz', () => {
    picker.present(cards);
    const input = document.createElement('input');
    picker.element.appendChild(input);
    input.focus();
    expect(key(input, 'keydown', ' ').defaultPrevented).toBe(false);
    expect(key(input, 'keyup', ' ').defaultPrevented).toBe(false);
    expect(key(input, 'keydown', 'Enter').defaultPrevented).toBe(false);
    expect(key(input, 'keyup', 'Enter').defaultPrevented).toBe(false);
    expect(selected).toEqual([]);
  });

  it('paneldeki native range click davranışını seçim kapısına bağlamaz', () => {
    picker.present(cards);
    const input = document.createElement('input');
    input.type = 'range';
    picker.element.appendChild(input);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(selected).toEqual([]);
  });

  it('Space dışarıda bırakılınca eski seçim izni sonraki keyup olayına taşınmaz', () => {
    picker.present(cards);
    const target = button(picker);
    key(target, 'keydown', ' ');
    key(document, 'keyup', ' ');
    key(target, 'keyup', ' ');
    expect(selected).toEqual([]);
    press(target, ' ');
    expect(selected).toEqual(['a']);
  });

  it.each(['Enter', ' '])('UI→UI sunumda aynı %s jesti yeni kartı seçmez', (value) => {
    picker.destroy();
    picker = new LevelUpPicker({
      selectLabel: 'Seç',
      requireFreshActivation: true,
      onSelect: (id) => {
        selected.push(id);
        picker.present([cards[1]]);
      },
    });
    document.body.appendChild(picker.element);
    picker.present([cards[0]]);
    press(button(picker), value);
    expect(selected).toEqual(['a']);
    const target = button(picker);
    key(target, 'keydown', value, true);
    target.click();
    key(target, 'keyup', value);
    expect(selected).toEqual(['a']);
    press(target, value);
    expect(selected).toEqual(['a', 'b']);
  });

  it('show yeniden çağrılınca eski pointerdown yeni generation için kullanılamaz', () => {
    picker.present(cards);
    const target = button(picker);
    pointer(target, 'pointerdown');
    picker.show();
    pointer(target, 'pointerup');
    target.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true, cancelable: true }));
    expect(selected).toEqual([]);
    click(target);
    expect(selected).toEqual(['a']);
  });

  it('pointercancel seçim iznini kaldırır', () => {
    picker.present(cards);
    const target = button(picker);
    pointer(target, 'pointerdown');
    pointer(target, 'pointercancel');
    pointer(target, 'pointerup');
    target.click();
    expect(selected).toEqual([]);
  });

  it('farklı butonda bırakılan pointer seçmez', () => {
    picker.present(cards);
    pointer(button(picker), 'pointerdown');
    const second = picker.element.querySelectorAll<HTMLButtonElement>('.vol-card__action')[1];
    pointer(second, 'pointerup');
    second.click();
    expect(selected).toEqual([]);
  });

  it('gizlendikten sonra eski pointer izni seçim yapmaz', () => {
    picker.present(cards);
    const target = button(picker);
    pointer(target, 'pointerdown');
    pointer(target, 'pointerup');
    picker.hide();
    target.click();
    expect(selected).toEqual([]);
  });

  it('koldan bilinçli A niyeti aynı senkron click için izin verir', () => {
    picker.present(cards);
    for (const target of picker.element.querySelectorAll<HTMLElement>('button')) place(target);
    place(picker.element);
    const nav = new FocusNavController();
    nav.activate();
    expect(selected).toEqual(['a']);
    nav.destroy();
  });

  it('kol niyeti iptal edilirse seçim üretilmez', () => {
    picker.present(cards);
    place(picker.element);
    place(button(picker));
    button(picker).addEventListener('vol:focusactivate', (event) => event.preventDefault());
    const nav = new FocusNavController();
    nav.activate();
    expect(selected).toEqual([]);
    nav.destroy();
  });

  it('aynı kol aktivasyonu içinde callback yeni karta tekrar activate yapamaz', () => {
    picker.destroy();
    const nav = new FocusNavController();
    picker = new LevelUpPicker({
      selectLabel: 'Seç',
      requireFreshActivation: true,
      onSelect: (id) => {
        selected.push(id);
        if (id === 'a') {
          picker.present([cards[1]]);
          place(button(picker));
          nav.activate();
        }
      },
    });
    document.body.appendChild(picker.element);
    picker.present([cards[0]]);
    place(button(picker));
    nav.activate();
    expect(selected).toEqual(['a']);
    nav.activate();
    expect(selected).toEqual(['a', 'b']);
    nav.destroy();
  });

  it('varsayılan picker programatik click sözleşmesini korur', () => {
    picker.destroy();
    picker = new LevelUpPicker({ selectLabel: 'Seç', onSelect: (id) => selected.push(id) });
    document.body.appendChild(picker.element);
    picker.present(cards);
    button(picker).click();
    expect(selected).toEqual(['a']);
    expect(picker.element.hasAttribute('aria-modal')).toBe(false);
  });
});

describe('CardPicker opt-in modal sınırı', () => {
  let picker: LevelUpPicker;
  let outside: HTMLButtonElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    outside = document.createElement('button');
    place(outside);
    document.body.appendChild(outside);
    outside.focus();
    picker = new LevelUpPicker({ selectLabel: 'Seç', modal: true, onSelect: () => {} });
    document.body.appendChild(picker.element);
    place(picker.element);
    picker.present(cards);
    for (const target of picker.element.querySelectorAll<HTMLElement>('button')) place(target);
  });

  afterEach(() => {
    picker.destroy();
    document.body.innerHTML = '';
  });

  it('modal adayları yalnız paneldeki butonlardır', () => {
    expect(picker.element.getAttribute('aria-modal')).toBe('true');
    expect(listFocusable()).not.toContain(outside);
    expect(listFocusable()).toHaveLength(2);
  });

  it('Tab son butondan ilkine, Shift+Tab ilkten sona döner', () => {
    const [first, last] = picker.element.querySelectorAll<HTMLButtonElement>('button');
    last.focus();
    last.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(first);
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(last);
  });

  it('dışarıdan programatik odak panel içine geri alınır', () => {
    outside.focus();
    expect(document.activeElement).toBe(button(picker));
  });

  it('zorunlu seçim geri ile kapanmaz ve alttaki geri işleyicisine düşmez', () => {
    expect(triggerBack()).toBe(true);
    expect(picker.isVisible()).toBe(true);
  });

  it('hideImmediately odağı geri verir ve inert adaylarını kaldırır', () => {
    picker.hideImmediately();
    expect(picker.element.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(outside);
    expect(listFocusable()).toEqual([outside]);
    expect(triggerBack()).toBe(false);
  });

  it('animasyonlu hide paneli hemen inert yapar ve back sahipliğini bırakır', () => {
    picker.hide();
    expect(picker.element.hidden).toBe(false);
    expect(picker.element.hasAttribute('inert')).toBe(true);
    expect(listFocusable()).toEqual([outside]);
    expect(triggerBack()).toBe(false);
  });

  it('destroy focus trap ve back handler kaynaklarını kaldırır', () => {
    picker.destroy();
    outside.focus();
    expect(document.activeElement).toBe(outside);
    expect(triggerBack()).toBe(false);
  });

  it('üst Modal odağı ve geri alır, kapanınca kart modalına geri döner', () => {
    const modal = new Modal();
    const topButton = document.createElement('button');
    place(topButton);
    modal.add({ element: topButton });
    document.body.appendChild(modal.element);
    modal.open();
    expect(document.activeElement).toBe(topButton);
    expect(triggerBack()).toBe(true);
    expect(modal.isOpen()).toBe(false);
    expect(picker.isVisible()).toBe(true);
    expect(document.activeElement).toBe(button(picker));
    modal.destroy();
  });

  it('modal shop geri yoluyla kendi kapanma akışını çalıştırır', () => {
    picker.hideImmediately();
    let closed = 0;
    const shop = new ShopPicker({
      modal: true,
      labels: {
        buy: 'Al',
        owned: 'Var',
        tooExpensive: 'Yetersiz',
        abilitiesTitle: 'Yetenek',
        passivesTitle: 'Pasif',
        empty: 'Boş',
        close: 'Devam',
      },
      onBuy: () => {},
      onSell: () => {},
      onClose: () => closed++,
    });
    document.body.appendChild(shop.element);
    shop.present({ offers: [], abilities: [], passives: [], balanceLabel: '0' });
    expect(document.activeElement).toBe(shop.element.querySelector('.vol-card-shop__close'));
    expect(triggerBack()).toBe(true);
    expect(closed).toBe(1);
    expect(shop.isVisible()).toBe(false);
    shop.destroy();
  });
});
