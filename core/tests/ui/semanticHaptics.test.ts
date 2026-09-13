import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setHapticsDriver, setHapticsEnabled } from '../../src/platform/haptics';
import { Button } from '../../src/ui/primitives/Button';
import { Checkbox } from '../../src/ui/primitives/Checkbox';
import { IconButton } from '../../src/ui/primitives/IconButton';
import { SegmentedControl } from '../../src/ui/primitives/SegmentedControl';
import { Select } from '../../src/ui/primitives/Select';

const play = vi.fn();

beforeEach(() => {
  let timeMs = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => (timeMs += 100));
  play.mockClear();
  setHapticsDriver({ play });
  setHapticsEnabled(true);
});

afterEach(() => {
  setHapticsEnabled(false);
  setHapticsDriver(null);
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('CORE semantik UI titreşimi', () => {
  it('Button ve IconButton kullanıcı callbackinden önce tap üretir', () => {
    const order: string[] = [];
    play.mockImplementation(() => order.push('haptic'));
    const button = new Button('Kaydet', {
      onClick: () => {
        order.push('button');
      },
    });
    const iconButton = new IconButton('×', {
      label: 'Kapat',
      onClick: () => {
        order.push('icon');
      },
    });

    button.element.click();
    iconButton.element.click();

    expect(order).toEqual(['haptic', 'button', 'haptic', 'icon']);
    expect(play).toHaveBeenNthCalledWith(1, 'tap');
  });

  it('false ile primitive titreşimi açıkça kapatılabilir', () => {
    const button = new Button('Sessiz', { haptic: false });

    button.element.click();

    expect(play).not.toHaveBeenCalled();
  });

  it('Checkbox, Select ve SegmentedControl yalnız değer commitinde select üretir', () => {
    const checkbox = new Checkbox({ checked: false });
    const select = new Select({
      options: [
        { value: 'tr', label: 'Türkçe' },
        { value: 'en', label: 'English' },
      ],
      value: 'tr',
    });
    const segmented = new SegmentedControl({
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      value: 'a',
    });
    document.body.append(checkbox.element, select.element, segmented.element);

    checkbox.setCheckedAndNotify(true);
    select.element.click();
    document.querySelector<HTMLButtonElement>('[role="option"][aria-selected="false"]')!.click();
    segmented.element.querySelectorAll('button')[1].click();

    expect(play.mock.calls).toEqual([['select'], ['select'], ['select']]);
  });
});
