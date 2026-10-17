import { afterEach, describe, expect, it, vi } from 'vitest';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { OnScreenKeyboard, type TextEntryResult } from '@volstudio/core/ui';
import { buildNestedInputDemo } from '../../src/sections/nestedInputDemo';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('iç içe metin örneği sahipliği', () => {
  it('gerçek Select ve adlandırılmış Input kurar; OSK sonucu yalnız bir kez alana uygulanır', async () => {
    const scope = new DisposableScope();
    const container = document.createElement('div');
    document.body.append(container);
    const keyboard = vi
      .spyOn(OnScreenKeyboard, 'open')
      .mockResolvedValue({ value: 'Yeni', canceled: false });
    const demo = buildNestedInputDemo(scope, container);
    container.append(demo.element);
    const input = demo.element.querySelector<HTMLInputElement>('input')!;
    expect(document.querySelector(`label[for="${input.id}"]`)?.textContent).not.toBe('');
    expect(demo.element.querySelector('.vol-select')).not.toBeNull();
    demo.element.querySelector<HTMLButtonElement>('.vol-button')!.click();
    await vi.waitFor(() => expect(input.value).toBe('Yeni'));
    expect(keyboard).toHaveBeenCalledTimes(1);
    scope.dispose();
  });

  it.each(['cancel', 'dispose'] as const)(
    '%s bekleyen OSK isteğini iptal eder; geç sonuç eski alana uygulanmaz',
    async (action) => {
      const scope = new DisposableScope();
      const container = document.createElement('div');
      document.body.append(container);
      let finish!: (result: TextEntryResult) => void;
      let signal: AbortSignal | undefined;
      vi.spyOn(OnScreenKeyboard, 'open').mockImplementation((_request, nextSignal) => {
        signal = nextSignal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      });
      const demo = buildNestedInputDemo(scope, container);
      container.append(demo.element);
      const input = demo.element.querySelector<HTMLInputElement>('input')!;
      const previous = input.value;
      demo.element.querySelector<HTMLButtonElement>('.vol-button')!.click();
      expect(signal?.aborted).toBe(false);
      if (action === 'cancel') demo.cancel();
      else scope.dispose();
      expect(signal?.aborted).toBe(true);
      finish({ value: 'Eski sonuç', canceled: false });
      await Promise.resolve();
      await Promise.resolve();
      expect(input.value).toBe(previous);
      scope.dispose();
    },
  );
});
