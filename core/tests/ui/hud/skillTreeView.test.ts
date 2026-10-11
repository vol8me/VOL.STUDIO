import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '../../../src/i18n/I18n';
import { SkillTree, type SkillNodeDefinition } from '../../../src/ui/hud/SkillTree';

/**
 * UI-08.3: yakınlaştırılabilir SkillTree'nin tekerlek/sürükleme dışı yolları. Klavye (`+ - 0 Home`, oklar), görünüm denetim
 * düğmeleri ve düğüm klavyesi aynı yakınlaştırma/kaydırmayı çağırır; tekerlek sınırda sayfayı kaydırmaya bırakır; kaydırma
 * ilk birincil işaretçiye aittir. Gerçek yerleşimde sonuç `devtools/vol-showcase/tests/e2e/hudInteraction.spec.ts`tedir.
 */
const nodes: SkillNodeDefinition[] = [
  { id: 'root', label: 'Kök', x: 0, y: 0 },
  { id: 'power', label: 'Güç', x: 0, y: 1, requires: ['root'] },
  { id: 'speed', label: 'Hız', x: 2, y: 1, requires: ['root'] },
];

const tracked: SkillTree[] = [];
function mount(options: Partial<ConstructorParameters<typeof SkillTree>[0]> = {}): SkillTree {
  const tree = new SkillTree({ nodes, zoomable: true, ...options });
  tracked.push(tree);
  document.body.append(tree.element);
  tree.setStates({ root: 'unlocked', power: 'available', speed: 'locked' });
  return tree;
}
afterEach(async () => {
  while (tracked.length > 0) tracked.pop()!.destroy();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  await i18next.changeLanguage('tr');
});

const part = (tree: SkillTree, selector: string): HTMLElement =>
  tree.element.querySelector<HTMLElement>(selector)!;
const transform = (tree: SkillTree): string =>
  part(tree, '.vol-skill-tree__canvas').style.transform;
const key = (target: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};
const control = (tree: SkillTree, name: string): HTMLButtonElement =>
  tree.element.querySelector<HTMLButtonElement>(`.vol-skill-tree__control[aria-label="${name}"]`)!;
const pointer = (target: Element, type: string, init: PointerEventInit): void => {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: 0, clientY: 0, ...init }));
};

describe('SkillTree klavye görünümü', () => {
  it('SkillTree görünüm odaktayken + - 0 yakınlaştırır ve sıfırlar; ok kaydırır', () => {
    const tree = mount();
    const viewport = part(tree, '.vol-skill-tree__viewport');
    expect(viewport.tabIndex).toBe(0);
    expect(viewport.getAttribute('aria-keyshortcuts')).toContain('Plus');
    expect(key(viewport, '+').defaultPrevented).toBe(true);
    expect(transform(tree)).toContain('scale(1.1)');
    key(viewport, '-');
    key(viewport, '-');
    expect(transform(tree)).toContain('scale(0.9)');
    key(viewport, '0');
    expect(transform(tree)).toContain('scale(1)');
    // Ok sağa = görünüm sağa, içerik sola.
    key(viewport, 'ArrowRight');
    expect(transform(tree)).toContain('translate(-48px');
  });

  it('SkillTree düğüm odaktayken + - 0 çalışır, Shift+ok kaydırır, düz ok düğüm değiştirir', () => {
    const tree = mount();
    const power = part(tree, '.vol-skill-tree__node[data-node-id="power"]');
    power.focus();
    key(power, '+');
    expect(transform(tree)).toContain('scale(1.1)');
    key(power, '0');
    expect(transform(tree)).toContain('scale(1)');
    key(power, 'ArrowDown', { shiftKey: true });
    expect(transform(tree)).toContain('translate(0px, -48px)');
    key(power, 'ArrowUp');
    expect(document.activeElement).toBe(part(tree, '.vol-skill-tree__node[data-node-id="root"]'));
  });

  it('SkillTree düğümde Ctrl/Alt’lı tuşlar tarayıcıya bırakılır', () => {
    const tree = mount();
    const power = part(tree, '.vol-skill-tree__node[data-node-id="power"]');
    power.focus();
    expect(key(power, '+', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(transform(tree)).not.toContain('scale(1.1)');
  });

  it('SkillTree görünüme odak yokken düğümün içindeki tuş görünümü çalmaz', () => {
    const tree = mount();
    const viewport = part(tree, '.vol-skill-tree__viewport');
    const power = part(tree, '.vol-skill-tree__node[data-node-id="power"]');
    // Olay düğümden kabarsa bile görünüm yalnız kendisi hedefken işler (düğüm kendi kararını verir).
    key(power, 'ArrowRight');
    expect(transform(tree)).not.toContain('translate(-48px');
    expect(viewport.tabIndex).toBe(0);
  });
});

describe('SkillTree görünüm denetimleri', () => {
  it('SkillTree + − sıfırla düğmeleri aynı yakınlaştırmayı yapar, adlar çeviriden, durum okuyucuya duyulur', () => {
    const tree = mount();
    const zoomIn = control(tree, i18next.t('core:skillTree.zoomIn'));
    const zoomOut = control(tree, i18next.t('core:skillTree.zoomOut'));
    const reset = control(tree, i18next.t('core:skillTree.resetView'));
    expect([zoomIn, zoomOut, reset].every(Boolean)).toBe(true);
    zoomIn.click();
    expect(transform(tree)).toContain('scale(1.1)');
    expect(part(tree, '[role="status"]').textContent).toBe(
      i18next.t('core:skillTree.zoomLevel', { percent: 110 }),
    );
    zoomOut.click();
    zoomOut.click();
    expect(transform(tree)).toContain('scale(0.9)');
    reset.click();
    expect(transform(tree)).toContain('scale(1)');
  });

  it('SkillTree sınırda düğme aria-disabled olur ama odağı kaybettirecek şekilde disabled olmaz', () => {
    const tree = mount();
    const zoomIn = control(tree, i18next.t('core:skillTree.zoomIn'));
    for (let i = 0; i < 12; i++) zoomIn.click();
    expect(transform(tree)).toContain('scale(2)');
    expect(zoomIn.getAttribute('aria-disabled')).toBe('true');
    expect(zoomIn.disabled).toBe(false);
    const zoomOut = control(tree, i18next.t('core:skillTree.zoomOut'));
    expect(zoomOut.getAttribute('aria-disabled')).toBe('false');
  });

  it('SkillTree zoomable olmayan ağaçta görünüm denetimi ve odaklanabilir görünüm yoktur', () => {
    const tree = mount({ zoomable: false });
    expect(tree.element.querySelector('.vol-skill-tree__controls')).toBeNull();
    expect(part(tree, '.vol-skill-tree__viewport').hasAttribute('tabindex')).toBe(false);
  });

  it('SkillTree dil değişince ad, düğüm durumu ve denetim adları yenilenir', async () => {
    const tree = mount();
    await i18next.changeLanguage('en');
    expect(tree.element.getAttribute('aria-label')).toBe('Skill tree');
    expect(
      part(tree, '.vol-skill-tree__node[data-node-id="speed"]').getAttribute('aria-label'),
    ).toBe('Hız, locked');
    expect(control(tree, 'Zoom in')).not.toBeNull();
    expect(part(tree, '.vol-skill-tree__controls').getAttribute('aria-label')).toBe(
      'View controls',
    );
  });

  it('SkillTree ariaLabel verilirse dil değişse de korunur', async () => {
    const tree = mount({ ariaLabel: 'Savaşçı ağacı' });
    await i18next.changeLanguage('en');
    expect(tree.element.getAttribute('aria-label')).toBe('Savaşçı ağacı');
  });
});

describe('SkillTree tekerlek ve işaretçi', () => {
  const wheel = (target: Element, deltaY: number): WheelEvent => {
    const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  it('SkillTree tekerlek sınırda sayfayı kaydırmaya bırakır, sınır içinde yakınlaştırmayı yutar', () => {
    const tree = mount();
    const viewport = part(tree, '.vol-skill-tree__viewport');
    expect(wheel(viewport, -100).defaultPrevented).toBe(true);
    for (let i = 0; i < 20; i++) wheel(viewport, -100);
    expect(transform(tree)).toContain('scale(2)');
    expect(wheel(viewport, -100).defaultPrevented).toBe(false);
    for (let i = 0; i < 30; i++) wheel(viewport, 100);
    expect(transform(tree)).toContain('scale(0.5)');
    expect(wheel(viewport, 100).defaultPrevented).toBe(false);
  });

  it('SkillTree kaydırma ilk birincil işaretçiye aittir; ikinci parmak devralmaz, iptal temizler', () => {
    const tree = mount();
    const viewport = part(tree, '.vol-skill-tree__viewport');
    viewport.setPointerCapture = vi.fn();
    viewport.releasePointerCapture = vi.fn();
    pointer(viewport, 'pointerdown', { pointerId: 1, isPrimary: true, clientX: 10, clientY: 10 });
    expect(viewport.classList.contains('vol-skill-tree__viewport--panning')).toBe(true);
    // İkinci işaretçi (birincil değil) ne başlatır ne taşır.
    pointer(viewport, 'pointerdown', {
      pointerId: 2,
      isPrimary: false,
      clientX: 200,
      clientY: 200,
    });
    pointer(viewport, 'pointermove', {
      pointerId: 2,
      isPrimary: false,
      clientX: 300,
      clientY: 300,
    });
    expect(transform(tree)).not.toContain('300');
    pointer(viewport, 'pointermove', { pointerId: 1, isPrimary: true, clientX: 30, clientY: 25 });
    expect(transform(tree)).toContain('translate(20px, 15px)');
    pointer(viewport, 'pointercancel', { pointerId: 1, isPrimary: true });
    expect(viewport.classList.contains('vol-skill-tree__viewport--panning')).toBe(false);
    // İptalden sonra yeni hareket görünümü taşımaz.
    pointer(viewport, 'pointermove', { pointerId: 1, isPrimary: true, clientX: 90, clientY: 90 });
    expect(transform(tree)).toContain('translate(20px, 15px)');
  });

  it('SkillTree birincil olmayan işaretçi (ikinci parmak) tek başına kaydırma başlatmaz', () => {
    const tree = mount();
    const viewport = part(tree, '.vol-skill-tree__viewport');
    viewport.setPointerCapture = vi.fn();
    pointer(viewport, 'pointerdown', { pointerId: 5, isPrimary: false, pointerType: 'touch' });
    expect(viewport.classList.contains('vol-skill-tree__viewport--panning')).toBe(false);
  });

  it('SkillTree fare sağ düğmesi kaydırma başlatmaz', () => {
    const tree = mount();
    const viewport = part(tree, '.vol-skill-tree__viewport');
    viewport.setPointerCapture = vi.fn();
    pointer(viewport, 'pointerdown', {
      pointerId: 1,
      isPrimary: true,
      pointerType: 'mouse',
      button: 2,
    });
    expect(viewport.classList.contains('vol-skill-tree__viewport--panning')).toBe(false);
  });
});

describe('SkillTree hareket azaltma', () => {
  it('SkillTree bağlantı dolumu animasyonsuz, doğrudan son durumda görünür', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const tree = mount();
    tree.setStates({ root: 'unlocked', power: 'unlocked', speed: 'locked' });
    const line = tree.element.querySelector<SVGLineElement>(
      '.vol-skill-tree__connection[data-to="power"]',
    )!;
    expect(line.classList.contains('vol-skill-tree__connection--active')).toBe(true);
    expect(line.classList.contains('vol-skill-tree__connection--filling')).toBe(false);
    expect(line.style.strokeDasharray).toBe('');
  });

  it('SkillTree hareket serbestken bağlantı dolumu animasyonla başlar', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const tree = mount();
    tree.setStates({ root: 'unlocked', power: 'unlocked', speed: 'locked' });
    const line = tree.element.querySelector<SVGLineElement>(
      '.vol-skill-tree__connection[data-to="power"]',
    )!;
    expect(line.classList.contains('vol-skill-tree__connection--filling')).toBe(true);
  });
});
