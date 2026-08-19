import { describe, it, expect } from 'vitest';
import { Clock } from '../../src/time/Clock';

describe('Clock', () => {
  it('varsayılan olarak çalışır ve delta biriktirir', () => {
    const clock = new Clock();
    clock.update(100);
    clock.update(50);
    expect(clock.getElapsed()).toBe(150);
    expect(clock.getElapsedSeconds()).toBeCloseTo(0.15, 10);
  });

  it('autoStart:false ile duraklatılmış başlar', () => {
    const clock = new Clock({ autoStart: false });
    clock.update(100);
    expect(clock.getElapsed()).toBe(0);
    expect(clock.isRunning()).toBe(false);
  });

  it('pause/start süreyi durdurur ve sürdürür', () => {
    const clock = new Clock();
    clock.update(100);
    clock.pause();
    clock.update(500);
    expect(clock.getElapsed()).toBe(100);

    clock.start();
    clock.update(50);
    expect(clock.getElapsed()).toBe(150);
  });

  it('ölçek süreyi hızlandırır/yavaşlatır', () => {
    const clock = new Clock();
    clock.setScale(0.5);
    clock.update(100);
    expect(clock.getElapsed()).toBe(50);

    clock.setScale(2);
    clock.update(100);
    expect(clock.getElapsed()).toBe(250);
  });

  it('ölçek 0 zamanı dondurur', () => {
    const clock = new Clock();
    clock.setScale(0);
    clock.update(1000);
    expect(clock.getElapsed()).toBe(0);
  });

  it('negatif/NaN ölçek 0a kelepçelenir — geriye akan zaman yok', () => {
    // Geriye akan zaman, süreye dayanan her hesabı (cooldown, ilerleme oranı)
    // tanımsız hâle getirirdi.
    const clock = new Clock();
    clock.setScale(-2);
    expect(clock.getScale()).toBe(0);

    clock.setScale(NaN);
    expect(clock.getScale()).toBe(0);
  });

  it('reset süreyi sıfırlar ama çalışma durumunu ve ölçeği korur', () => {
    const clock = new Clock();
    clock.setScale(2);
    clock.update(100);
    clock.reset();

    expect(clock.getElapsed()).toBe(0);
    expect(clock.isRunning()).toBe(true);
    expect(clock.getScale()).toBe(2);
  });

  it('sıfır/negatif delta süreyi geri almaz', () => {
    const clock = new Clock();
    clock.update(100);
    clock.update(0);
    clock.update(-500);
    expect(clock.getElapsed()).toBe(100);
  });
});
