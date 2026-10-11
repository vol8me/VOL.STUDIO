import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '../../../src/i18n/I18n';
import { uiIntentBusFor, type UiIntent } from '../../../src/ui/feedback/uiIntent';
import { ActionBar } from '../../../src/ui/hud/ActionBar';
import { BuildMenu, type BuildMenuItem } from '../../../src/ui/hud/BuildMenu';
import { SkillTree, type SkillNodeDefinition } from '../../../src/ui/hud/SkillTree';

/**
 * UI-08.3: kullanılamaz eylem sözleşmesi. Bekleyen / nedenli kullanılamaz / kilitli öğe `disabled` değildir: odaklanabilir
 * kalır, nedeni söylenir (balon ya da `aria-description`), etkinleştirme eylem çalıştırmaz ve tek `reject` niyeti üretir.
 * Kullanılabilir öğe tek `press`/`toggle`/`select` niyeti üretir; programatik değişiklikler sessizdir.
 */
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!();
  document.body.replaceChildren();
  document.documentElement.removeAttribute('dir');
  vi.useRealTimers();
});

function mount(...children: HTMLElement[]) {
  const root = document.createElement('div');
  document.body.append(root);
  const handle = uiIntentBusFor(root);
  const seen: UiIntent[] = [];
  handle.bus.subscribe({ onIntent: (intent) => seen.push(intent) });
  root.append(...children);
  cleanups.push(handle.release);
  return { root, seen };
}

const kinds = (seen: UiIntent[]): string[] =>
  seen.map((intent) => `${intent.kind}:${intent.origin}`);
const key = (target: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};
const buttons = (root: Element): HTMLButtonElement[] => [
  ...root.querySelectorAll<HTMLButtonElement>('button'),
];
const bubbleText = (): string =>
  document.querySelector('[role="tooltip"].vol-tooltip--visible')?.textContent ?? '';

describe('ActionBar kullanılamaz slot', () => {
  function bar(overrides: Partial<ConstructorParameters<typeof ActionBar>[0]> = {}) {
    const onActivate = vi.fn();
    const onBlocked = vi.fn();
    const instance = new ActionBar({
      slots: [
        { id: 'a', label: 'Ateş', shortcut: '1' },
        { id: 'b', label: 'Buz', shortcut: '2' },
        { id: 'c', label: 'Çarpma', shortcut: '3' },
      ],
      onActivate,
      onBlocked,
      ...overrides,
    });
    cleanups.push(() => instance.destroy());
    const view = mount(instance.element);
    return { instance, onActivate, onBlocked, ...view };
  }

  it('ActionBar kökü toolbar; tek sekme durağı, oklar/Home/End slotlar arasında gezinir', () => {
    const { root } = bar();
    const toolbar = root.querySelector('.vol-action-bar')!;
    expect(toolbar.getAttribute('role')).toBe('toolbar');
    expect(toolbar.getAttribute('aria-label')).toBe(i18next.t('core:actionBar.label'));
    const [a, b, c] = buttons(root);
    expect([a, b, c].map((x) => x.tabIndex)).toEqual([0, -1, -1]);
    a.focus();
    key(a, 'ArrowRight');
    expect(document.activeElement).toBe(b);
    expect([a, b, c].map((x) => x.tabIndex)).toEqual([-1, 0, -1]);
    key(b, 'End');
    expect(document.activeElement).toBe(c);
    key(c, 'Home');
    expect(document.activeElement).toBe(a);
  });

  it('ActionBar RTL okuma yönünde sağ ok bir önceki slota gider', () => {
    document.documentElement.setAttribute('dir', 'rtl');
    const { root } = bar();
    const [a, b] = buttons(root);
    b.focus();
    key(b, 'ArrowRight');
    expect(document.activeElement).toBe(a);
  });

  it('ActionBar bekleyen slot odaklanabilir kalır; basış onActivate çağırmaz, reject niyeti + onBlocked verir', () => {
    const { root, instance, onActivate, onBlocked, seen } = bar();
    instance.setCooldown('b', 0.5, 4);
    const b = buttons(root)[1];
    expect(b.disabled).toBe(false);
    expect(b.getAttribute('aria-disabled')).toBe('true');
    b.focus();
    expect(document.activeElement).toBe(b);
    b.click();
    expect(onActivate).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledWith('b', 'cooldown');
    expect(kinds(seen)).toEqual(['reject:ActionBar']);
    // Soğuma bitince aynı slot normal çalışır.
    instance.setCooldown('b', 0);
    expect(b.hasAttribute('aria-disabled') && b.getAttribute('aria-disabled')).not.toBe('true');
    b.click();
    expect(onActivate).toHaveBeenCalledWith('b');
    expect(kinds(seen)).toEqual(['reject:ActionBar', 'press:ActionBar']);
  });

  it('ActionBar nedenli kullanılamaz slot: neden aria-description olur, reject + onBlocked("unavailable")', () => {
    const { root, instance, onActivate, onBlocked, seen } = bar();
    instance.setUnavailable('a', 'Yetersiz mana');
    const a = buttons(root)[0];
    expect(a.getAttribute('aria-disabled')).toBe('true');
    expect(a.getAttribute('aria-description')).toBe('Yetersiz mana');
    expect(a.classList.contains('vol-action-bar__slot--unavailable')).toBe(true);
    a.click();
    expect(onActivate).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledWith('a', 'unavailable');
    expect(kinds(seen)).toEqual(['reject:ActionBar']);
    instance.setUnavailable('a', null);
    expect(a.getAttribute('aria-disabled')).not.toBe('true');
    expect(a.hasAttribute('aria-description')).toBe(false);
    a.click();
    expect(onActivate).toHaveBeenCalledWith('a');
  });

  it('ActionBar kısayol tuşu bloklu slotta eylem çalıştırmaz, ctrl/alt/tekrar basışı yok sayılır', () => {
    const { instance, onActivate, onBlocked } = bar({ enableKeyboardShortcuts: true });
    instance.setUnavailable('a', 'Yetersiz mana');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    expect(onActivate).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledWith('a', 'unavailable');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', ctrlKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', repeat: true }));
    expect(onActivate).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith('b');
    instance.destroy();
  });

  it('ActionBar mod slotu toggle niyeti üretir; programatik setActive/setCooldown sessiz kalır', () => {
    const { root, instance, seen } = bar({
      slots: [{ id: 'mode', label: 'Mod', active: false }],
    });
    instance.setActive('mode', true);
    instance.setCooldown('mode', 0.2, 2);
    instance.setCooldown('mode', 0);
    expect(seen).toEqual([]);
    buttons(root)[0].click();
    expect(kinds(seen)).toEqual(['toggle:ActionBar']);
  });

  it('ActionBar balon: ad + kısayol + neden/kalan süre; dokunmada uzun basış açar, tıklamayı yutar', () => {
    vi.useFakeTimers();
    const { root, instance, onActivate } = bar({ showTooltips: true });
    instance.setCooldown('a', 0.5, 6);
    const a = buttons(root)[0];
    a.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerType: 'touch',
        isPrimary: true,
        bubbles: true,
        pointerId: 3,
      }),
    );
    vi.advanceTimersByTime(500);
    expect(bubbleText()).toContain('Ateş');
    expect(bubbleText()).toContain('[1]');
    expect(bubbleText()).toContain(i18next.t('core:actionBar.remaining', { seconds: 3 }));
    a.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerType: 'touch',
        isPrimary: true,
        bubbles: true,
        pointerId: 3,
      }),
    );
    a.click();
    expect(onActivate).not.toHaveBeenCalled();
    // Bekleme bitince kullanılamaz nedeni balona girer (bekleme, nedenden önce söylenir).
    instance.setCooldown('a', 0);
    instance.setUnavailable('a', 'Yetersiz mana');
    expect(bubbleText()).toContain('Yetersiz mana');
  });
});

describe('BuildMenu kullanılamaz öğe', () => {
  function menu(overrides: Partial<ConstructorParameters<typeof BuildMenu>[0]> = {}) {
    const onSelect = vi.fn();
    const onDeselect = vi.fn();
    const onBlocked = vi.fn();
    const items: BuildMenuItem[] = [
      { id: 'tower', label: 'Kule', icon: 'T', cost: '120', hotkey: 'Q', onSelect, onDeselect },
      { id: 'wall', label: 'Duvar', icon: 'W', cost: '20', hotkey: 'W', onSelect, onDeselect },
      { id: 'mine', label: 'Maden', icon: 'M', cost: '123456', onSelect, onDeselect },
    ];
    const instance = new BuildMenu({ items, onBlocked, ...overrides });
    cleanups.push(() => instance.destroy());
    const view = mount(instance.element);
    return { instance, onSelect, onDeselect, onBlocked, ...view };
  }

  it('BuildMenu tek sekme durağı; Home/End ilk/son, düzen yokken oklar DOM sırasıyla gezinir', () => {
    const { root } = menu();
    const [tower, wall, mine] = buttons(root);
    expect([tower, wall, mine].map((x) => x.tabIndex)).toEqual([0, -1, -1]);
    tower.focus();
    key(tower, 'ArrowRight');
    expect(document.activeElement).toBe(wall);
    key(wall, 'End');
    expect(document.activeElement).toBe(mine);
    key(mine, 'Home');
    expect(document.activeElement).toBe(tower);
    expect(key(tower, 'ArrowLeft').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(tower);
  });

  it('BuildMenu nedenli kullanılamaz öğe: seçilmez, reject + onBlocked(neden), odaklanabilir', () => {
    const { root, instance, onSelect, onBlocked, seen } = menu();
    instance.setItemUnavailable('tower', 'Yetersiz odun');
    const tower = buttons(root)[0];
    expect(tower.disabled).toBe(false);
    expect(tower.getAttribute('aria-disabled')).toBe('true');
    expect(tower.getAttribute('aria-description')).toBe('Yetersiz odun');
    tower.focus();
    tower.click();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledWith('tower', 'Yetersiz odun');
    expect(kinds(seen)).toEqual(['reject:BuildMenu']);
    expect(tower.getAttribute('aria-pressed')).toBe('false');
    instance.setItemUnavailable('tower', null);
    tower.click();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('BuildMenu seçim tek niyet: select, yeniden basış cancel; programatik selectItem sessiz', () => {
    const { root, instance, onSelect, onDeselect, seen } = menu();
    const [tower, wall] = buttons(root);
    tower.click();
    expect(kinds(seen)).toEqual(['select:BuildMenu']);
    tower.click();
    expect(kinds(seen)).toEqual(['select:BuildMenu', 'cancel:BuildMenu']);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onDeselect).toHaveBeenCalledTimes(1);
    instance.selectItem('wall');
    instance.clearSelection();
    expect(seen).toHaveLength(2);
    expect(wall.getAttribute('aria-pressed')).toBe('false');
  });

  it('BuildMenu showTooltips: yerel title kalkar, balon ad + kısayol + maliyet + neden taşır', () => {
    vi.useFakeTimers();
    const { root, instance } = menu({ showTooltips: true });
    instance.setItemUnavailable('tower', 'Yetersiz odun');
    const tower = buttons(root)[0];
    expect(tower.hasAttribute('title')).toBe(false);
    tower.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(1000);
    expect(bubbleText()).toContain('Kule');
    expect(bubbleText()).toContain('[Q]');
    expect(bubbleText()).toContain('120');
    expect(bubbleText()).toContain('Yetersiz odun');
  });

  it('BuildMenu altı haneli maliyet kutu içinde kalır ve kısayol rozetini örtmez (sınıf sözleşmesi)', () => {
    const { root } = menu();
    const mine = buttons(root)[2];
    const cost = mine.querySelector('.vol-build-menu__cost')!;
    expect(cost.textContent).toBe('123456');
    expect(mine.contains(cost)).toBe(true);
  });
});

describe('SkillTree kilitli düğüm', () => {
  const nodes: SkillNodeDefinition[] = [
    {
      id: 'root',
      label: 'Kök',
      x: 0,
      y: 0,
      description: 'Başlangıç',
      cost: [{ label: 'Puan', amount: 1 }],
    },
    { id: 'power', label: 'Güç', x: 0, y: 1, requires: ['root'], description: 'Hasar' },
    { id: 'speed', label: 'Hız', x: 2, y: 1, requires: ['root'] },
    { id: 'master', label: 'Usta', x: 1, y: 2, requires: ['power', 'speed'], description: 'Son' },
  ];

  function tree(overrides: Partial<ConstructorParameters<typeof SkillTree>[0]> = {}) {
    const onNodeClick = vi.fn();
    const instance = new SkillTree({ nodes, onNodeClick, ...overrides });
    cleanups.push(() => instance.destroy());
    const view = mount(instance.element);
    instance.setStates({ root: 'unlocked', power: 'available', speed: 'locked', master: 'locked' });
    return { instance, onNodeClick, ...view };
  }
  const nodeEl = (root: Element, id: string): HTMLButtonElement =>
    root.querySelector<HTMLButtonElement>(`.vol-skill-tree__node[data-node-id="${id}"]`)!;

  it('SkillTree kök group + ad; düğüm adı durum sözcüğünü taşır (renk tek taşıyıcı değil)', () => {
    const { root } = tree();
    const element = root.querySelector('.vol-skill-tree')!;
    expect(element.getAttribute('role')).toBe('group');
    expect(element.getAttribute('aria-label')).toBe(i18next.t('core:skillTree.label'));
    expect(nodeEl(root, 'root').getAttribute('aria-label')).toBe(
      `Kök, ${i18next.t('core:skillTree.unlocked')}`,
    );
    expect(nodeEl(root, 'power').getAttribute('aria-label')).toBe(
      `Güç, ${i18next.t('core:skillTree.available')}`,
    );
    expect(nodeEl(root, 'speed').getAttribute('aria-label')).toBe(
      `Hız, ${i18next.t('core:skillTree.locked')}`,
    );
  });

  it('SkillTree kilitli düğüm odaklanabilir, onNodeClick çağırmaz ve tek reject niyeti verir', () => {
    const { root, onNodeClick, seen } = tree();
    const speed = nodeEl(root, 'speed');
    expect(speed.disabled).toBe(false);
    expect(speed.getAttribute('aria-disabled')).toBe('true');
    speed.focus();
    expect(document.activeElement).toBe(speed);
    speed.click();
    expect(onNodeClick).not.toHaveBeenCalled();
    expect(kinds(seen)).toEqual(['reject:SkillTree']);
  });

  it('SkillTree açılabilir düğüm tek press niyeti + onNodeClick(id, durum) verir', () => {
    const { root, onNodeClick, seen } = tree();
    nodeEl(root, 'power').click();
    expect(onNodeClick).toHaveBeenCalledExactlyOnceWith('power', 'available');
    expect(kinds(seen)).toEqual(['press:SkillTree']);
  });

  it('SkillTree durum değişimi sessizdir ve ad/aria-disabled güncellenir (sunumda defter yok)', () => {
    const { root, instance, seen } = tree();
    instance.setStates({
      root: 'unlocked',
      power: 'unlocked',
      speed: 'available',
      master: 'locked',
    });
    expect(seen).toEqual([]);
    expect(nodeEl(root, 'speed').getAttribute('aria-disabled')).toBe('false');
    expect(nodeEl(root, 'power').getAttribute('aria-label')).toBe(
      `Güç, ${i18next.t('core:skillTree.unlocked')}`,
    );
    // Sunum katmanı puan/kilit defteri tutmaz: açma kararı yalnız çağıranındır.
    const api = Object.getOwnPropertyNames(Object.getPrototypeOf(instance));
    expect(api.filter((name) => /^(unlock|getUnlocked|points|gold|spend)/i.test(name))).toEqual([]);
  });

  it('SkillTree balon: kilitli düğümde eksik önkoşullar not olarak söylenir; kilitli tıklama balonu açar', () => {
    vi.useFakeTimers();
    const { root } = tree({ showTooltips: true });
    nodeEl(root, 'master').click();
    const bubble = document.querySelector('.vol-rich-tooltip.vol-rich-tooltip--visible');
    expect(bubble).not.toBeNull();
    const note = bubble!.querySelector('.vol-rich-tooltip__note')!.textContent;
    expect(note).toContain(i18next.t('core:skillTree.requires', { names: 'Güç, Hız' }));
  });

  it('SkillTree oklar görünen yerleşimde en yakın düğüme gider; tek sekme durağı', () => {
    const { root } = tree();
    const all = [...root.querySelectorAll<HTMLButtonElement>('.vol-skill-tree__node')];
    expect(all.filter((x) => x.tabIndex === 0)).toHaveLength(1);
    // Açılabilir düğüm (power) Tab'ın indiği düğümdür.
    expect(nodeEl(root, 'power').tabIndex).toBe(0);
    const power = nodeEl(root, 'power');
    power.focus();
    key(power, 'ArrowRight');
    expect(document.activeElement).toBe(nodeEl(root, 'speed'));
    key(nodeEl(root, 'speed'), 'ArrowUp');
    expect(document.activeElement).toBe(nodeEl(root, 'root'));
    key(nodeEl(root, 'root'), 'ArrowDown');
    expect(['power', 'speed']).toContain((document.activeElement as HTMLElement).dataset.nodeId);
    expect(
      nodeEl(root, 'root').tabIndex === 0 || (document.activeElement as HTMLElement).tabIndex === 0,
    ).toBe(true);
  });
});
