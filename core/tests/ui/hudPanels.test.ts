import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { BuildMenu, type BuildMenuItem } from '../../src/ui/hud/BuildMenu';
import { MinimapPanel } from '../../src/ui/hud/MinimapPanel';
import { SelectionInfoPanel } from '../../src/ui/hud/SelectionInfoPanel';
import { StatsPanel } from '../../src/ui/hud/StatsPanel';
import {
  SkillTree,
  resolveSkillStates,
  type SkillNodeDefinition,
} from '../../src/ui/hud/SkillTree';

const tracked: Array<{ destroy(): void }> = [];
function track<T extends { destroy(): void }>(instance: T): T {
  tracked.push(instance);
  return instance;
}
afterEach(() => {
  while (tracked.length > 0) tracked.pop()!.destroy();
  vi.useRealTimers();
});

// jsdom <canvas> için gerçek bir 2D rendering context implemente etmez
// (getContext('2d') her zaman null döner) — MinimapPanel bunu constructor'da
// zorunlu kılar (context yoksa throw eder). Testler için ihtiyaç duyulan
// tüm CanvasRenderingContext2D metotlarını no-op olarak stub'layan minimal
// bir sahte context sağlanır; gerçek piksel çıktısı test edilmez (bu
// component'in canvas API'sini doğru ÇAĞIRDIĞI, doğru piksel ÜRETTİĞİ değil,
// test edilir — pixel-level doğrulama headless bir tarayıcı gerektirir).
beforeAll(() => {
  const fakeContext = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 42 }),
    set fillStyle(_v: unknown) {},
    set strokeStyle(_v: unknown) {},
    set lineWidth(_v: unknown) {},
    set font(_v: unknown) {},
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    fakeContext as unknown as CanvasRenderingContext2D,
  );
});

describe('BuildMenu', () => {
  function makeItems(): BuildMenuItem[] {
    return [
      {
        id: 'tower',
        icon: 'T',
        label: 'Kule',
        cost: '50 Odun',
        hotkey: 'Q',
        onSelect: vi.fn(),
        onDeselect: vi.fn(),
      },
      { id: 'wall', icon: 'W', label: 'Duvar', disabled: true, onSelect: vi.fn() },
    ];
  }

  it('bir öğeye tıklamak seçer ve onSelect çağırır', () => {
    const items = makeItems();
    const menu = track(new BuildMenu({ items }));
    const button = menu.element.querySelector<HTMLButtonElement>('.vol-build-menu__item')!;

    button.click();
    expect(items[0].onSelect).toHaveBeenCalledTimes(1);
    expect(button.classList.contains('vol-build-menu__item--selected')).toBe(true);
  });

  it('seçili öğeye TEKRAR tıklamak seçimi iptal eder (toggle), onSelect tekrar çağrılmaz', () => {
    const items = makeItems();
    const menu = track(new BuildMenu({ items }));
    const button = menu.element.querySelector<HTMLButtonElement>('.vol-build-menu__item')!;

    button.click();
    button.click();

    expect(items[0].onSelect).toHaveBeenCalledTimes(1); // yalnızca ilk tıklamada
    expect(items[0].onDeselect).toHaveBeenCalledTimes(1);
    expect(button.classList.contains('vol-build-menu__item--selected')).toBe(false);
  });

  it('disabled öğe için buton disabled render edilir', () => {
    const menu = track(new BuildMenu({ items: makeItems() }));
    const buttons = menu.element.querySelectorAll<HTMLButtonElement>('.vol-build-menu__item');
    expect(buttons[1].disabled).toBe(true);
  });

  it('selectItem/clearSelection programatik olarak çalışır', () => {
    const items = makeItems();
    const menu = track(new BuildMenu({ items }));
    const button = menu.element.querySelector<HTMLButtonElement>('.vol-build-menu__item')!;

    menu.selectItem('tower');
    expect(button.classList.contains('vol-build-menu__item--selected')).toBe(true);

    menu.clearSelection();
    expect(button.classList.contains('vol-build-menu__item--selected')).toBe(false);
  });

  it('yeni bir öğe seçilince öncekinin seçimi otomatik kalkar', () => {
    const items: BuildMenuItem[] = [
      { id: 'a', icon: 'A', label: 'A', onSelect: vi.fn() },
      { id: 'b', icon: 'B', label: 'B', onSelect: vi.fn() },
    ];
    const menu = track(new BuildMenu({ items }));
    const buttons = menu.element.querySelectorAll<HTMLButtonElement>('.vol-build-menu__item');

    buttons[0].click();
    buttons[1].click();

    expect(buttons[0].classList.contains('vol-build-menu__item--selected')).toBe(false);
    expect(buttons[1].classList.contains('vol-build-menu__item--selected')).toBe(true);
  });

  it('destroy tüm click listenerlarini temizler', () => {
    const menu = new BuildMenu({ items: makeItems() });
    const button = menu.element.querySelector<HTMLButtonElement>('.vol-build-menu__item')!;
    const removeListener = vi.spyOn(button, 'removeEventListener');

    menu.destroy();
    expect(removeListener).toHaveBeenCalledWith('click', expect.any(Function));
  });
});

describe('MinimapPanel', () => {
  it('canvas tıklaması dünya koordinatını hesaplayıp onClick çağırır', () => {
    const onClick = vi.fn();
    const minimap = track(
      new MinimapPanel({ width: 200, height: 200, worldWidth: 2000, worldHeight: 2000, onClick }),
    );
    const canvas = minimap.element.querySelector('canvas')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    // Merkez nokta (100,100 ekran) -> dünyanın merkezi (1000,1000)
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 100 }));
    expect(onClick).toHaveBeenCalledWith(1000, 1000);
  });

  it('onClick verilmezse canvas role="img" olarak render edilir (tıklanabilir değil)', () => {
    const minimap = track(
      new MinimapPanel({ width: 100, height: 100, worldWidth: 1000, worldHeight: 1000 }),
    );
    const canvas = minimap.element.querySelector('canvas')!;
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.hasAttribute('tabindex')).toBe(false);
  });

  it('Enter tuşu (klavye ile) minimap merkezine tıklama simüle eder', () => {
    const onClick = vi.fn();
    const minimap = track(
      new MinimapPanel({ width: 100, height: 100, worldWidth: 1000, worldHeight: 1000, onClick }),
    );
    const canvas = minimap.element.querySelector('canvas')!;

    canvas.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(onClick).toHaveBeenCalledWith(500, 500);
  });

  it("setZoom 1'in altına inemez (Math.max(1, zoom) clamp)", () => {
    const minimap = track(
      new MinimapPanel({ width: 100, height: 100, worldWidth: 1000, worldHeight: 1000 }),
    );
    minimap.setZoom(0.2);
    expect(minimap.getZoom()).toBe(1);
  });

  it('zoom=1 iken pan çağrısı görünümü etkilemez (yalnızca zoom>1 iken anlamlı)', () => {
    const minimap = track(
      new MinimapPanel({ width: 100, height: 100, worldWidth: 1000, worldHeight: 1000 }),
    );
    // pan() throw etmemeli, render() sorunsuz çalışmalı.
    expect(() => minimap.pan(9999, 9999)).not.toThrow();
  });

  it('destroy click/keydown listenerlarini temizler', () => {
    const minimap = new MinimapPanel({
      width: 100,
      height: 100,
      worldWidth: 1000,
      worldHeight: 1000,
      onClick: vi.fn(),
    });
    const canvas = minimap.element.querySelector('canvas')!;
    const removeListener = vi.spyOn(canvas, 'removeEventListener');

    minimap.destroy();
    expect(removeListener).toHaveBeenCalledWith('click', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});

describe('SelectionInfoPanel', () => {
  it('başlangıçta boş durumdadır', () => {
    const panel = track(new SelectionInfoPanel());
    expect(panel.element.classList.contains('vol-selection-panel--empty')).toBe(true);
  });

  it('show() ile isim/health/stats/actions render edilir, boş durum kalkar', () => {
    const panel = track(new SelectionInfoPanel());
    panel.show({
      name: 'Ork Savaşçı',
      health: { max: 100, value: 80 },
      stats: [{ label: 'Saldırı', value: '12' }],
      actions: [{ icon: 'X', label: 'Sil', onClick: vi.fn() }],
    });

    expect(panel.element.classList.contains('vol-selection-panel--empty')).toBe(false);
    expect(panel.element.querySelector('.vol-selection-panel__name')?.textContent).toBe(
      'Ork Savaşçı',
    );
    expect(panel.element.querySelector('.vol-bar')).not.toBeNull();
    expect(panel.element.querySelector('.vol-selection-panel__stat-value')?.textContent).toBe('12');
  });

  it('clear() boş duruma döner ve önceki içeriği temizler', () => {
    const panel = track(new SelectionInfoPanel());
    panel.show({ name: 'Test', health: { max: 100, value: 50 } });
    panel.clear();

    expect(panel.element.classList.contains('vol-selection-panel--empty')).toBe(true);
    expect(panel.element.querySelector('.vol-bar')).toBeNull();
  });

  it("setHealth show() sonrası health bar'ı günceller, show() öncesi no-op'tur", () => {
    const panel = track(new SelectionInfoPanel());
    expect(() => panel.setHealth(50)).not.toThrow(); // show() çağrılmadı, no-op

    panel.show({ name: 'Test', health: { max: 100, value: 100 } });
    panel.setHealth(30);
    const bar = panel.element.querySelector('.vol-bar')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('30');
  });

  it("destroy tüm action button ve health bar'ı yok eder", () => {
    const panel = new SelectionInfoPanel();
    panel.show({
      name: 'Test',
      health: { max: 100, value: 100 },
      actions: [{ icon: 'X', label: 'Sil', onClick: vi.fn() }],
    });

    expect(() => panel.destroy()).not.toThrow();
    expect(panel.element.isConnected).toBe(false);
  });
});

describe('StatsPanel', () => {
  it('başlangıçta kapalıdır ve grupları render eder', () => {
    const panel = track(new StatsPanel({ title: 'Oyuncu', closeLabel: 'Kapat' }));
    panel.setGroups([
      {
        id: 'player',
        label: 'Oyuncu',
        entries: [{ id: 'damage', label: 'Hasar', value: '12' }],
      },
    ]);

    expect(panel.isOpen()).toBe(false);
    expect(panel.element.querySelector('.vol-stats-panel__group-title')?.textContent).toBe(
      'Oyuncu',
    );
    expect(panel.element.querySelector('.vol-stats-panel__entry-value')?.textContent).toBe('12');
  });

  it('bölüm ve satır ikonlarını güvenli şekilde yerleştirir', () => {
    const panel = track(new StatsPanel({ title: 'Oyuncu', closeLabel: 'Kapat' }));
    const groupIcon = document.createElement('span');
    groupIcon.textContent = '⚡';
    const entryIcon = document.createElement('span');
    entryIcon.textContent = '✦';

    panel.setGroups([
      {
        id: 'ability',
        label: 'Yetenek',
        icon: groupIcon,
        entries: [{ id: 'damage', label: 'Hasar', value: '22', icon: entryIcon }],
      },
    ]);

    expect(panel.element.querySelector('.vol-stats-panel__group-icon')?.textContent).toBe('⚡');
    expect(panel.element.querySelector('.vol-stats-panel__entry-icon')?.textContent).toBe('✦');
    expect(panel.element.querySelector('.vol-stats-panel__group-icon')?.firstElementChild).not.toBe(
      groupIcon,
    );
  });

  it('kimliğe göre diff yapar ve mevcut satır DOM kimliğini korur', () => {
    const panel = track(new StatsPanel({ title: 'Oyuncu', closeLabel: 'Kapat' }));
    panel.setGroups([
      {
        id: 'player',
        entries: [
          { id: 'health', label: 'Can', value: '100' },
          { id: 'damage', label: 'Hasar', value: '10' },
        ],
      },
    ]);
    const row = panel.element.querySelector('.vol-stats-panel__entry')!;

    panel.setGroups([
      {
        id: 'player',
        entries: [{ id: 'health', label: 'Can', value: '80' }],
      },
    ]);

    expect(panel.element.querySelector('.vol-stats-panel__entry')).toBe(row);
    expect(panel.element.querySelector('.vol-stats-panel__entry-value')?.textContent).toBe('80');
    expect(panel.element.querySelectorAll('.vol-stats-panel__entry')).toHaveLength(1);
  });

  it('açılır, kapanır ve destroy sonrasında güvenli no-op olur', () => {
    const panel = track(new StatsPanel({ title: 'Oyuncu', closeLabel: 'Kapat' }));
    panel.open();
    expect(panel.isOpen()).toBe(true);
    panel.close();
    expect(panel.isOpen()).toBe(false);
    panel.destroy();
    expect(() => {
      panel.open();
      panel.setGroups([]);
    }).not.toThrow();
  });
});

describe('SkillTree', () => {
  function makeNodes(): SkillNodeDefinition[] {
    return [
      { id: 'root', label: 'Kök Yetenek', x: 0, y: 0 },
      { id: 'child', label: 'Çocuk Yetenek', x: 0, y: 1, requires: ['root'] },
      { id: 'locked', label: 'Kilitli', x: 1, y: 1, requires: ['nonexistent'] },
    ];
  }

  /** Durumlar ÇAĞIRANIN sorumluluğu; opsiyonel tarif kuralı uygulanır. */
  function treeWith(unlocked: string[], onNodeClick?: (id: string) => void) {
    const nodes = makeNodes();
    const tree = track(new SkillTree({ nodes, onNodeClick: onNodeClick as never }));
    tree.setStates(resolveSkillStates(nodes, new Set(unlocked)));
    return tree;
  }

  it('durum haritasına göre --unlocked / --available / --locked class alır', () => {
    const tree = treeWith(['root']);
    const buttons = tree.element.querySelectorAll<HTMLButtonElement>('.vol-skill-tree__node');

    expect(buttons[0].classList.contains('vol-skill-tree__node--unlocked')).toBe(true);
    expect(buttons[1].classList.contains('vol-skill-tree__node--available')).toBe(true);
    expect(buttons[2].classList.contains('vol-skill-tree__node--locked')).toBe(true);
    expect(buttons[2].disabled).toBe(true);
  });

  it('durum verilmezse tüm düğümler kilitli sayılır', () => {
    const tree = track(new SkillTree({ nodes: makeNodes() }));
    const buttons = tree.element.querySelectorAll<HTMLButtonElement>('.vol-skill-tree__node');

    expect(buttons[0].classList.contains('vol-skill-tree__node--locked')).toBe(true);
  });

  it('tıklama niyet bildirir, açma kararı çağırandadır', () => {
    // Bileşen tıklamayı dışarıya bildirir; durum güncellemesi çağıran yapar.
    const onNodeClick = vi.fn();
    const tree = treeWith(['root'], onNodeClick);
    const childButton =
      tree.element.querySelectorAll<HTMLButtonElement>('.vol-skill-tree__node')[1];

    childButton.click();

    expect(onNodeClick).toHaveBeenCalledWith('child', 'available');
    expect(tree.getNodeState('child')).toBe('available');
    expect(childButton.classList.contains('vol-skill-tree__node--unlocked')).toBe(false);
  });

  it('çağıran setStates ile kararını geri yazınca düğüm açılır', () => {
    const nodes = makeNodes();
    const tree = track(new SkillTree({ nodes }));
    tree.setStates(resolveSkillStates(nodes, new Set(['root'])));

    tree.setStates(resolveSkillStates(nodes, new Set(['root', 'child'])));

    expect(tree.getNodeState('child')).toBe('unlocked');
  });

  it('locked (disabled) bir düğüme tıklamak hiçbir şey yapmaz', () => {
    const onNodeClick = vi.fn();
    const tree = treeWith(['root'], onNodeClick);
    const lockedButton =
      tree.element.querySelectorAll<HTMLButtonElement>('.vol-skill-tree__node')[2];

    lockedButton.click();
    expect(onNodeClick).not.toHaveBeenCalled();
  });

  it('showTooltips:true iken cost/description olan düğümlere RichTooltip bağlanır', () => {
    vi.useFakeTimers();
    const nodes: SkillNodeDefinition[] = [
      { id: 'a', label: 'A', x: 0, y: 0, description: 'Açıklama' },
    ];
    const tree = track(new SkillTree({ nodes, showTooltips: true }));
    // RichTooltip constructor'ı hemen bubble oluşturur ama DOM'a eklemez;
    // component'in kendi içindeki tooltips Map'i private, dolaylı olarak
    // hover simüle edip tooltip'in (delayMs sonra) DOM'a eklendiğini
    // doğrulayabiliriz — RichTooltip varsayılan delayMs=300 kullanır.
    const button = tree.element.querySelector<HTMLButtonElement>('.vol-skill-tree__node')!;
    button.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(300);
    expect(document.querySelector('.vol-rich-tooltip')).not.toBeNull();
  });

  it("zoomable:true iken tekerlek zoom'u MIN_ZOOM/MAX_ZOOM arasında sınırlar", () => {
    const tree = track(new SkillTree({ nodes: makeNodes(), zoomable: true }));
    const viewport = tree.element.querySelector<HTMLDivElement>('.vol-skill-tree__viewport')!;

    for (let i = 0; i < 20; i++) {
      viewport.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
      );
    }
    // MAX_ZOOM=2'yi aşmamalı — dolaylı olarak transform üzerinden kontrol edilir.
    const canvas = tree.element.querySelector<HTMLDivElement>('.vol-skill-tree__canvas')!;
    expect(canvas.style.transform).toContain('scale(2)');
  });

  it("destroy tüm cleanup ve tooltip'leri temizler", () => {
    const nodes: SkillNodeDefinition[] = [{ id: 'a', label: 'A', x: 0, y: 0, description: 'X' }];
    const tree = new SkillTree({ nodes, showTooltips: true });
    expect(() => tree.destroy()).not.toThrow();
    expect(tree.element.isConnected).toBe(false);
  });
});
