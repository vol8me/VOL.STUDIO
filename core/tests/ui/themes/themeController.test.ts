import { afterEach, describe, expect, it, vi } from 'vitest';
import { UIRoot } from '../../../src/ui/layout/UIRoot';
import {
  DENSITY_STORAGE_KEY,
  LARGE_TARGETS_STORAGE_KEY,
  THEME_STORAGE_KEY,
  ThemeController,
  type ThemeStore,
} from '../../../src/ui/themes/ThemeController';
import type { ScopedKey } from '../../../src/persistence/scopedStorage';

/** Bellek içi kalıcılık: `ScopedSaveManager` ile aynı okuma/yazma yüzü. */
function memoryStore(initial: Record<string, unknown> = {}, delayMs = 0) {
  const data = new Map<string, unknown>(Object.entries(initial));
  const saves: [string, unknown][] = [];
  const store: ThemeStore = {
    async load<T>(key: ScopedKey, defaultValue: T): Promise<T> {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return (data.has(key) ? data.get(key) : defaultValue) as T;
    },
    save<T>(key: ScopedKey, value: T): Promise<void> {
      saves.push([key, value]);
      data.set(key, value);
      return Promise.resolve();
    },
  };
  return { store, data, saves };
}

const roots: HTMLElement[] = [];
function element(): HTMLElement {
  const node = document.createElement('div');
  document.body.append(node);
  roots.push(node);
  return node;
}

afterEach(() => {
  for (const node of roots.splice(0)) node.remove();
  document.body.replaceChildren();
});

describe('ThemeController', () => {
  it('varsayılan: default tema, comfortable yoğunluk, küçük hedef tabanı yok', () => {
    const controller = new ThemeController();
    expect(controller.state).toEqual({
      theme: 'default',
      density: 'comfortable',
      largeTargets: false,
    });
  });

  it('bilinmeyen değer varsayılana döner: kurucuda ve ayarlarken', () => {
    const controller = new ThemeController({ theme: 'neon', density: 42 });
    expect(controller.state.theme).toBe('default');
    expect(controller.state.density).toBe('comfortable');
    expect(controller.setTheme('aurum')).toBe('aurum');
    expect(controller.setTheme({ bozuk: true })).toBe('default');
    expect(controller.setDensity('compact')).toBe('compact');
    expect(controller.setDensity(null)).toBe('comfortable');
  });

  it('attach yalnız o alt ağacı etkiler; değişim tüm bağlı köklere yayılır', () => {
    const controller = new ThemeController();
    const a = element();
    const b = element();
    const other = element();
    controller.attach(a);
    controller.attach(b);
    expect(a.getAttribute('data-vol-theme')).toBe('default');
    expect(a.getAttribute('data-vol-density')).toBe('comfortable');
    controller.setTheme('aurum');
    controller.setDensity('spacious');
    for (const node of [a, b]) {
      expect(node.getAttribute('data-vol-theme')).toBe('aurum');
      expect(node.getAttribute('data-vol-density')).toBe('spacious');
    }
    expect(other.hasAttribute('data-vol-theme')).toBe(false);
  });

  it('bağlantı kesilince önceki nitelikler geri yazılır; ikinci dispose etkisiz', () => {
    const controller = new ThemeController({ theme: 'aurum' });
    const node = element();
    node.setAttribute('data-vol-theme', 'elle');
    const handle = controller.attach(node);
    expect(node.getAttribute('data-vol-theme')).toBe('aurum');
    handle.dispose();
    expect(node.getAttribute('data-vol-theme')).toBe('elle');
    expect(node.hasAttribute('data-vol-density')).toBe(false);
    handle.dispose();
    controller.setTheme('default');
    expect(node.getAttribute('data-vol-theme')).toBe('elle');
  });

  it('aynı eleman iki kez bağlanırsa tek kayıt tutulur ve son dispose geri yazar', () => {
    const controller = new ThemeController({ theme: 'aurum' });
    const node = element();
    const first = controller.attach(node);
    const second = controller.attach(node);
    first.dispose();
    expect(node.getAttribute('data-vol-theme')).toBe('aurum');
    controller.setTheme('default');
    expect(node.getAttribute('data-vol-theme')).toBe('default');
    second.dispose();
    expect(node.hasAttribute('data-vol-theme')).toBe(false);
  });

  it('paylaşılan UIRoot parent: iki UIRoot tek sağlayıcı kaydıyla temalanır, ikincisi kaynak sızdırmaz', () => {
    const controller = new ThemeController({ theme: 'aurum' });
    const parent = element();
    const one = new UIRoot(parent);
    const two = new UIRoot(parent);
    expect(one.element).toBe(two.element);
    const a = controller.attach(one.element);
    const b = controller.attach(two.element);
    expect(one.element.getAttribute('data-vol-theme')).toBe('aurum');
    one.destroy();
    a.dispose();
    expect(two.element.isConnected).toBe(true);
    expect(two.element.getAttribute('data-vol-theme')).toBe('aurum');
    two.destroy();
    b.dispose();
    expect(two.element.isConnected).toBe(false);
  });

  it('tema değişimi odak, kaydırma ve seçimi korur ve DOM ağacına dokunmaz', () => {
    const controller = new ThemeController();
    const root = element();
    root.innerHTML =
      '<div id="scroll" style="height:20px;overflow:auto"><p>metin</p><button id="b">tamam</button></div>';
    const scroll = root.querySelector<HTMLElement>('#scroll')!;
    const button = root.querySelector<HTMLButtonElement>('#b')!;
    controller.attach(root);
    button.focus();
    scroll.scrollTop = 7;
    const range = document.createRange();
    range.selectNodeContents(root.querySelector('p')!);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    const before = root.innerHTML;
    controller.setTheme('aurum');
    controller.setDensity('compact');
    expect(document.activeElement).toBe(button);
    expect(scroll.scrollTop).toBe(7);
    expect(window.getSelection()!.toString()).toBe('metin');
    expect(root.innerHTML).toBe(before);
  });

  it('hedef tabanı niteliği: açıkken data-vol-target=large, kapanınca kalkar', () => {
    const controller = new ThemeController({ largeTargets: true });
    const node = element();
    controller.attach(node);
    expect(node.getAttribute('data-vol-target')).toBe('large');
    controller.setLargeTargets(false);
    expect(node.hasAttribute('data-vol-target')).toBe(false);
    expect(controller.setLargeTargets(true)).toBe(true);
  });

  it('onChange yalnız gerçek değişimde çağrılır; dispose ile susar', () => {
    const controller = new ThemeController();
    const seen: string[] = [];
    const subscription = controller.onChange((state) =>
      seen.push(`${state.theme}/${state.density}`),
    );
    controller.setTheme('aurum');
    controller.setTheme('aurum');
    controller.setDensity('compact');
    subscription.dispose();
    controller.setTheme('default');
    expect(seen).toEqual(['aurum/comfortable', 'aurum/compact']);
  });

  describe('kalıcılık (cihaz kapsamı)', () => {
    it('ayarlar device.volui:* anahtarlarına yazılır', async () => {
      const { store, saves } = memoryStore();
      const controller = new ThemeController({ store });
      controller.setTheme('aurum');
      controller.setDensity('spacious');
      controller.setLargeTargets(true);
      await controller.whenSaved;
      expect(saves).toEqual([
        [THEME_STORAGE_KEY, 'aurum'],
        [DENSITY_STORAGE_KEY, 'spacious'],
        [LARGE_TARGETS_STORAGE_KEY, true],
      ]);
      expect(THEME_STORAGE_KEY.startsWith('device.')).toBe(true);
    });

    it('restore kayıtlı değerleri uygular; bozuk kayıt varsayılana döner', async () => {
      const good = memoryStore({
        [THEME_STORAGE_KEY]: 'aurum',
        [DENSITY_STORAGE_KEY]: 'compact',
        [LARGE_TARGETS_STORAGE_KEY]: true,
      });
      const node = element();
      const controller = new ThemeController({ store: good.store });
      controller.attach(node);
      await controller.restore();
      expect(controller.state).toEqual({ theme: 'aurum', density: 'compact', largeTargets: true });
      expect(node.getAttribute('data-vol-theme')).toBe('aurum');

      const bad = memoryStore({
        [THEME_STORAGE_KEY]: { x: 1 },
        [DENSITY_STORAGE_KEY]: 'devasa',
        [LARGE_TARGETS_STORAGE_KEY]: 'evet',
      });
      const fallback = new ThemeController({ store: bad.store });
      await fallback.restore();
      expect(fallback.state).toEqual({
        theme: 'default',
        density: 'comfortable',
        largeTargets: false,
      });
    });

    it('restore sürerken kullanıcı seçimi yapıldıysa kayıtlı eski değer onu ezmez', async () => {
      const { store } = memoryStore({ [THEME_STORAGE_KEY]: 'aurum' }, 15);
      const controller = new ThemeController({ store });
      const restoring = controller.restore();
      controller.setTheme('default');
      await restoring;
      expect(controller.state.theme).toBe('default');
    });

    it('okuma ya da yazma hatası bildirilir, arayüz durumu geri alınmaz', async () => {
      const errors: unknown[] = [];
      const failing: ThemeStore = {
        load: () => Promise.reject(new Error('okuma')),
        save: () => Promise.reject(new Error('yazma')),
      };
      const controller = new ThemeController({
        store: failing,
        onError: (error) => errors.push(error),
      });
      await controller.restore();
      controller.setTheme('aurum');
      await controller.whenSaved;
      expect(controller.state.theme).toBe('aurum');
      expect(errors.map((error) => (error as Error).message)).toEqual(['okuma', 'yazma']);
    });

    it('store yokken restore sessizce mevcut durumu verir', async () => {
      const controller = new ThemeController({ theme: 'aurum' });
      expect((await controller.restore()).theme).toBe('aurum');
    });
  });

  it('dispose: nitelikleri geri yazar, dinleyicileri susturur ve sonraki ayarlar etkisizdir', async () => {
    const { store, saves } = memoryStore();
    const controller = new ThemeController({ store });
    const node = element();
    controller.attach(node);
    const listener = vi.fn();
    controller.onChange(listener);
    controller.dispose();
    controller.dispose();
    expect(node.hasAttribute('data-vol-theme')).toBe(false);
    expect(controller.setTheme('aurum')).toBe('default');
    await controller.whenSaved;
    expect(saves).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
    expect((await controller.restore()).theme).toBe('default');
  });

  describe('Canvas token okuyucusu', () => {
    it('hesaplanmış token değerini döndürür; tema değişince yeni değeri okur', () => {
      const controller = new ThemeController();
      const node = element();
      node.style.setProperty('--vol-ui-surface-1', '#182028');
      expect(controller.readColor(node, 'uiSurface1')).toBe('#182028');
      node.style.setProperty('--vol-ui-surface-1', '#221813');
      expect(controller.readColor(node, 'uiSurface1')).toBe('#221813');
    });

    it('okunamayan token sessizce sabit renge düşmez: açık hata verir', () => {
      const controller = new ThemeController();
      expect(() => controller.readColor(element(), 'plateTopLight')).toThrow(
        '--vol-ui-plate-top-light okunamadı',
      );
    });
  });
});
