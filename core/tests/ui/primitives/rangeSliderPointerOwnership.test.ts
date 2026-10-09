import { afterEach, describe, expect, it, vi } from 'vitest';
import { RangeSlider } from '../../../src/ui/primitives/RangeSlider';

const sliders: RangeSlider[] = [];
function make() {
  const onInput = vi.fn();
  const onCommit = vi.fn();
  const slider = new RangeSlider({ value: { min: 20, max: 80 }, onInput, onCommit });
  sliders.push(slider);
  document.body.appendChild(slider.element);
  const track = slider.element.querySelector<HTMLElement>('.vol-range-slider__track')!;
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 100,
    bottom: 10,
    width: 100,
    height: 10,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return { slider, track, onInput, onCommit };
}

function pointer(
  track: HTMLElement,
  type: string,
  pointerId: number,
  clientX: number,
  extra: PointerEventInit = {},
) {
  track.dispatchEvent(
    new PointerEvent(type, { pointerId, clientX, bubbles: true, button: 0, ...extra }),
  );
}

afterEach(() => sliders.splice(0).forEach((slider) => slider.destroy()));

describe('RangeSlider işaretçi sahipliği', () => {
  it('ikinci parmağın hareketi önizleme veya commit değerini değiştirmez', () => {
    const { slider, track, onInput, onCommit } = make();
    pointer(track, 'pointerdown', 1, 30);
    onInput.mockClear();
    pointer(track, 'pointermove', 2, 70);
    expect(slider.getValue()).toEqual({ min: 30, max: 80 });
    expect(onInput).not.toHaveBeenCalled();
    pointer(track, 'pointerup', 1, 30);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith({ min: 30, max: 80 });
  });

  it('ikinci basış ilk parmağın iptal snapshotını ve yakalamasını çalmaz', () => {
    const { slider, track, onCommit } = make();
    pointer(track, 'pointerdown', 1, 30);
    pointer(track, 'pointerdown', 2, 90, { isPrimary: false });
    pointer(track, 'pointercancel', 1, 30);
    expect(slider.getValue()).toEqual({ min: 20, max: 80 });
    expect(track.hasPointerCapture(1)).toBe(false);
    expect(track.hasPointerCapture(2)).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it.each([{ isPrimary: false }, { pointerType: 'mouse', button: 2 }])(
    'birincil olmayan veya sağ düğme yeni jest başlatmaz: %j',
    (extra) => {
      const { slider, track, onInput, onCommit } = make();
      pointer(track, 'pointerdown', 2, 60, extra);
      pointer(track, 'pointerup', 2, 60);
      expect(slider.getValue()).toEqual({ min: 20, max: 80 });
      expect(onInput).not.toHaveBeenCalled();
      expect(onCommit).not.toHaveBeenCalled();
    },
  );
});
