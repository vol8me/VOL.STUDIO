import { describe, it, expect } from 'vitest';
import { InputModeArbiter, inputModeForSession } from '../../src/input/inputMode';

/**
 * Sahte monoton saat — `performance.now` yerine test kontrollü ilerler.
 */
function makeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance(ms: number) {
      t += ms;
    },
  };
}

describe('InputModeArbiter', () => {
  it('hiç girdi yokken kip `initial`dir (Deck ilk kare kol kipi)', () => {
    const arbiter = new InputModeArbiter({ initial: 'gamepad' });
    expect(arbiter.mode).toBe('gamepad');
  });

  it('tek sağlayıcı etkinleşince kip ona geçer', () => {
    const clock = makeClock();
    const arbiter = new InputModeArbiter({ now: clock.now });
    arbiter.observe([{ id: 'pc', active: false }]);
    expect(arbiter.mode).toBeUndefined();

    clock.advance(16);
    arbiter.observe([{ id: 'pc', active: true }]);
    expect(arbiter.mode).toBe('pc');
  });

  it('son anlamlı girdi kazanır: görevli basılı tutulurken bile yeni kenar devralır', () => {
    const clock = makeClock();
    const arbiter = new InputModeArbiter({ now: clock.now });
    arbiter.observe([{ id: 'pc', active: true }]);
    expect(arbiter.mode).toBe('pc');

    // W basılı tutulurken kola dokunuldu — pad kenarı daha taze, kip geçer.
    clock.advance(500);
    arbiter.observe([
      { id: 'pc', active: true },
      { id: 'gamepad', active: true },
    ]);
    expect(arbiter.mode).toBe('gamepad');
  });

  it('sürekli etkinlik kenar üretmez: bırakılmayan rakip kipi geri alamaz', () => {
    const clock = makeClock();
    const arbiter = new InputModeArbiter({ now: clock.now });
    arbiter.observe([
      { id: 'pc', active: true },
      { id: 'gamepad', active: true },
    ]);
    // Eş kenar — liste sırası kazanır.
    expect(arbiter.mode).toBe('pc');

    // gamepad basılı kalmaya devam eder ama yeni kenar üretmez; pc'nin yeni
    // kenarı da yok → kip değişmez (sürekli gürültü kip çalmaz).
    clock.advance(1000);
    arbiter.observe([
      { id: 'pc', active: true },
      { id: 'gamepad', active: true },
    ]);
    expect(arbiter.mode).toBe('pc');
  });

  it('görevli boşta kalınca rakibin süregelen kenarı devralır', () => {
    const clock = makeClock();
    const arbiter = new InputModeArbiter({ now: clock.now });
    arbiter.observe([
      { id: 'touch', active: true },
      { id: 'pc', active: false },
    ]);
    clock.advance(16);
    arbiter.observe([
      { id: 'touch', active: false },
      { id: 'pc', active: true },
    ]);
    expect(arbiter.mode).toBe('pc');
  });

  it('eş kenar zamanlarında liste sırası kazanır (dokunmatik-önce kuralı)', () => {
    const clock = makeClock();
    const arbiter = new InputModeArbiter({ now: clock.now });
    // Aynı fiziksel hareketin iki kanala sızması: iki sağlayıcı aynı karede
    // ilk kez etkin — tarihsel "touch önce" kuralı çağıranın liste sırasıdır.
    arbiter.observe([
      { id: 'touch', active: true },
      { id: 'pc', active: true },
    ]);
    expect(arbiter.mode).toBe('touch');
  });

  it('hiçbir sağlayıcı etkin değilken kip son kazananda yapışık kalır', () => {
    const clock = makeClock();
    const arbiter = new InputModeArbiter({ now: clock.now });
    arbiter.observe([{ id: 'pc', active: true }]);
    clock.advance(16);
    arbiter.observe([{ id: 'pc', active: false }]);
    expect(arbiter.mode).toBe('pc');
  });

  it('priorityOrder kip sahibini başa alır, geri kalanları korur', () => {
    const clock = makeClock();
    const arbiter = new InputModeArbiter({ now: clock.now });
    arbiter.observe([{ id: 'pc', active: true }]);
    expect(arbiter.priorityOrder(['touch', 'pc', 'gamepad'])).toEqual(['pc', 'touch', 'gamepad']);
    // Kip sahibi listede yoksa sıralama dokunulmaz kalır.
    expect(arbiter.priorityOrder(['touch', 'gamepad'])).toEqual(['touch', 'gamepad']);
  });
});

describe('inputModeForSession', () => {
  it('gamescope oturumu ilk kareden kol kipi verir', () => {
    expect(inputModeForSession('gamescope')).toBe('gamepad');
    expect(inputModeForSession('bigpicture')).toBe('gamepad');
  });

  it('bilinmeyen ve masaüstü oturumları hakeme bırakır', () => {
    expect(inputModeForSession('desktop')).toBeUndefined();
    expect(inputModeForSession('web')).toBeUndefined();
    expect(inputModeForSession('bilinmeyen')).toBeUndefined();
  });
});
