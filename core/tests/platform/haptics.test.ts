import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelHaptics,
  isHapticsEnabled,
  planRumblePulses,
  isHapticsSupported,
  setHapticsDriver,
  setHapticsEnabled,
  vibrate,
} from '../../src/platform/haptics';

const ANDROID_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 16; SM-G990B2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Mobile Safari/537.36';

/** Titreşim motoru olan bir telefon: API tanımlı ve kullanıcı ajanı mobil. */
function mockVibrate(impl?: () => boolean): ReturnType<typeof vi.fn> {
  const spy = vi.fn(impl ?? (() => true));
  Object.defineProperty(navigator, 'vibrate', {
    configurable: true,
    writable: true,
    value: spy,
  });
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ANDROID_USER_AGENT });
  return spy;
}

function removeVibrate(): void {
  Object.defineProperty(navigator, 'vibrate', {
    configurable: true,
    writable: true,
    value: undefined,
  });
}

afterEach(() => {
  setHapticsDriver(null);
  setHapticsEnabled(false);
  removeVibrate();
  Reflect.deleteProperty(navigator, 'userAgent');
  Reflect.deleteProperty(navigator, 'userAgentData');
});

describe('dokunsal geri bildirim', () => {
  it('varsayılan KAPALIDIR — hiçbir oyun istemeden titremez', () => {
    const spy = mockVibrate();
    expect(isHapticsEnabled()).toBe(false);
    vibrate('tap');
    expect(spy).not.toHaveBeenCalled();
  });

  it('açıkken adlandırılmış deseni oynatır', () => {
    const spy = mockVibrate();
    setHapticsEnabled(true);
    vibrate('tap');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual([12]);
  });

  it('farklı niyetler farklı desen üretir', () => {
    const spy = mockVibrate();
    setHapticsEnabled(true);
    vibrate('error');
    expect((spy.mock.calls[0][0] as number[]).length).toBeGreaterThan(1);
  });

  it('desen dizisi çağrı başına kopyalanır — çağıran tabloyu bozamaz', () => {
    const spy = mockVibrate();
    setHapticsEnabled(true);
    vibrate('tap');
    (spy.mock.calls[0][0] as number[])[0] = 9999;

    // Kısıt penceresini temizlemek için anahtarı kapatıp açmak yeterli;
    // testin konusu kopyalama, kısıt değil.
    setHapticsEnabled(false);
    setHapticsEnabled(true);
    vibrate('tap');
    // Araya kapatmanın ürettiği `vibrate(0)` iptali girer; ilgilendiğimiz
    // SON çağrıdır.
    expect(spy.mock.calls.at(-1)?.[0]).toEqual([12]);
  });

  it('salkım hâlindeki olaylar kısıtlanır — sürekli uğultu olmaz', () => {
    // Saniyede on mermi ateşlendiğinde her birine titremek eli uyuşturur.
    const spy = mockVibrate();
    setHapticsEnabled(true);
    for (let i = 0; i < 20; i++) vibrate('tap');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('kısıt DESEN BAŞINA uygulanır — hasar, ateş salkımına yutulmaz', () => {
    const spy = mockVibrate();
    setHapticsEnabled(true);
    vibrate('tap');
    vibrate('warning');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('kapatmak süren titreşimi de iptal eder', () => {
    const spy = mockVibrate();
    setHapticsEnabled(true);
    setHapticsEnabled(false);
    expect(spy).toHaveBeenCalledWith(0);
  });

  it('desteklenmeyen platformda sessizce geçer — çağıran koşul yazmaz', () => {
    removeVibrate();
    setHapticsEnabled(true);
    expect(isHapticsSupported()).toBe(false);
    expect(() => vibrate('tap')).not.toThrow();
    expect(() => cancelHaptics()).not.toThrow();
  });

  it('masaüstü tarayıcı API’yi tanımlasa da motor yoktur — titremez, ayar sunulmaz', () => {
    // Masaüstü Chromium ve WebView2 `navigator.vibrate`i tanımlar ama çağrı boşa
    // gider; yetenek denetimi olmayan arayüzde işlevsiz bir ayar gösterilirdi.
    const spy = mockVibrate();
    Reflect.deleteProperty(navigator, 'userAgent');
    setHapticsEnabled(true);

    expect(isHapticsSupported()).toBe(false);
    vibrate('tap');
    expect(spy).not.toHaveBeenCalled();
  });

  it('UA-CH mobil ipucu kullanıcı ajanından önce okunur', () => {
    mockVibrate();
    Reflect.deleteProperty(navigator, 'userAgent');
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      value: { mobile: true },
    });

    expect(isHapticsSupported()).toBe(true);
  });

  it('platform çağrıyı reddederse hata yüzeye çıkmaz', () => {
    // Bazı tarayıcılar kullanıcı etkileşimi olmadan vibrate()'i reddeder;
    // titreşimin başarısızlığı oyun akışını kesmemeli.
    mockVibrate(() => {
      throw new Error('kullanıcı etkileşimi gerekli');
    });
    setHapticsEnabled(true);
    expect(() => vibrate('tap')).not.toThrow();
  });
});

describe('planRumblePulses', () => {
  it('tek darbeli desen tek darbe verir', () => {
    const pulses = planRumblePulses('tap');
    expect(pulses).toHaveLength(1);
    expect(pulses[0].durationMs).toBe(12);
    expect(pulses[0].gapAfterMs).toBe(0);
    expect(pulses[0].weak).toBe(0.25);
    expect(pulses[0].strong).toBe(0);
  });

  it('çift darbeli desen aralığı korur', () => {
    const pulses = planRumblePulses('error');
    expect(pulses).toHaveLength(2);
    expect(pulses[0].gapAfterMs).toBe(50);
    expect(pulses[1].durationMs).toBe(40);
    expect(pulses[0].strong).toBe(0.85);
  });
});

describe('titreşim şiddeti', () => {
  it('Vibration API genlik taşımaz: şiddet titreşim sürelerini ölçekler, aralıkları korur', () => {
    const spy = mockVibrate();
    setHapticsEnabled(true);
    vibrate('error', 0.5);
    expect(spy.mock.calls[0][0]).toEqual([20, 50, 20]);
  });

  it('çok düşük şiddet de hissedilir bir alt süre taşır; sıfır ve altı titremez', () => {
    const spy = mockVibrate();
    setHapticsEnabled(true);
    vibrate('tap', 0.01);
    expect(spy.mock.calls[0][0]).toEqual([4]);
    vibrate('select', 0);
    vibrate('select', -1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('sonlu olmayan şiddet tam şiddettir, 1 üstü kelepçelenir', () => {
    expect(planRumblePulses('warning', Number.NaN)[0]).toMatchObject({ strong: 0.5, weak: 0.4 });
    expect(planRumblePulses('warning', 3)[0]).toMatchObject({ strong: 0.5, weak: 0.4 });
    expect(planRumblePulses('warning', 0.5)[0]).toMatchObject({ strong: 0.25, weak: 0.2 });
  });

  it('native sürücüye şiddet iletilir', () => {
    const play = vi.fn();
    setHapticsDriver({ play });
    setHapticsEnabled(true);
    vibrate('warning', 0.3);
    expect(play).toHaveBeenCalledWith('warning', 0.3);
  });
});
