import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelHaptics,
  isHapticsEnabled,
  isHapticsSupported,
  setHapticsEnabled,
  vibrate,
} from '../../src/platform/haptics';

function mockVibrate(impl?: () => boolean): ReturnType<typeof vi.fn> {
  const spy = vi.fn(impl ?? (() => true));
  Object.defineProperty(navigator, 'vibrate', {
    configurable: true,
    writable: true,
    value: spy,
  });
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
  setHapticsEnabled(false);
  removeVibrate();
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
