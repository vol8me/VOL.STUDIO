import { afterEach, describe, expect, it, vi } from 'vitest';
import { runButtonClick, type ButtonBehaviorHost } from '../../../src/ui/primitives/buttonBehavior';

function host(): ButtonBehaviorHost & { states: boolean[]; errors: boolean[] } {
  let loading = false;
  const states: boolean[] = [];
  const errors: boolean[] = [];
  return {
    states,
    errors,
    setError: (value) => errors.push(value),
    logLabel: 'Deneme',
    isLoading: () => loading,
    setLoading: (value) => {
      loading = value;
      states.push(value);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runButtonClick — paylaşılan tıklama sözleşmesi', () => {
  it('handler yoksa hiçbir şey yapmaz', async () => {
    const target = host();
    await runButtonClick(target, undefined);
    expect(target.states).toEqual([]);
  });

  it('senkron handler SENKRON kalır: loading açılıp kapanır, bir microtask geciktirmez', () => {
    const target = host();
    const handler = vi.fn();
    void runButtonClick(target, handler);
    // `await` yok: handler ve loading döngüsü bu satıra gelmeden bitmiş olmalı.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(target.states).toEqual([true, false]);
    // Art arda ikinci tıklama "loading" görüp düşmez.
    void runButtonClick(target, handler);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('asenkron handler beklenir; süresince loading açıktır ve yeniden giriş reddedilir', async () => {
    const target = host();
    let finish: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const handler = vi.fn(() => pending);
    const first = runButtonClick(target, handler);
    expect(target.isLoading()).toBe(true);
    await runButtonClick(target, handler);
    expect(handler).toHaveBeenCalledTimes(1);
    finish();
    await first;
    expect(target.states).toEqual([true, false]);
    expect(target.isLoading()).toBe(false);
  });

  it('farklı realm/yerel olmayan thenable da beklenir (instanceof Promise değil)', async () => {
    const target = host();
    let resolved = false;
    const thenable = {
      then(onFulfilled: () => void) {
        setTimeout(() => {
          resolved = true;
          onFulfilled();
        }, 5);
      },
    };
    await runButtonClick(target, () => thenable as unknown as Promise<void>);
    expect(resolved).toBe(true);
    expect(target.states).toEqual([true, false]);
  });

  it('hata (senkron ya da reddedilen söz) yakalanır, kullanıcı etiketiyle günlüğe yazılır ve tıklama yeniden mümkün olur', async () => {
    const target = host();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await runButtonClick(target, () => {
      throw new Error('senkron');
    });
    await runButtonClick(target, () => Promise.reject(new Error('asenkron')));
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0][0]).toBe('[Deneme] onClick handler hatası:');
    expect(target.isLoading()).toBe(false);
    const after = vi.fn();
    await runButtonClick(target, after);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('hata durumu: her tıklamada temizlenir, handler hata fırlatınca (loading bittikten sonra) kurulur', async () => {
    const target = host();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await runButtonClick(target, () => Promise.reject(new Error('ret')));
    expect(target.errors).toEqual([false, true]);
    await runButtonClick(target, () => undefined);
    // Başarılı tıklama hata durumunu temizler ve yenisini kurmaz.
    expect(target.errors).toEqual([false, true, false]);
  });
});
