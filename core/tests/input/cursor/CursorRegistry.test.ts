import { describe, it, expect } from 'vitest';
import { CursorRegistry, VolCursorTheme } from '../../../src/input/cursor';

describe('CursorRegistry', () => {
  it('tema kaydı tüm cursorları içerir', () => {
    const registry = new CursorRegistry();
    registry.registerTheme(VolCursorTheme);
    expect(registry.size).toBe(20);
  });

  it('resolve bilinen idleri döner', () => {
    const registry = new CursorRegistry();
    registry.registerTheme(VolCursorTheme);

    const pointer = registry.resolve('pointer');
    expect(pointer.id).toBe('pointer');

    const defaultCursor = registry.resolve('default');
    expect(defaultCursor.id).toBe('default');
  });

  it('reset kayıtları temizler', () => {
    const registry = new CursorRegistry();
    registry.registerTheme(VolCursorTheme);
    registry.reset();
    expect(registry.size).toBe(0);
  });

  it('bilinmeyen id için default cursor döner', () => {
    const registry = new CursorRegistry();
    registry.registerTheme(VolCursorTheme);
    const fallback = registry.resolve('unknown-cursor-id');
    expect(fallback.id).toBe('default');
  });

  it('özel id kaydı ve çözümlemesi', () => {
    const registry = new CursorRegistry();
    registry.registerTheme(VolCursorTheme);
    const custom = {
      ...VolCursorTheme.cursors.default,
      id: 'my-cursor',
    };
    registry.register(custom);
    expect(registry.resolve('my-cursor').id).toBe('my-cursor');
  });
});
