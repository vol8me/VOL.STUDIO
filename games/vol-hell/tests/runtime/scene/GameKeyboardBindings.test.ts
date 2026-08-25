import { describe, expect, it, vi } from 'vitest';
import { GameKeyboardBindings } from '@/runtime/scene/GameKeyboardBindings';

class FakeKey {
  private readonly handlers = new Set<() => void>();

  on(_event: string, handler: () => void): this {
    this.handlers.add(handler);
    return this;
  }

  off(_event: string, handler: () => void): this {
    this.handlers.delete(handler);
    return this;
  }

  emitDown(): void {
    for (const handler of this.handlers) handler();
  }
}

function makeKeyboard(): {
  keyboard: { addKey: (code: number) => FakeKey; removeKey: ReturnType<typeof vi.fn> };
  keys: Map<number, FakeKey>;
} {
  const keys = new Map<number, FakeKey>();
  const keyboard = {
    addKey: vi.fn((code: number) => {
      const key = new FakeKey();
      keys.set(code, key);
      return key;
    }),
    removeKey: vi.fn(),
  };
  return { keyboard, keys };
}

describe('GameKeyboardBindings', () => {
  it('restart sonrası eski key closure’larını bırakır', () => {
    const { keyboard, keys } = makeKeyboard();
    const onPause = vi.fn();
    const onAbility = vi.fn();
    let blocked = false;
    const bindings = new GameKeyboardBindings(keyboard as never, {
      pauseKeyCode: 27,
      abilityKeys: { primary: 81, secondary: 69 },
      onPause,
      isAbilityBlocked: () => blocked,
      onAbility,
    });

    keys.get(27)?.emitDown();
    keys.get(81)?.emitDown();
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onAbility).toHaveBeenCalledWith('primary');

    blocked = true;
    keys.get(69)?.emitDown();
    expect(onAbility).toHaveBeenCalledTimes(1);

    bindings.destroy();
    expect(keyboard.removeKey).toHaveBeenCalledTimes(3);
    keys.get(27)?.emitDown();
    keys.get(81)?.emitDown();
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onAbility).toHaveBeenCalledTimes(1);

    // Idempotent cleanup: SHUTDOWN'ın iki kez gelmesi key'i yeniden silmez.
    bindings.destroy();
    expect(keyboard.removeKey).toHaveBeenCalledTimes(3);
  });
});
