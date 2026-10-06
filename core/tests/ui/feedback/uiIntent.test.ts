import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setHapticsDriver, setHapticsEnabled } from '../../../src/platform/haptics';
import {
  UiIntentBus,
  emitUiIntent,
  findUiIntentBus,
  uiIntentBusFor,
  type UiIntent,
} from '../../../src/ui/feedback/uiIntent';
import { UIRoot } from '../../../src/ui/layout/UIRoot';
import { Button } from '../../../src/ui/primitives/Button';
import { Checkbox } from '../../../src/ui/primitives/Checkbox';
import { IconButton } from '../../../src/ui/primitives/IconButton';
import { Input } from '../../../src/ui/primitives/Input';
import { NumberStepper } from '../../../src/ui/primitives/NumberStepper';
import { SegmentedControl } from '../../../src/ui/primitives/SegmentedControl';
import { Select } from '../../../src/ui/primitives/Select';
import { Slider } from '../../../src/ui/primitives/Slider';

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

function root(): { element: HTMLElement; bus: UiIntentBus; release(): void } {
  const element = document.createElement('div');
  document.body.append(element);
  const handle = uiIntentBusFor(element);
  return { element, ...handle };
}

function record(bus: UiIntentBus, options: { haptics?: boolean } = {}): UiIntent[] {
  const seen: UiIntent[] = [];
  bus.subscribe({ onIntent: (intent) => seen.push(intent) }, options);
  return seen;
}

/**
 * Güvenilir (gerçek kullanıcı) fare tıklaması gibi görünen olay. jsdom `isTrusted`i
 * değiştirilemez bırakır; bu yüzden yalnız `bus.emit`e doğrudan verilir (yayınlanmaz).
 */
function trustedClick(detail: number): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, detail });
  return new Proxy(event, {
    get(target, key) {
      if (key === 'isTrusted') return true;
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
    },
  });
}

describe('tek niyet / tek olay', () => {
  it('bir fiziksel işaretçi etkinleştirmesi (pointerdown, pointerup, click) tek niyet üretir', () => {
    const { element, bus } = root();
    const seen = record(bus);
    const button = new Button('Tamam');
    element.append(button.element);
    button.element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    button.element.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    button.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: 'press', origin: 'Button', persistent: true });
  });

  it('girdi yolu: fare tıklaması pointer, klavye etkinleştirmesi keyboard, yapay tıklama synthetic', () => {
    const { element, bus } = root();
    const seen = record(bus);
    const target = document.createElement('button');
    element.append(target);
    const request = { kind: 'press' as const, origin: 'Button', target };
    bus.emit({ ...request, event: trustedClick(1) });
    bus.emit({ ...request, event: trustedClick(0) });
    const button = new Button('Tamam');
    element.append(button.element);
    button.element.click(); // kol/odak etkinleştirmesi gibi yapay (güvenilmez) tıklama
    expect(seen.map((intent) => intent.source)).toEqual(['pointer', 'keyboard', 'synthetic']);
  });

  it('aynı yerel olayı iki bileşen işlerse yalnız içteki sahiplenir (iki kez üretilmez)', () => {
    const { element, bus } = root();
    const seen = record(bus);
    const card = document.createElement('div');
    const button = new Button('Satın al');
    card.append(button.element);
    element.append(card);
    // Kartın kendisi de aynı tıklamayı niyete çevirmek ister.
    card.addEventListener('click', (event) =>
      emitUiIntent({ kind: 'press', origin: 'Card', target: card, event }),
    );
    button.element.click();
    expect(seen.map((intent) => intent.origin)).toEqual(['Button']);
  });

  it('aynı olay nesnesi yeniden işlenirse ikinci üretim sessizdir', () => {
    const { element, bus } = root();
    expect(bus).toBeInstanceOf(UiIntentBus);
    const seen = record(bus);
    const event = new Event('click');
    const request = { kind: 'press' as const, origin: 'X', target: element, event };
    expect(bus.emit(request)).not.toBeNull();
    expect(bus.emit(request)).toBeNull();
    expect(seen).toHaveLength(1);
  });

  it('niyet kimlikleri artan ve tekildir', () => {
    const { element, bus } = root();
    expect(bus).toBeInstanceOf(UiIntentBus);
    const seen = record(bus);
    const button = new Button('A');
    element.append(button.element);
    button.element.click();
    button.element.click();
    expect(seen.map((intent) => intent.id)).toEqual([1, 2]);
  });
});

describe('programatik, devre dışı ve önizleme durumları', () => {
  it('programatik ayar sessizdir: setValue, setChecked, setDisabled niyet üretmez', () => {
    const { element, bus } = root();
    const seen = record(bus);
    const checkbox = new Checkbox({ checked: false });
    const select = new Select({
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      value: 'a',
    });
    const segmented = new SegmentedControl({
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      value: 'a',
    });
    const slider = new Slider({ min: 0, max: 10, value: 1 });
    const input = new Input({ value: 'x' });
    const stepper = new NumberStepper({ value: 1, min: 0, max: 9 });
    element.append(
      checkbox.element,
      select.element,
      segmented.element,
      slider.element,
      input.element,
      stepper.element,
    );
    checkbox.setChecked(true);
    checkbox.setDisabled(true);
    select.setValue('b');
    segmented.setValue('b');
    slider.setValue(5);
    input.setValue('y');
    stepper.setValue(4);
    // Olaysız bildirimli setter'lar da programatiktir: kök varken niyet ve titreşim yok.
    checkbox.setCheckedAndNotify(false);
    select.setValueAndNotify('a');
    expect(seen).toEqual([]);
    expect(play).not.toHaveBeenCalled();
  });

  it('devre dışı hedef niyet üretmez', () => {
    const { element, bus } = root();
    const seen = record(bus);
    const button = new Button('Pasif', { disabled: true });
    element.append(button.element);
    expect(
      bus.emit({
        kind: 'press',
        origin: 'Button',
        target: button.element,
        event: new Event('click'),
      }),
    ).toBeNull();
    const aria = document.createElement('div');
    aria.setAttribute('aria-disabled', 'true');
    element.append(aria);
    expect(
      bus.emit({ kind: 'press', origin: 'X', target: aria, event: new Event('click') }),
    ).toBeNull();
    const inert = document.createElement('div');
    inert.setAttribute('inert', '');
    const child = document.createElement('button');
    inert.append(child);
    element.append(inert);
    expect(
      bus.emit({ kind: 'press', origin: 'X', target: child, event: new Event('click') }),
    ).toBeNull();
    expect(seen).toEqual([]);
  });

  it('önizleme (persistent=false) ile kalıcı değişiklik (persistent=true) ayrı niyetlerdir', () => {
    const { element, bus } = root();
    const seen = record(bus);
    const slider = new Slider({ min: 0, max: 10, value: 1 });
    const input = new Input({ value: 'a' });
    const stepper = new NumberStepper({ value: 1, min: 0, max: 9 });
    element.append(slider.element, input.element, stepper.element);

    const range = slider.element.querySelector<HTMLInputElement>('input')!;
    range.value = '4';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    input.element.value = 'ab';
    input.element.dispatchEvent(new Event('input', { bubbles: true }));
    input.element.dispatchEvent(new Event('change', { bubbles: true }));
    stepper.element.querySelectorAll('button')[1].click();

    expect(seen.map((intent) => [intent.origin, intent.kind, intent.persistent])).toEqual([
      ['Slider', 'valuePreview', false],
      ['Slider', 'valueCommit', true],
      ['Input', 'valuePreview', false],
      ['Input', 'valueCommit', true],
      ['NumberStepper', 'valueCommit', true],
    ]);
  });

  it('değişmeyen değer commit niyeti üretmez', () => {
    const { element, bus } = root();
    const seen = record(bus);
    const input = new Input({ value: 'a' });
    element.append(input.element);
    input.element.dispatchEvent(new Event('change', { bubbles: true }));
    expect(seen).toEqual([]);
  });
});

describe('ürün sonucunu host bildirir', () => {
  it('Promise çözülmesi başarı niyeti DEĞİLDİR; yalnız reportOutcome sonucu yayar', async () => {
    const { element, bus } = root();
    const outcomes: string[] = [];
    bus.subscribe({ onOutcome: (intent, outcome) => outcomes.push(`${intent.origin}:${outcome}`) });
    const button = new Button('Kaydet', { onClick: () => Promise.resolve() });
    element.append(button.element);
    button.element.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(outcomes).toEqual([]);
    expect(bus.reportOutcome(button.element, 'success')).toBe(true);
    expect(outcomes).toEqual(['Button:success']);
  });

  it('niyeti olmayan hedef için sonuç bildirimi sessizce reddedilir', () => {
    const { element, bus } = root();
    const outcomes: string[] = [];
    bus.subscribe({ onOutcome: (_i, outcome) => outcomes.push(outcome) });
    expect(bus.reportOutcome(element, 'error')).toBe(false);
    expect(outcomes).toEqual([]);
  });

  it('bozuk bir dinleyici diğerlerini engellemez ve hata bildirilir', () => {
    const { element, bus } = root();
    const onError = vi.fn();
    bus.subscribe(
      {
        onIntent: () => {
          throw new Error('bozuk');
        },
      },
      { onError },
    );
    const seen = record(bus);
    const button = new Button('A');
    element.append(button.element);
    button.element.click();
    expect(seen).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('titreşim sahipliği: çift darbe yok', () => {
  it('kök yokken eski primitif titreşim yolu aynen çalışır (bir darbe)', () => {
    const button = new Button('Tamam');
    document.body.append(button.element);
    button.element.click();
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith('tap', 1);
  });

  it('kök var ama sağlayıcı titreşimi üstlenmediyse primitif bir darbe üretir ve niyet de yayılır', () => {
    const { element, bus } = root();
    const seen = record(bus);
    const button = new Button('Tamam');
    element.append(button.element);
    button.element.click();
    expect(play).toHaveBeenCalledTimes(1);
    expect(seen).toHaveLength(1);
  });

  it('sağlayıcı titreşimi üstlendiyse primitif titremez: darbeyi yalnız sağlayıcı üretir', () => {
    const { element, bus } = root();
    const subscription = bus.subscribe(
      { onIntent: (intent) => void emitHaptic(intent) },
      { haptics: true },
    );
    function emitHaptic(intent: UiIntent): void {
      setHapticsDriver({ play });
      play(intent.defaultHaptic, 1);
    }
    const button = new Button('Tamam');
    const icon = new IconButton('×', { label: 'Kapat' });
    element.append(button.element, icon.element);
    expect(bus.ownsHaptics).toBe(true);
    button.element.click();
    icon.element.click();
    expect(play).toHaveBeenCalledTimes(2); // her niyet için TEK darbe (sağlayıcıdan)
    subscription.dispose();
    expect(bus.ownsHaptics).toBe(false);
    play.mockClear();
    button.element.click();
    expect(play).toHaveBeenCalledTimes(1); // sağlayıcı gidince eski yol geri gelir
  });

  it('haptic:false açıkça kapatır: kök ve sağlayıcı olmasa da titreşim yok', () => {
    const { element, bus } = root();
    record(bus);
    const button = new Button('Sessiz', { haptic: false });
    element.append(button.element);
    button.element.click();
    expect(play).not.toHaveBeenCalled();
  });
});

describe('kök paylaşımı', () => {
  it('aynı elemanı paylaşan iki UIRoot tek veriyolu görür; dinleyici ve niyet çoğalmaz', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const one = new UIRoot(parent);
    const two = new UIRoot(parent);
    expect(one.intents).toBe(two.intents);
    const seen = record(one.intents);
    const button = new Button('Tamam');
    one.mount(button.element);
    button.element.click();
    expect(one.intents.listenerCount).toBe(1);
    expect(seen).toHaveLength(1);
    one.destroy();
    // Son sahip gidene kadar veriyolu yaşar.
    button.element.click();
    expect(seen).toHaveLength(2);
    two.destroy();
    expect(findUiIntentBus(button.element)).toBeNull();
  });

  it('release ikinci çağrıda etkisizdir ve son bırakış kaydı siler', () => {
    const element = document.createElement('div');
    const a = uiIntentBusFor(element);
    const b = uiIntentBusFor(element);
    expect(a.bus).toBe(b.bus);
    a.release();
    a.release();
    expect(findUiIntentBus(element)).toBe(a.bus);
    b.release();
    expect(findUiIntentBus(element)).toBeNull();
  });

  it('en yakın kayıtlı kök kullanılır: iç içe kökte içteki veriyolu', () => {
    const outer = root();
    const inner = document.createElement('div');
    outer.element.append(inner);
    const innerHandle = uiIntentBusFor(inner);
    const leaf = document.createElement('button');
    inner.append(leaf);
    expect(findUiIntentBus(leaf)).toBe(innerHandle.bus);
    innerHandle.release();
    expect(findUiIntentBus(leaf)).toBe(outer.bus);
  });
});
