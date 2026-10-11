import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisposableScope } from '@volstudio/core/lifecycle';
import type * as AppSound from '../../src/appSound';

const play = vi.fn();
vi.mock('../../src/appSound', async (importOriginal) => ({
  ...(await importOriginal<typeof AppSound>()),
  getAppSoundKit: () => ({ play }),
}));

import { buildXPBarCard } from '../../src/sections/hudFeedbackCards';
import { buildTouchTab } from '../../src/sections/touchTab';

/**
 * Host kararı olan ses olayları (`reward`, `levelUp`, `equip`): çekirdek bileşen bunları bilemez,
 * vitrin oyun mantığını taklit ederek bağlar. Burada tek tek, gerçek bileşen etkileşimiyle sınanır.
 */
beforeEach(() => play.mockClear());
afterEach(() => document.body.replaceChildren());

describe('XP kazanımı: ödül ve seviye atlama', () => {
  function xpCard() {
    const scope = new DisposableScope();
    const card = buildXPBarCard(scope);
    document.body.append(card);
    const buttons = [
      ...card.querySelectorAll<HTMLButtonElement>('.vol-showcase-panel-demo__controls button'),
    ];
    return { scope, buttons };
  }

  it('seviye atlatmayan kazanım `reward`, atlatan `levelUp` çalar (ikisi birden değil)', () => {
    const { scope, buttons } = xpCard();
    expect(buttons).toHaveLength(3);
    buttons[0].click(); // +20 XP: 75 gereken seviyeyi geçmez
    expect(play.mock.calls).toEqual([['reward']]);
    play.mockClear();
    buttons[1].click(); // +150 XP: seviye atlar
    expect(play.mock.calls).toEqual([['levelUp']]);
    play.mockClear();
    buttons[2].click(); // +2000 XP: ÇOK seviye atlar; yine tek `levelUp` (seviye başına ses yağmaz)
    expect(play.mock.calls).toEqual([['levelUp']]);
    scope.dispose();
  });
});

describe('Envanter: kısayol çubuğuna bırakma kuşanmadır', () => {
  function inventory() {
    const tab = buildTouchTab();
    document.body.append(tab.element);
    const grid = tab.element.querySelector<HTMLElement>('.vol-slot-grid')!;
    const itemAt = (index: number): HTMLElement =>
      grid.querySelector<HTMLElement>(`.vol-slot-grid__item[data-slot-index="${index}"]`)!;
    const key = (target: HTMLElement, name: string): void => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
    };
    return { tab, itemAt, key };
  }

  it('alt satırdan ilk satıra taşıma `equip` çalar; satır içi taşıma çalmaz', () => {
    const { tab, itemAt, key } = inventory();
    const armor = itemAt(11);
    armor.focus();
    key(armor, ' ');
    key(armor, 'ArrowUp'); // 11 → 5: ilk satır, boş
    key(armor, ' ');
    expect(play.mock.calls).toEqual([['equip']]);

    play.mockClear();
    const placed = itemAt(5);
    placed.focus();
    key(placed, ' ');
    key(placed, 'ArrowLeft'); // 5 → 4: yine ilk satır, ama kısayol çubuğundan çıkmıyor
    key(placed, ' ');
    expect(play.mock.calls.filter(([event]) => event === 'equip')).toEqual([]);
    tab.destroy();
  });
});
