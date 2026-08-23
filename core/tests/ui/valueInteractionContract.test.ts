import { describe, expect, it, vi } from 'vitest';
import { Input } from '../../src/ui/primitives/Input';
import { TextArea } from '../../src/ui/primitives/TextArea';
import { NumberStepper } from '../../src/ui/primitives/NumberStepper';
import { Slider } from '../../src/ui/primitives/Slider';
import { RangeSlider } from '../../src/ui/primitives/RangeSlider';
import { Checkbox } from '../../src/ui/primitives/Checkbox';
import { RadioGroup } from '../../src/ui/primitives/RadioGroup';
import { SegmentedControl } from '../../src/ui/primitives/SegmentedControl';
import { Select } from '../../src/ui/primitives/Select';
import { ColorPicker } from '../../src/ui/primitives/ColorPicker';

describe('Değer kontrolleri — input/commit sözleşmesi', () => {
  it('Input canlı input ve tek commit üretir; setter sessiz baseline kurar', () => {
    const onInput = vi.fn();
    const onCommit = vi.fn();
    const onEnter = vi.fn();
    const control = new Input({ value: 'a', onInput, onCommit, onEnter });

    control.element.value = 'ab';
    control.element.dispatchEvent(new Event('input'));
    expect(onInput).toHaveBeenCalledWith('ab');
    expect(onCommit).not.toHaveBeenCalled();

    control.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    control.element.dispatchEvent(new Event('change'));
    expect(onEnter).toHaveBeenCalledWith('ab');
    expect(onCommit).toHaveBeenCalledTimes(1);

    control.setValue('server');
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
    control.setValueAndNotify('manual');
    expect(onInput).toHaveBeenLastCalledWith('manual');
    expect(onCommit).toHaveBeenLastCalledWith('manual');
    control.destroy();
  });

  it('TextArea canlı input, change commit ve sessiz setter sağlar', () => {
    const onInput = vi.fn();
    const onCommit = vi.fn();
    const control = new TextArea({ value: 'a', onInput, onCommit, maxLength: 10 });
    const textarea = control.element.querySelector('textarea')!;
    textarea.value = 'abc';
    textarea.dispatchEvent(new Event('input'));
    textarea.dispatchEvent(new Event('change'));
    expect(onInput).toHaveBeenCalledWith('abc');
    expect(onCommit).toHaveBeenCalledWith('abc');

    control.setValue('silent');
    expect(onInput).toHaveBeenCalledTimes(1);
    control.setValueAndNotify('notify');
    expect(onInput).toHaveBeenLastCalledWith('notify');
    expect(onCommit).toHaveBeenLastCalledWith('notify');
    control.destroy();
  });

  it('NumberStepper yazarken input, tamamlanınca commit ve legacy onChange üretir', () => {
    const onInput = vi.fn();
    const onCommit = vi.fn();
    const onChange = vi.fn();
    const control = new NumberStepper({ value: 2, min: 0, max: 10, onInput, onCommit, onChange });
    const input = control.element.querySelector<HTMLInputElement>('input')!;
    input.value = '7';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(onInput).toHaveBeenCalledWith(7);
    expect(onCommit).toHaveBeenCalledWith(7);
    expect(onChange).toHaveBeenCalledWith(7);

    control.element.querySelector<HTMLButtonElement>('.vol-stepper__button')!.click();
    expect(onInput).toHaveBeenLastCalledWith(6);
    expect(onCommit).toHaveBeenLastCalledWith(6);
    control.setValue(9);
    expect(onCommit).toHaveBeenCalledTimes(2);
    control.destroy();
  });

  it('Slider input sırasında canlı, change sırasında tek commit üretir', () => {
    const onInput = vi.fn();
    const onCommit = vi.fn();
    const onChange = vi.fn();
    const control = new Slider({ value: 10, onInput, onCommit, onChange });
    const input = control.element.querySelector<HTMLInputElement>('input')!;
    input.value = '25';
    input.dispatchEvent(new Event('input'));
    input.value = '30';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    expect(onInput).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(30);

    input.value = '50';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(control.getValue()).toBe(30);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onInput).toHaveBeenLastCalledWith(30);
    control.destroy();
  });

  it('RangeSlider pointer gesture başına tek commit üretir ve cancel geri alır', () => {
    const onInput = vi.fn();
    const onCommit = vi.fn();
    const control = new RangeSlider({ value: { min: 0, max: 100 }, onInput, onCommit });
    const track = control.element.querySelector<HTMLElement>('.vol-range-slider__track')!;
    const minHandle = control.element.querySelector<HTMLElement>('.vol-range-slider__handle--min')!;
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      right: 100,
      top: 0,
      bottom: 10,
      width: 100,
      height: 10,
      toJSON: () => ({}),
    });
    minHandle.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 4, clientX: 0, button: 0, bubbles: true }),
    );
    track.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 4, clientX: 30, bubbles: true }),
    );
    track.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 4, clientX: 30, bubbles: true }),
    );
    expect(onInput).toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(control.getValue().min).toBe(30);

    minHandle.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 5, clientX: 30, button: 0, bubbles: true }),
    );
    track.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 5, clientX: 60, bubbles: true }),
    );
    track.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 5, bubbles: true }));
    expect(control.getValue().min).toBe(30);
    expect(onInput).toHaveBeenLastCalledWith({ min: 30, max: 100 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    control.destroy();
  });

  it('ayrık kontroller kullanıcı değişiminde input/commit/legacy callbacklerini birer kez üretir', () => {
    const callbacks = () => ({ onInput: vi.fn(), onCommit: vi.fn(), onChange: vi.fn() });

    const checkboxCallbacks = callbacks();
    const checkbox = new Checkbox({ ...checkboxCallbacks });
    document.body.appendChild(checkbox.element);
    checkbox.element.querySelector<HTMLInputElement>('input')!.click();
    expect(checkboxCallbacks.onInput).toHaveBeenCalledWith(true);
    expect(checkboxCallbacks.onCommit).toHaveBeenCalledWith(true);
    expect(checkboxCallbacks.onChange).toHaveBeenCalledWith(true);
    checkbox.setChecked(false);
    expect(checkboxCallbacks.onCommit).toHaveBeenCalledTimes(1);

    const radioCallbacks = callbacks();
    const radio = new RadioGroup({
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B', disabled: true },
      ],
      value: 'a',
      ...radioCallbacks,
    });
    radio.element.querySelectorAll<HTMLInputElement>('input')[1].dispatchEvent(new Event('change'));
    expect(radioCallbacks.onCommit).not.toHaveBeenCalled();
    radio.setDisabled(false);
    expect(radio.element.querySelectorAll<HTMLInputElement>('input')[1].disabled).toBe(true);
    radio.setValueAndNotify('a');
    expect(radioCallbacks.onCommit).not.toHaveBeenCalled();

    const segmentCallbacks = callbacks();
    const segment = new SegmentedControl({
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      value: 'a',
      ...segmentCallbacks,
    });
    segment.element.querySelectorAll<HTMLButtonElement>('button')[1].click();
    expect(segmentCallbacks.onInput).toHaveBeenCalledWith('b');
    expect(segmentCallbacks.onCommit).toHaveBeenCalledWith('b');
    segment.setValue('a');
    expect(segmentCallbacks.onCommit).toHaveBeenCalledTimes(1);

    checkbox.destroy();
    radio.destroy();
    segment.destroy();
  });

  it('Select ve ColorPicker programatik setterda sessiz, kullanıcıda input+commit üretir', () => {
    const selectInput = vi.fn();
    const selectCommit = vi.fn();
    const select = new Select({
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      value: 'a',
      onInput: selectInput,
      onCommit: selectCommit,
    });
    select.setValue('b');
    expect(selectInput).not.toHaveBeenCalled();
    select.setValueAndNotify('a');
    expect(selectInput).toHaveBeenCalledWith('a');
    expect(selectCommit).toHaveBeenCalledWith('a');

    const colorInput = vi.fn();
    const colorCommit = vi.fn();
    const color = new ColorPicker({
      value: '#000000',
      swatches: ['#ffffff'],
      onInput: colorInput,
      onCommit: colorCommit,
    });
    color.setValue('#123456');
    expect(colorInput).not.toHaveBeenCalled();
    color.element.querySelector<HTMLButtonElement>('button')!.click();
    expect(colorInput).toHaveBeenCalledWith('#ffffff');
    expect(colorCommit).toHaveBeenCalledWith('#ffffff');

    select.destroy();
    color.destroy();
  });
});
