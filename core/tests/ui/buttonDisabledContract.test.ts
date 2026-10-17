import { afterEach, describe, expect, it } from 'vitest';
import { Button } from '../../src/ui/primitives/Button';
import { IconButton } from '../../src/ui/primitives/IconButton';
import { Toolbar } from '../../src/ui/primitives/Toolbar';

/**
 * Devre dışı sözleşmesi: yükleme (async handler) sahibin istediği `disabled` durumunu EZMEZ.
 * Handler sürerken dışarıdan devre dışı bırakılan düğme, handler bitince açılmaz; handler sürerken
 * "açılan" düğme ise yükleme bitene kadar kapalı kalır.
 */
afterEach(() => {
  document.body.replaceChildren();
});

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe.each([
  ['Button', () => new Button('Kaydet', { fullWidth: false })],
  ['IconButton', () => new IconButton('x', { label: 'Kaydet' })],
] as const)('%s devre dışı korunumu', (_name, make) => {
  it('async handler sırasında dışarıdan kapatılan düğme bitişte kapalı kalır', async () => {
    const control = make();
    document.body.append(control.element);
    const gate = deferred();
    control.onClick(() => gate.promise);
    control.element.click();
    expect(control.element.disabled).toBe(true);
    expect(control.element.getAttribute('aria-busy')).toBe('true');

    control.setDisabled(true);
    gate.resolve();
    await flush();
    expect(control.element.getAttribute('aria-busy')).toBe('false');
    expect(control.element.disabled).toBe(true);

    control.setDisabled(false);
    expect(control.element.disabled).toBe(false);
  });

  it('async handler sırasında açılan düğme yükleme bitene kadar kapalı kalır, sonra açılır', async () => {
    const control = make();
    document.body.append(control.element);
    control.setDisabled(true);
    control.setDisabled(false);
    const gate = deferred();
    control.onClick(() => gate.promise);
    control.element.click();
    control.setDisabled(true);
    control.setDisabled(false);
    expect(control.element.disabled).toBe(true);
    gate.resolve();
    await flush();
    expect(control.element.disabled).toBe(false);
  });
});

describe('Toolbar gezici tabindex uç durumları', () => {
  const press = (toolbar: Toolbar, key: string): void => {
    const active = document.activeElement ?? toolbar.element;
    active.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  };
  const stops = (toolbar: Toolbar): number[] =>
    [...toolbar.element.querySelectorAll<HTMLElement>('.vol-tool-button')].map((b) => b.tabIndex);

  it('tümü devre dışıyken hiçbir düğme sekme durağı değildir; biri açılınca o durak olur', () => {
    const toolbar = new Toolbar({
      ariaLabel: 'Araçlar',
      items: [
        { id: 'a', label: 'A', text: 'A', disabled: true },
        { id: 'b', label: 'B', text: 'B', disabled: true },
      ],
    });
    document.body.append(toolbar.element);
    expect(stops(toolbar)).toEqual([-1, -1]);
    toolbar.setButtonDisabled('b', false);
    expect(stops(toolbar)).toEqual([-1, 0]);
  });

  it('dikey çoklu seçimde ok tuşları yalnız etkin düğmeleri dolaşır ve seçim bağımsızdır', () => {
    const values: Array<string | string[] | undefined> = [];
    const toolbar = new Toolbar({
      ariaLabel: 'Araçlar',
      orientation: 'vertical',
      selectionMode: 'multiple',
      items: [
        { id: 'a', label: 'A', text: 'A' },
        { id: 'b', label: 'B', text: 'B', disabled: true },
        { id: 'c', label: 'C', text: 'C' },
      ],
      onChange: (value) => values.push(value),
    });
    document.body.append(toolbar.element);
    toolbar.getButton('a')?.focus();
    press(toolbar, 'ArrowDown');
    expect(document.activeElement).toBe(toolbar.getButton('c')?.element);
    expect(stops(toolbar)).toEqual([-1, -1, 0]);
    // Yatay ok dikeyde gezinmez.
    press(toolbar, 'ArrowRight');
    expect(document.activeElement).toBe(toolbar.getButton('c')?.element);
    toolbar.getButton('a')?.element.click();
    toolbar.getButton('c')?.element.click();
    expect(values.at(-1)).toEqual(['a', 'c']);
    toolbar.getButton('a')?.element.click();
    expect(values.at(-1)).toEqual(['c']);
  });

  it('odaklı düğme devre dışı kalınca durak etkin komşuya geçer', () => {
    const toolbar = new Toolbar({
      ariaLabel: 'Araçlar',
      items: [
        { id: 'a', label: 'A', text: 'A' },
        { id: 'b', label: 'B', text: 'B' },
      ],
    });
    document.body.append(toolbar.element);
    toolbar.getButton('a')?.focus();
    toolbar.setButtonDisabled('a', true);
    expect(stops(toolbar)).toEqual([-1, 0]);
  });
});
