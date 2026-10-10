import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UI_SLIDER_DRAG_GAIN,
  UI_SLIDER_RATE_RANGE,
  UiSoundKit,
  type UiSoundAssets,
} from '../../src/audio/ui';
import { uiIntentBusFor, type UiIntent } from '../../src/ui/feedback/uiIntent';
import { NumberStepper } from '../../src/ui/primitives/NumberStepper';
import { RangeSlider } from '../../src/ui/primitives/RangeSlider';
import { Slider } from '../../src/ui/primitives/Slider';
import { FakeContext, stubFetch } from '../support/fakeAudio';

const ASSETS: UiSoundAssets = {
  sliderTick: ['t0.ogg'],
  valueCommit: ['c0.ogg'],
};

let clock = 0;

async function mounted() {
  const context = new FakeContext();
  context.state = 'running';
  const handle = uiIntentBusFor(document.body);
  const kit = new UiSoundKit({
    assets: ASSETS,
    context: context as unknown as AudioContext,
    now: () => clock,
  });
  await kit.preload();
  kit.attach(handle.bus);
  const seen: UiIntent[] = [];
  handle.bus.subscribe({ onIntent: (intent) => seen.push(intent) });
  return { kit, context, seen, release: handle.release };
}

/** Son başlayan sesin kazancı: bankanın ses başına düğümü. */
const lastVoiceGain = (context: FakeContext): number => context.gains.at(-1)!.gain.value;
const lastRate = (context: FakeContext): number => context.sources.at(-1)!.playbackRate.value;

beforeEach(() => {
  clock = 0;
  stubFetch();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('Slider sesi: sürükleme kısık, klavye tam seviye', () => {
  function slider() {
    const control = new Slider({ label: 'Ses', min: 0, max: 10, step: 1, value: 0 });
    document.body.append(control.element);
    const input = control.element.querySelector('input')!;
    const step = (value: number): void => {
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    return { control, input, step };
  }

  it('basılı işaretçiyle adım adım tick üretir; kazanç kısıktır, perde değere bağlıdır', async () => {
    const { context, seen, release } = await mounted();
    const { input, step } = slider();
    input.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', bubbles: true }));
    step(2);
    clock += 100;
    step(9);

    expect(seen.map((intent) => [intent.kind, intent.source])).toEqual([
      ['valuePreview', 'pointer'],
      ['valuePreview', 'pointer'],
    ]);
    expect(context.sources).toHaveLength(2);
    expect(lastVoiceGain(context)).toBeCloseTo(UI_SLIDER_DRAG_GAIN);
    const [low, high] = UI_SLIDER_RATE_RANGE;
    // 9/10 konumu: perde aralığın üst kısmında; ±%4 titreşim payı tanınır.
    expect(lastRate(context)).toBeGreaterThan(low + (high - low) * 0.9 - 0.06);
    expect(lastRate(context)).toBeLessThan(low + (high - low) * 0.9 + 0.06);
    release();
  });

  it('dokunma da sürüklemedir; işaretçi bırakılınca sonraki adım tam seviyedir', async () => {
    const { context, seen, release } = await mounted();
    const { input, step } = slider();
    input.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    step(1);
    expect(seen[0]?.source).toBe('touch');
    expect(lastVoiceGain(context)).toBeCloseTo(UI_SLIDER_DRAG_GAIN);

    input.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', bubbles: true }));
    clock += 100;
    step(2);
    expect(seen[1]?.source).not.toBe('touch');
    expect(lastVoiceGain(context)).toBe(1);
    release();
  });

  it('klavye adımı (işaretçi yok) tam seviyede çalar', async () => {
    const { context, release } = await mounted();
    const { step } = slider();
    step(3);
    expect(context.sources).toHaveLength(1);
    expect(lastVoiceGain(context)).toBe(1);
    release();
  });

  it('her adım tek tick üretir (45 ms aralığın dışında)', async () => {
    const { context, release } = await mounted();
    const { step } = slider();
    step(3);
    clock += 100;
    step(4);
    clock += 100;
    step(5);
    expect(context.sources).toHaveLength(3);
    release();
  });
});

describe('RangeSlider sesi', () => {
  function range() {
    const control = new RangeSlider({ min: 0, max: 100, step: 10, value: { min: 20, max: 80 } });
    document.body.append(control.element);
    const track = control.element.querySelector<HTMLElement>('.vol-range-slider__track')!;
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
    const handles = control.element.querySelectorAll<HTMLElement>('.vol-range-slider__handle');
    return { control, track, minHandle: handles[0], maxHandle: handles[1] };
  }

  it('sürükleme önizleme tickleri üretir (kısık), bırakış tek kalıcı değişiklik sesidir', async () => {
    const { context, seen, release } = await mounted();
    const { track } = range();
    const pointer = (type: string, clientX: number): void => {
      track.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          clientX,
          bubbles: true,
          button: 0,
          pointerType: 'mouse',
        }),
      );
    };
    pointer('pointerdown', 30);
    clock += 100;
    pointer('pointermove', 50);
    clock += 100;
    pointer('pointerup', 50);

    expect(seen.map((intent) => `${intent.kind}:${intent.origin}:${intent.persistent}`)).toEqual([
      'valuePreview:RangeSlider:false',
      'valuePreview:RangeSlider:false',
      'valueCommit:RangeSlider:true',
    ]);
    expect(seen.map((intent) => intent.source)).toEqual(['pointer', 'pointer', 'pointer']);
    expect(context.sources).toHaveLength(3);
    release();
  });

  it('perde tutamağın değil BÜTÜN aralığın konumuna bağlıdır', async () => {
    const { context, release } = await mounted();
    const { minHandle, maxHandle } = range();
    // Üst tutamak (80/100) alt tutamaktan (20/100) yüksek perde verir.
    maxHandle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    const maxRate = lastRate(context);
    clock += 100;
    minHandle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const minRate = lastRate(context);
    expect(maxRate).toBeGreaterThan(minRate);
    release();
  });

  it('klavye adımı hem önizleme hem kalıcı değişiklik üretir; sınırda adım sessizdir', async () => {
    const { seen, release } = await mounted();
    const { minHandle } = range();
    minHandle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(seen.map((intent) => intent.kind)).toEqual(['valuePreview', 'valueCommit']);
    expect(seen.every((intent) => intent.source !== 'pointer')).toBe(true);

    seen.length = 0;
    // 80'i aşamayacağı sınıra getir; değişmeyen adım niyet üretmez.
    for (let i = 0; i < 20; i++) {
      minHandle.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    }
    seen.length = 0;
    minHandle.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(seen).toEqual([]);
    release();
  });

  it('Escape ve pointercancel sessizdir; programatik değer atama niyet üretmez', async () => {
    const { seen, release } = await mounted();
    const { control, track } = range();
    track.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 30, bubbles: true, button: 0 }),
    );
    seen.length = 0;
    track.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }));
    control.setValue({ min: 10, max: 90 });
    control.setValueAndNotify({ min: 30, max: 70 });
    expect(seen).toEqual([]);
    release();
  });
});

describe('NumberStepper sesi', () => {
  it('düğme adımı kaydırıcı tickidir; perde değerin aralıktaki konumuna bağlıdır', async () => {
    const { context, seen, release } = await mounted();
    const control = new NumberStepper({ min: 0, max: 10, value: 1 });
    document.body.append(control.element);
    const [minus, plus] = control.element.querySelectorAll<HTMLButtonElement>('button');

    plus.click();
    const lowRate = lastRate(context);
    for (let value = 2; value < 9; value++) {
      clock += 100;
      plus.click();
    }
    clock += 100;
    plus.click();
    const highRate = lastRate(context);
    expect(highRate).toBeGreaterThan(lowRate);
    expect(seen.filter((intent) => intent.kind === 'valuePreview').length).toBeGreaterThan(0);

    clock += 100;
    const before = context.sources.length;
    minus.click();
    expect(context.sources.length).toBeGreaterThan(before);
    release();
  });

  it('geçersiz yazı ve programatik atama ses üretmez', async () => {
    const { context, release } = await mounted();
    const control = new NumberStepper({ min: 0, max: 10, value: 4 });
    document.body.append(control.element);
    const input = control.element.querySelector<HTMLInputElement>('input')!;
    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    control.setValue(7);
    expect(context.sources).toHaveLength(0);
    release();
  });
});
