import { describe, expect, it, vi } from 'vitest';
import { PersistedObservableState } from '../../src/persistence/PersistedObservableState';

interface State {
  value: number;
}

const clone = (state: State): State => ({ ...state });
const parse = (value: unknown): State => {
  const candidate = (value as { value?: unknown } | null)?.value;
  return { value: typeof candidate === 'number' ? candidate : 0 };
};

describe('PersistedObservableState', () => {
  it.each([0, 100])(
    'dinleyici kapanışı başlatsa da son yazım reddi bariyere ulaşır (%d ms)',
    async (debounceMs) => {
      const error = new Error('son disk reddi');
      const state = new PersistedObservableState({
        store: {
          load: () => Promise.resolve(undefined),
          save: () => Promise.reject(error),
        },
        key: 'settings',
        initial: { value: 0 },
        parse,
        clone,
        debounceMs,
      });
      let closing: Promise<unknown> | undefined;
      state.subscribe(() => {
        closing = state.flushAndDispose().catch((failure: unknown) => failure);
      });
      await expect(state.set({ value: 7 })).rejects.toBe(error);
      expect(await closing).toBe(error);
    },
  );
  it('yüklemeyi doğrular, kopya döndürür ve değişikliği yayınlar', async () => {
    const listener = vi.fn();
    const store = {
      load: vi.fn(() => Promise.resolve({ value: 4 })),
      save: vi.fn(() => Promise.resolve()),
    };
    const state = new PersistedObservableState({
      store,
      key: 'settings',
      initial: { value: 0 },
      parse,
      clone,
      equals: (left, right) => left.value === right.value,
    });
    state.subscribe(listener);

    const loaded = await state.load();
    loaded.value = 99;

    expect(state.get()).toEqual({ value: 4 });
    expect(listener).toHaveBeenCalledWith({ value: 4 });
    await state.update((current) => ({ value: current.value + 1 }));
    expect(store.save).toHaveBeenCalledWith('settings', { value: 5 });
    state.dispose();
  });

  it('debounce süresinde değişiklikleri birleştirir ve setter promiseini yazımda çözer', async () => {
    vi.useFakeTimers();
    const store = {
      load: vi.fn(() => Promise.resolve(undefined)),
      save: vi.fn(() => Promise.resolve()),
    };
    const state = new PersistedObservableState({
      store,
      key: 'settings',
      initial: { value: 0 },
      parse,
      clone,
      debounceMs: 100,
    });

    let resolved = false;
    const first = state.set({ value: 1 }).then(() => {
      resolved = true;
    });
    void state.set({ value: 2 });
    await vi.advanceTimersByTimeAsync(99);
    expect(resolved).toBe(false);
    expect(store.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await first;
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(store.save).toHaveBeenCalledWith('settings', { value: 2 });
    state.dispose();
    vi.useRealTimers();
  });

  it('flush bekleyen debounceu indirir; flushAndDispose son yazımı bekler', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const store = {
      load: vi.fn(() => Promise.resolve(undefined)),
      save: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      ),
    };
    const state = new PersistedObservableState({
      store,
      key: 'settings',
      initial: { value: 0 },
      parse,
      clone,
      debounceMs: 100,
    });
    void state.set({ value: 3 });
    const closing = state.flushAndDispose();
    await Promise.resolve();
    expect(store.save).toHaveBeenCalledWith('settings', { value: 3 });
    finish();
    await closing;
    await expect(state.flush()).rejects.toThrow(/Kapatılmış/);
    vi.useRealTimers();
  });

  it('dispose bekleyen debounce yazımını kaybetmez ve önceki promisei sonuçlandırır', async () => {
    vi.useFakeTimers();
    const store = {
      load: vi.fn(() => Promise.resolve(undefined)),
      save: vi.fn(() => Promise.resolve()),
    };
    const state = new PersistedObservableState({
      store,
      key: 'settings',
      initial: { value: 0 },
      parse,
      clone,
      debounceMs: 100,
    });

    const pending = state.set({ value: 8 });
    state.dispose();
    await pending;

    expect(store.save).toHaveBeenCalledOnce();
    expect(store.save).toHaveBeenCalledWith('settings', { value: 8 });
    state.dispose();
    vi.useRealTimers();
  });

  it('flushAndDispose writer tamamen bitmeden dönmez', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    let closed = false;
    const store = {
      load: vi.fn(() => Promise.resolve(undefined)),
      save: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      ),
    };
    const state = new PersistedObservableState({
      store,
      key: 'settings',
      initial: { value: 0 },
      parse,
      clone,
      debounceMs: 100,
    });

    void state.set({ value: 9 });
    const closing = state.flushAndDispose().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(store.save).toHaveBeenCalledWith('settings', { value: 9 });
    expect(closed).toBe(false);
    finish();
    await closing;
    expect(closed).toBe(true);
    vi.useRealTimers();
  });

  it('yazıları seri tutar ve bekleyen son statei kaydeder', async () => {
    let finishFirst!: () => void;
    const writes: number[] = [];
    const store = {
      load: vi.fn(() => Promise.resolve(undefined)),
      save: vi.fn(async (_key: string, value: State) => {
        writes.push(value.value);
        if (value.value === 1) {
          await new Promise<void>((resolve) => {
            finishFirst = resolve;
          });
        }
      }),
    };
    const state = new PersistedObservableState({
      store,
      key: 'settings',
      initial: { value: 0 },
      parse,
      clone,
    });

    const first = state.set({ value: 1 });
    const second = state.set({ value: 2 });
    const third = state.set({ value: 3 });
    await Promise.resolve();
    expect(writes).toEqual([1]);
    finishFirst();
    await Promise.all([first, second, third]);
    expect(writes).toEqual([1, 3]);
    state.dispose();
  });

  it('yükleme/yazma ve dinleyici hatalarını ayrı kanallarda raporlar', async () => {
    const loadError = new Error('load');
    const onError = vi.fn();
    const onListenerError = vi.fn();
    const store = {
      load: vi.fn(() => Promise.reject(loadError)),
      save: vi.fn(() => Promise.reject(new Error('save'))),
    };
    const state = new PersistedObservableState({
      store,
      key: 'settings',
      initial: { value: 0 },
      parse,
      clone,
      onError,
      onListenerError,
    });
    state.subscribe(() => {
      throw new Error('listener');
    });

    await expect(state.load()).rejects.toBe(loadError);
    await expect(state.set({ value: 1 })).rejects.toThrow('save');
    expect(onError).toHaveBeenNthCalledWith(1, loadError, 'load');
    expect(onError).toHaveBeenNthCalledWith(2, expect.any(Error), 'save');
    expect(onListenerError).toHaveBeenCalledOnce();
    state.dispose();
  });

  it('dinleyici hata işleyicisi hata atsa da sonraki dinleyiciyi çalıştırır', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const second = vi.fn();
    const state = new PersistedObservableState({
      store: { load: vi.fn(), save: vi.fn(() => Promise.resolve()) },
      key: 'settings',
      initial: { value: 0 },
      parse,
      clone,
      onListenerError: () => {
        throw new Error('handler');
      },
    });
    state.subscribe(() => {
      throw new Error('listener');
    });
    state.subscribe(second);

    await state.set({ value: 1 });

    expect(second).toHaveBeenCalledWith({ value: 1 });
    expect(consoleError).toHaveBeenCalledOnce();
    state.dispose();
    consoleError.mockRestore();
  });

  it('fonksiyon değerini updater sanmadan saklar', async () => {
    const initial = vi.fn(() => 1);
    const next = vi.fn(() => 2);
    const save = vi.fn(() => Promise.resolve());
    const state = new PersistedObservableState<() => number>({
      store: { load: vi.fn(), save },
      key: 'function-state',
      initial,
      parse: (value) => value as () => number,
      clone: (value) => value,
    });

    await state.set(next);

    expect(initial).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(state.get()).toBe(next);
    expect(save).toHaveBeenCalledWith('function-state', next);
    state.dispose();
  });

  it('dispose sonrası final snapshot okunur, diğer operasyonlar reddedilir', async () => {
    const state = new PersistedObservableState({
      store: { load: vi.fn(), save: vi.fn(() => Promise.resolve()) },
      key: 'settings',
      initial: { value: 2 },
      parse,
      clone,
    });
    state.dispose();

    expect(state.get()).toEqual({ value: 2 });
    await expect(state.set({ value: 3 })).rejects.toThrow(/Kapatılmış/);
    await expect(state.update((current) => current)).rejects.toThrow(/Kapatılmış/);
    await expect(state.load()).rejects.toThrow(/Kapatılmış/);
    expect(() => state.subscribe(() => undefined)).toThrow(/Kapatılmış/);
    await expect(state.flush()).rejects.toThrow(/Kapatılmış/);
    await expect(state.flushAndDispose()).rejects.toThrow(/Kapatılmış/);
  });

  it('boş anahtarı ve geçersiz debounce değerini reddeder', () => {
    const store = { load: vi.fn(), save: vi.fn() };
    expect(
      () => new PersistedObservableState({ store, key: ' ', initial: { value: 0 }, parse, clone }),
    ).toThrow(RangeError);
    expect(
      () =>
        new PersistedObservableState({
          store,
          key: 'settings',
          initial: { value: 0 },
          parse,
          clone,
          debounceMs: Number.NaN,
        }),
    ).toThrow(RangeError);
  });
});

describe('kalıcılık hata bariyeri', () => {
  it.each(['flush', 'flushAndDispose'] as const)(
    '%s devam eden yazımın reddini taşır',
    async (method) => {
      let reject!: (error: unknown) => void;
      const failure = new Error('disk');
      const state = new PersistedObservableState({
        store: {
          load: () => Promise.resolve(undefined),
          save: () =>
            new Promise<void>((_ok, fail) => {
              reject = fail;
            }),
        },
        key: 'settings',
        initial: { value: 0 },
        parse,
        clone,
      });
      const setter = expect(state.set({ value: 1 })).rejects.toBe(failure);
      const barrier = expect(state[method]()).rejects.toBe(failure);
      reject(failure);
      await Promise.all([setter, barrier]);
      state.dispose();
    },
  );

  it.each([undefined, null, 'disk'])(
    'geçmiş telafisiz ret kayıpsız taşınır: %s',
    async (failure) => {
      const state = new PersistedObservableState({
        store: {
          load: () => Promise.resolve(undefined),
          save: vi.fn<() => Promise<void>>().mockRejectedValue(failure),
        },
        key: 'settings',
        initial: { value: 0 },
        parse,
        clone,
      });
      await expect(state.set({ value: 1 })).rejects.toBe(failure);
      await expect(state.flush()).rejects.toBe(failure);
      await expect(state.flushAndDispose()).rejects.toBe(failure);
    },
  );

  it('yeni başarılı son değer geçmiş hatayı telafi eder', async () => {
    const state = new PersistedObservableState({
      store: {
        load: () => Promise.resolve(undefined),
        save: (_key, value: State) =>
          value.value === 1 ? Promise.reject(new Error('disk')) : Promise.resolve(),
      },
      key: 'settings',
      initial: { value: 0 },
      parse,
      clone,
    });
    await expect(state.set({ value: 1 })).rejects.toThrow('disk');
    await state.set({ value: 2 });
    await expect(state.flush()).resolves.toBeUndefined();
    await expect(state.flushAndDispose()).resolves.toBeUndefined();
  });
});

it('debounce kapanışı undefined reddini kaybetmez', async () => {
  const state = new PersistedObservableState({
    store: {
      load: () => Promise.resolve(undefined),
      save: vi.fn<() => Promise<void>>().mockRejectedValue(undefined),
    },
    key: 'settings',
    initial: { value: 0 },
    parse,
    clone,
    debounceMs: 100,
  });
  const setter = expect(state.set({ value: 1 })).rejects.toBeUndefined();
  await expect(state.flushAndDispose()).rejects.toBeUndefined();
  await setter;
});

it('başarısız ara yazımdan sonra son başarılı değer bariyeri telafi eder', async () => {
  let reject!: (error: unknown) => void;
  const writes: number[] = [];
  const failure = new Error('ilk yazım');
  const state = new PersistedObservableState({
    store: {
      load: () => Promise.resolve(undefined),
      save: async (_key, value: State) => {
        writes.push(value.value);
        if (value.value === 1)
          await new Promise<void>((_ok, fail) => {
            reject = fail;
          });
      },
    },
    key: 'settings',
    initial: { value: 0 },
    parse,
    clone,
  });
  const first = expect(state.set({ value: 1 })).rejects.toBe(failure);
  const second = state.set({ value: 2 });
  const last = state.set({ value: 3 });
  const barriers = Promise.all([state.flush(), state.flush()]);
  reject(failure);
  await Promise.all([first, second, last, barriers]);
  expect(writes).toEqual([1, 3]);
  await state.flushAndDispose();
});

it('çağıranın beklemediği setter reddi bariyerde gözlenir', async () => {
  const failure = new Error('arka plan yazımı');
  const state = new PersistedObservableState({
    store: {
      load: () => Promise.resolve(undefined),
      save: vi.fn<() => Promise<void>>().mockRejectedValue(failure),
    },
    key: 'settings',
    initial: { value: 0 },
    parse,
    clone,
    debounceMs: 100,
  });
  void state.set({ value: 1 });
  await expect(state.flushAndDispose()).rejects.toBe(failure);
});
