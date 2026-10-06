import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setHapticsDriver,
  setHapticsEnabled,
  type HapticsDriver,
} from '../../../src/platform/haptics';
import { UiHapticProvider } from '../../../src/ui/feedback/UiHapticProvider';
import { uiIntentBusFor, type UiIntentBus } from '../../../src/ui/feedback/uiIntent';
import { Button } from '../../../src/ui/primitives/Button';
import { Checkbox } from '../../../src/ui/primitives/Checkbox';

const play = vi.fn();
const cancel = vi.fn();
const driver: HapticsDriver = { play, cancel };

let timeMs = 0;

function root(): { element: HTMLElement; bus: UiIntentBus; release(): void } {
  const element = document.createElement('div');
  document.body.append(element);
  return { element, ...uiIntentBusFor(element) };
}

beforeEach(() => {
  timeMs = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => (timeMs += 1000));
  play.mockClear();
  cancel.mockClear();
  setHapticsDriver(driver);
  setHapticsEnabled(true);
});

afterEach(() => {
  setHapticsEnabled(false);
  setHapticsDriver(null);
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('UiHapticProvider: tek darbe ve tek sahip', () => {
  it('bir niyet bileşen deseniyle TEK darbe üretir; bileşenin kendi yolu susar', () => {
    const { element, bus } = root();
    const provider = new UiHapticProvider();
    provider.attach(bus);
    const button = new Button('Tamam');
    const checkbox = new Checkbox({ checked: false });
    element.append(button.element, checkbox.element);
    button.element.click();
    checkbox.setCheckedAndNotify(true); // olaysız: kök varken programatik, sessiz
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith('tap', 1);
    expect(bus.ownsHaptics).toBe(true);
  });

  it('haptic:false niyeti bastırır; açık desen varsayılana baskındır', () => {
    const { element, bus } = root();
    new UiHapticProvider().attach(bus);
    const silent = new Button('Sessiz', { haptic: false });
    const strong = new Button('Hata', { haptic: 'error' });
    element.append(silent.element, strong.element);
    silent.element.click();
    expect(play).not.toHaveBeenCalled();
    strong.element.click();
    expect(play).toHaveBeenCalledWith('error', 1);
  });

  it('ürün sonucu host bildirince darbe üretir; Promise çözülmesi üretmez', async () => {
    const { element, bus } = root();
    new UiHapticProvider().attach(bus);
    const button = new Button('Kaydet', { haptic: false, onClick: () => Promise.resolve() });
    element.append(button.element);
    button.element.click();
    await Promise.resolve();
    expect(play).not.toHaveBeenCalled();
    bus.reportOutcome(button.element, 'success');
    expect(play).toHaveBeenCalledWith('success', 1);
    bus.reportOutcome(button.element, 'error');
    expect(play).toHaveBeenLastCalledWith('error', 1);
  });

  it('aynı veriyoluna ikinci attach ikinci darbe üretmez', () => {
    const { element, bus } = root();
    const provider = new UiHapticProvider();
    provider.attach(bus);
    provider.attach(bus);
    const button = new Button('Tamam');
    element.append(button.element);
    button.element.click();
    expect(play).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount).toBe(1);
  });
});

describe('varsayılan kapalı, şiddet, kapasite ve sıklık sınırı', () => {
  it('titreşim varsayılan KAPALIdır: açılmadıkça darbe yok, açılınca var', () => {
    setHapticsEnabled(false);
    const { element, bus } = root();
    const provider = new UiHapticProvider();
    provider.attach(bus);
    const button = new Button('Tamam');
    element.append(button.element);
    button.element.click();
    expect(provider.active).toBe(false);
    expect(play).not.toHaveBeenCalled();
    setHapticsEnabled(true);
    timeMs += 1000;
    button.element.click();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('şiddet sürücüye iletilir; sıfır şiddet hiçbir darbe üretmez; bozuk değer tam şiddet olur', () => {
    const { element, bus } = root();
    const provider = new UiHapticProvider({ intensity: 0.4 });
    provider.attach(bus);
    const button = new Button('Tamam');
    element.append(button.element);
    button.element.click();
    expect(play).toHaveBeenCalledWith('tap', 0.4);
    expect(provider.setIntensity(0)).toBe(0);
    button.element.click();
    expect(play).toHaveBeenCalledTimes(1);
    expect(provider.setIntensity(Number.NaN)).toBe(1);
    expect(provider.setIntensity(7)).toBe(1);
    expect(provider.setIntensity(-3)).toBe(0);
  });

  it('sürücü yokluğu normal sonuçtur: hata yok, niyet işlenir, sağlayıcı pasif görünür', () => {
    setHapticsDriver(null);
    const { element, bus } = root();
    const provider = new UiHapticProvider();
    const seen: string[] = [];
    bus.subscribe({ onIntent: (intent) => seen.push(intent.kind) });
    provider.attach(bus);
    const handler = vi.fn();
    const button = new Button('Tamam', { onClick: handler });
    element.append(button.element);
    expect(() => button.element.click()).not.toThrow();
    expect(provider.active).toBe(false);
    expect(seen).toEqual(['press']);
    // Görsel/işlevsel sonuç titreşimden bağımsızdır: eylem yine yapılır.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
  });

  it('desen başına sıklık sınırı platformda uygulanır: aynı desen aralık içinde düşer', () => {
    const { element, bus } = root();
    new UiHapticProvider().attach(bus);
    const button = new Button('Tamam');
    element.append(button.element);
    vi.spyOn(performance, 'now').mockReturnValue(5000);
    button.element.click();
    button.element.click();
    expect(play).toHaveBeenCalledTimes(1);
  });
});

describe('sıfırlama: askıya alma, odak kaybı, cihaz çıkarma, kaynak temizliği', () => {
  it('sayfa gizlenince süren titreşim kesilir', () => {
    let visibility: DocumentVisibilityState = 'visible';
    const fake = new EventTarget() as unknown as Document;
    Object.defineProperty(fake, 'visibilityState', { get: () => visibility });
    new UiHapticProvider({ visibilityTarget: fake });
    fake.dispatchEvent(new Event('visibilitychange'));
    expect(cancel).not.toHaveBeenCalled();
    visibility = 'hidden';
    fake.dispatchEvent(new Event('visibilitychange'));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('pencere odağı kaybolunca titreşim kesilir', () => {
    const target = new EventTarget() as unknown as Window;
    new UiHapticProvider({ focusTarget: target });
    target.dispatchEvent(new Event('blur'));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('cihaz yeteneği kaybolunca (sürücü sökülünce) sağlayıcı pasifleşir ve geri gelince sürer', () => {
    const { element, bus } = root();
    const provider = new UiHapticProvider();
    provider.attach(bus);
    const button = new Button('Tamam');
    element.append(button.element);
    expect(provider.active).toBe(true);
    setHapticsDriver(null);
    expect(provider.active).toBe(false);
    button.element.click();
    expect(play).not.toHaveBeenCalled();
    setHapticsDriver(driver);
    timeMs += 1000;
    button.element.click();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('dispose: süren titreşimi keser, dinleyicileri ve niyet aboneliğini söker, bir kez çalışır', () => {
    const { element, bus } = root();
    const doc = new EventTarget() as unknown as Document;
    Object.defineProperty(doc, 'visibilityState', { get: () => 'hidden' });
    const provider = new UiHapticProvider({ visibilityTarget: doc });
    provider.attach(bus);
    provider.dispose();
    provider.dispose();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(bus.ownsHaptics).toBe(false);
    expect(bus.listenerCount).toBe(0);
    // Sağlayıcı sökülünce bileşenin kendi yolu geri gelir: tek darbe.
    const button = new Button('Tamam');
    element.append(button.element);
    button.element.click();
    expect(play).toHaveBeenCalledTimes(1);
    // Sökülmüş dinleyici artık gizlenmede kesmez.
    cancel.mockClear();
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(cancel).not.toHaveBeenCalled();
    expect(provider.active).toBe(false);
  });
});
