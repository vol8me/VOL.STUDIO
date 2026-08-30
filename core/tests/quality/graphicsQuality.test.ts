import { afterEach, describe, expect, it, vi } from 'vitest';
import { GraphicsQuality } from '../../src/quality';

interface Profile {
  renderScale: number;
  particles: number;
}

const LEVELS = {
  high: { renderScale: 1, particles: 1 },
  low: { renderScale: 0.7, particles: 0.35 },
} as const satisfies Record<string, Profile>;

afterEach(() => {
  document.documentElement.removeAttribute('data-vol-graphics');
});

describe('GraphicsQuality', () => {
  function make(initial: 'high' | 'low' = 'high') {
    return new GraphicsQuality<'high' | 'low', Profile>({ levels: LEVELS, initial });
  }

  it('açılış kademesinin profilini döner', () => {
    const quality = make();
    expect(quality.getLevel()).toBe('high');
    expect(quality.getProfile()).toEqual(LEVELS.high);
  });

  it('kademeleri UI listesi için sırasıyla verir', () => {
    expect(make().getLevels()).toEqual(['high', 'low']);
  });

  it('kademe değişince dinleyiciyi YENİ profille çağırır', () => {
    const quality = make();
    const listener = vi.fn();
    quality.onChange(listener);

    expect(quality.setLevel('low')).toBe(true);

    expect(listener).toHaveBeenCalledWith('low', LEVELS.low);
    expect(quality.getProfile()).toEqual(LEVELS.low);
  });

  it('aynı kademe tekrar verilirse değişim bildirmez', () => {
    const quality = make();
    const listener = vi.fn();
    quality.onChange(listener);

    expect(quality.setLevel('high')).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('bilinmeyen kademeyi reddeder — kayıtlı bozuk değer profili bozmaz', () => {
    const quality = make();
    expect(quality.setLevel('ultra' as never)).toBe(false);
    expect(quality.isLevel('ultra')).toBe(false);
    expect(quality.isLevel('low')).toBe(true);
    expect(quality.getLevel()).toBe('high');
  });

  it('abonelik kaldırılabilir', () => {
    const quality = make();
    const listener = vi.fn();
    const stop = quality.onChange(listener);

    stop();
    quality.setLevel('low');

    expect(listener).not.toHaveBeenCalled();
  });

  it('bir dinleyicinin hatası diğerlerini engellemez', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const quality = make();
    const healthy = vi.fn();
    quality.onChange(() => {
      throw new Error('görsel katman patladı');
    });
    quality.onChange(healthy);

    quality.setLevel('low');

    expect(healthy).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('istenirse kademeyi DOM özniteliğine yansıtır', () => {
    // Öznitelik CSS'in pahalı efektleri kapatmasını sağlar; opsiyoneldir,
    // verilmezse CORE DOM'a hiç dokunmaz.
    const quality = new GraphicsQuality<'high' | 'low', Profile>({
      levels: LEVELS,
      initial: 'high',
      reflect: { element: document.documentElement, attribute: 'vol-graphics' },
    });

    expect(document.documentElement.getAttribute('data-vol-graphics')).toBe('high');
    quality.setLevel('low');
    expect(document.documentElement.getAttribute('data-vol-graphics')).toBe('low');

    quality.destroy();
    expect(document.documentElement.hasAttribute('data-vol-graphics')).toBe(false);
  });

  it('yansıtma verilmezse DOM kirletilmez', () => {
    make().setLevel('low');
    expect(document.documentElement.hasAttribute('data-vol-graphics')).toBe(false);
  });

  it('boş kademe kümesi ve tanımsız açılış kademesi reddedilir', () => {
    expect(() => new GraphicsQuality({ levels: {}, initial: 'high' as never })).toThrow(
      /en az bir/i,
    );
    expect(
      () =>
        new GraphicsQuality<'high' | 'low', Profile>({ levels: LEVELS, initial: 'ultra' as never }),
    ).toThrow(/açılış kademesi/i);
  });

  it('destroy sonrası kademe değişmez', () => {
    const quality = make();
    quality.destroy();
    expect(quality.setLevel('low')).toBe(false);
    expect(quality.getLevel()).toBe('high');
  });

  it('kademeler karşılaştırılabilir — UI iki profili yan yana gösterebilir', () => {
    const quality = make();
    expect(quality.getProfileOf('low').renderScale).toBeLessThan(
      quality.getProfileOf('high').renderScale,
    );
  });
});
