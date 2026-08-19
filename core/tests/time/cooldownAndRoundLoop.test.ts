import { describe, it, expect, vi } from 'vitest';
import { Cooldown } from '../../src/time/Cooldown';
import { RoundLoop } from '../../src/time/RoundLoop';

describe('Cooldown', () => {
  it('başlangıçta hazırdır', () => {
    expect(new Cooldown(100).isReady()).toBe(true);
  });

  it('tryTrigger hazırken true, beklerken false döner', () => {
    const cd = new Cooldown(100);
    expect(cd.tryTrigger()).toBe(true);
    expect(cd.tryTrigger()).toBe(false);

    cd.update(100);
    expect(cd.tryTrigger()).toBe(true);
  });

  it('getProgress bekleme boyunca 0→1 ilerler', () => {
    const cd = new Cooldown(100);
    cd.trigger();
    expect(cd.getProgress()).toBeCloseTo(0, 5);

    cd.update(50);
    expect(cd.getProgress()).toBeCloseTo(0.5, 5);

    cd.update(50);
    expect(cd.getProgress()).toBe(1);
  });

  it('süre 0 ise her zaman hazırdır ve progress 1 döner', () => {
    const cd = new Cooldown(0);
    cd.trigger();
    expect(cd.isReady()).toBe(true);
    expect(cd.getProgress()).toBe(1);
  });

  it('negatif süre 0a kelepçelenir', () => {
    expect(new Cooldown(-50).getDuration()).toBe(0);
  });

  it('setDuration devam eden beklemeyi KISALTIR', () => {
    // Ateş hızı artıran bir kart alan oyuncu, eski uzun beklemeyi sonuna
    // kadar çekmemeli.
    const cd = new Cooldown(1000);
    cd.trigger();
    cd.update(100);
    expect(cd.getRemaining()).toBe(900);

    cd.setDuration(200);
    expect(cd.getRemaining()).toBe(200);
  });

  it('reset beklemeyi anında bitirir', () => {
    const cd = new Cooldown(100);
    cd.trigger();
    cd.reset();
    expect(cd.isReady()).toBe(true);
  });

  it('hazırken update çağırmak kalanı negatife sürüklemez', () => {
    const cd = new Cooldown(100);
    cd.update(5000);
    expect(cd.getRemaining()).toBe(0);
  });
});

describe('RoundLoop', () => {
  it('start() İLK turu hemen bildirir (mola beklemeden)', () => {
    // Molanın önce gelmesi oyuncuyu ilk saniyede boş ekranla karşılardı.
    const onRoundStart = vi.fn();
    const loop = new RoundLoop({ breakMs: 1000, onRoundStart });

    loop.start();
    expect(onRoundStart).toHaveBeenCalledWith(1);
  });

  it('mola dolunca sıradaki tura geçer', () => {
    const onRoundStart = vi.fn();
    const loop = new RoundLoop({ breakMs: 1000, onRoundStart });
    loop.start();

    loop.update(1000);
    expect(onRoundStart).toHaveBeenLastCalledWith(2);
    expect(loop.getRound()).toBe(2);
  });

  it('totalRounds bitince durur ve onComplete BİR KEZ tetiklenir', () => {
    const onComplete = vi.fn();
    const loop = new RoundLoop({ breakMs: 100, totalRounds: 2, onComplete });
    loop.start();

    loop.update(100); // tur 2
    expect(loop.isComplete()).toBe(false);

    loop.update(100); // tur 3 olurdu -> tamamlandı
    expect(loop.isComplete()).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);

    loop.update(1000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('totalRounds verilmezse sonsuz sürer', () => {
    const loop = new RoundLoop({ breakMs: 10 });
    loop.start();
    for (let i = 0; i < 100; i++) loop.update(10);

    expect(loop.isComplete()).toBe(false);
    expect(loop.getRound()).toBe(101);
  });

  it('pause() molayı dondurur, resume() sürdürür', () => {
    const onRoundStart = vi.fn();
    const loop = new RoundLoop({ breakMs: 100, onRoundStart });
    loop.start();

    loop.pause();
    loop.update(1000);
    expect(loop.getRound()).toBe(1);

    loop.resume();
    loop.update(100);
    expect(loop.getRound()).toBe(2);
  });

  it('skipBreak() molayı beklemeden ilerletir ("hazırım" butonu)', () => {
    const loop = new RoundLoop({ breakMs: 10_000 });
    loop.start();

    loop.skipBreak();
    expect(loop.getRound()).toBe(2);
  });

  it('başlamamış döngüde skipBreak/update etkisizdir', () => {
    const onRoundStart = vi.fn();
    const loop = new RoundLoop({ breakMs: 100, onRoundStart });

    loop.update(1000);
    loop.skipBreak();
    expect(onRoundStart).not.toHaveBeenCalled();
    expect(loop.getRound()).toBe(1);
  });

  it('iki kez start() ikinci turu tetiklemez', () => {
    const onRoundStart = vi.fn();
    const loop = new RoundLoop({ breakMs: 100, onRoundStart });
    loop.start();
    loop.start();

    expect(onRoundStart).toHaveBeenCalledTimes(1);
  });

  it('startRound ile ortadan başlanabilir (kayıt yükleme)', () => {
    const onRoundStart = vi.fn();
    const loop = new RoundLoop({ breakMs: 100, startRound: 7, onRoundStart });
    loop.start();

    expect(onRoundStart).toHaveBeenCalledWith(7);
  });

  it('mola ilerlemesi ve kalan süre HUD için okunabilir', () => {
    const loop = new RoundLoop({ breakMs: 1000 });
    loop.start();
    loop.update(250);

    expect(loop.getRemainingMs()).toBe(750);
    expect(loop.getBreakProgress()).toBeCloseTo(0.25, 5);
  });
});
