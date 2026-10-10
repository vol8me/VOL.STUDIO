import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeController } from '../../../src/ui/themes/ThemeController';
import { watchTheme } from '../../../src/ui/themes/themeWatch';

/** MutationObserver geri çağrıları mikro görevdir; iki tur zincirleme bağlamayı da kapsar. */
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

function stubFrames(): { run: () => void } {
  let callback: FrameRequestCallback | null = null;
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((next) => {
    callback = next;
    return 1;
  });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {
    callback = null;
  });
  return {
    run: () => {
      const pending = callback;
      callback = null;
      pending?.(0);
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute('data-vol-theme');
  vi.restoreAllMocks();
});

describe('watchTheme', () => {
  it('en yakın kaplama sahibinin değeri değişince bildirir; ilgisiz değişimi yok sayar', async () => {
    stubFrames();
    const scope = document.createElement('section');
    const target = document.createElement('div');
    scope.append(target);
    document.body.append(scope);
    const theme = new ThemeController();
    theme.attach(scope);
    const onChange = vi.fn();
    const watch = watchTheme(target, onChange);

    theme.setTheme('aurum');
    await settle();
    expect(onChange).toHaveBeenCalledTimes(1);

    // Yoğunluk renk tokenını değiştirmez: yalnız `data-vol-theme` izlenir.
    theme.setDensity('compact');
    await settle();
    expect(onChange).toHaveBeenCalledTimes(1);

    theme.setTheme('default');
    await settle();
    expect(onChange).toHaveBeenCalledTimes(2);
    watch.dispose();
    theme.dispose();
  });

  it('daha yakın kök kaplamayı sahiplenir: dıştaki değişim içteki öğeyi etkilemez', async () => {
    stubFrames();
    const outer = document.createElement('section');
    const inner = document.createElement('section');
    const target = document.createElement('div');
    inner.append(target);
    outer.append(inner);
    document.body.append(outer);
    const outerTheme = new ThemeController();
    const innerTheme = new ThemeController();
    outerTheme.attach(outer);
    innerTheme.attach(inner);
    const onChange = vi.fn();
    const watch = watchTheme(target, onChange);

    outerTheme.setTheme('aurum');
    await settle();
    expect(onChange).not.toHaveBeenCalled();
    innerTheme.setTheme('aurum');
    await settle();
    expect(onChange).toHaveBeenCalledTimes(1);
    watch.dispose();
    outerTheme.dispose();
    innerTheme.dispose();
  });

  it('başka kapsama taşınınca bildirir ve yeni atanın değişimini izler', async () => {
    stubFrames();
    const first = document.createElement('section');
    const second = document.createElement('section');
    const target = document.createElement('div');
    first.append(target);
    document.body.append(first, second);
    const firstTheme = new ThemeController();
    const secondTheme = new ThemeController({ theme: 'aurum' });
    firstTheme.attach(first);
    secondTheme.attach(second);
    const onChange = vi.fn();
    const watch = watchTheme(target, onChange);

    second.append(target);
    await settle();
    expect(onChange).toHaveBeenCalledTimes(1);
    firstTheme.setTheme('aurum');
    await settle();
    expect(onChange).toHaveBeenCalledTimes(1);
    secondTheme.setTheme('default');
    await settle();
    expect(onChange).toHaveBeenCalledTimes(2);
    watch.dispose();
    firstTheme.dispose();
    secondTheme.dispose();
  });

  it('ayrık eleman belgeye bağlanınca bildirir (kurucuda bağlı olmayan çizim yenilenir)', async () => {
    stubFrames();
    const scope = document.createElement('section');
    document.body.append(scope);
    const theme = new ThemeController({ theme: 'aurum' });
    theme.attach(scope);
    const target = document.createElement('div');
    const onChange = vi.fn();
    const watch = watchTheme(target, onChange);

    scope.append(target);
    await settle();
    expect(onChange).toHaveBeenCalledTimes(1);
    watch.dispose();
    theme.dispose();
  });

  it('ilk karede koşulsuz bir kez bildirir', () => {
    const frames = stubFrames();
    const target = document.createElement('div');
    document.body.append(target);
    const onChange = vi.fn();
    const watch = watchTheme(target, onChange);
    expect(onChange).not.toHaveBeenCalled();
    frames.run();
    expect(onChange).toHaveBeenCalledTimes(1);
    watch.dispose();
  });

  it('dispose sonrası bildirmez; ilk kare iptal edilir; ikinci dispose zararsızdır', async () => {
    const frames = stubFrames();
    const target = document.createElement('div');
    document.body.append(target);
    const onChange = vi.fn();
    const watch = watchTheme(target, onChange);
    watch.dispose();
    watch.dispose();
    frames.run();
    document.documentElement.setAttribute('data-vol-theme', 'aurum');
    await settle();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('küresel kök değişimini de yakalar', async () => {
    stubFrames();
    const target = document.createElement('div');
    document.body.append(target);
    const onChange = vi.fn();
    const watch = watchTheme(target, onChange);
    document.documentElement.setAttribute('data-vol-theme', 'aurum');
    await settle();
    expect(onChange).toHaveBeenCalledTimes(1);
    watch.dispose();
  });

  it('MutationObserver yoksa yalnız ilk kare yenilemesi çalışır', () => {
    const frames = stubFrames();
    vi.stubGlobal('MutationObserver', undefined);
    const target = document.createElement('div');
    const onChange = vi.fn();
    const watch = watchTheme(target, onChange);
    frames.run();
    expect(onChange).toHaveBeenCalledTimes(1);
    watch.dispose();
    vi.unstubAllGlobals();
  });
});
