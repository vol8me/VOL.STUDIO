import { describe, expect, it } from 'vitest';
import { GazeDriver } from '../../src/rig/GazeDriver';
import { createRandom } from '../../src/random/random';

const CONFIG = {
  radiusPx: 8,
  holdMsMin: 300,
  holdMsMax: 900,
  saccadeMs: 80,
};

const DT = 16;

describe('GazeDriver', () => {
  it('geçersiz yapılandırmayı reddeder', () => {
    expect(() => new GazeDriver({ ...CONFIG, saccadeMs: 0 })).toThrow(/saccadeMs/);
    expect(() => new GazeDriver({ ...CONFIG, radiusPx: -1 })).toThrow(/radiusPx/);
    expect(() => new GazeDriver({ ...CONFIG, holdMsMax: 10 })).toThrow(/holdMsMax/);
  });

  it('bakış hiçbir karede yarıçapın dışına çıkmaz', () => {
    const gaze = new GazeDriver(CONFIG, createRandom(7));

    for (let i = 0; i < 2000; i++) {
      const signals = gaze.update(DT, null, 0);
      expect(Math.hypot(signals.x, signals.y)).toBeLessThanOrEqual(CONFIG.radiusPx + 1e-9);
    }
  });

  it('bekleme boyunca DURUR, sonra kısa bir sıçramayla yer değiştirir', () => {
    const gaze = new GazeDriver(CONFIG, createRandom(11));

    // İlk bekleme en az `holdMsMin` sürer: bu sürede bakış merkezdedir.
    let elapsed = 0;
    while (elapsed < CONFIG.holdMsMin - DT) {
      const signals = gaze.update(DT, null, 0);
      expect(signals.x).toBe(0);
      expect(signals.y).toBe(0);
      elapsed += DT;
    }

    // Sıçrama `saccadeMs` içinde biter; bakış artık merkezde değildir.
    let settled = 0;
    for (let i = 0; i < 200; i++) {
      const signals = gaze.update(DT, null, 0);
      if (Math.hypot(signals.x, signals.y) > 1e-6) {
        settled = i;
        break;
      }
    }
    expect(settled).toBeGreaterThan(0);
  });

  it('odak yönü verildiğinde bakış o yaya toplanır', () => {
    const focusRad = 0;
    const focused = new GazeDriver(CONFIG, createRandom(3));
    const free = new GazeDriver(CONFIG, createRandom(3));

    let focusedForward = 0;
    let freeForward = 0;
    for (let i = 0; i < 4000; i++) {
      const a = focused.update(DT, focusRad, 1);
      const b = free.update(DT, null, 1);
      if (Math.hypot(a.x, a.y) > 1e-6 && Math.abs(a.angleRad - focusRad) < Math.PI / 3) {
        focusedForward++;
      }
      if (Math.hypot(b.x, b.y) > 1e-6 && Math.abs(b.angleRad - focusRad) < Math.PI / 3) {
        freeForward++;
      }
    }

    expect(focusedForward).toBeGreaterThan(freeForward * 1.5);
  });

  it('uyanıklık arttıkça sıçramalar sıklaşır', () => {
    const countSaccades = (alert: number): number => {
      const gaze = new GazeDriver(CONFIG, createRandom(23));
      let previous = { x: 0, y: 0 };
      let moves = 0;
      for (let i = 0; i < 3000; i++) {
        const signals = gaze.update(DT, null, alert);
        if (signals.settle01 < 1 && Math.hypot(signals.x - previous.x, signals.y - previous.y) > 0)
          moves++;
        previous = { x: signals.x, y: signals.y };
      }
      return moves;
    };

    expect(countSaccades(1)).toBeGreaterThan(countSaccades(0));
  });

  it('aynı tohum aynı bakış dizisini verir', () => {
    const run = (): number[] => {
      const gaze = new GazeDriver(CONFIG, createRandom(99));
      const samples: number[] = [];
      for (let i = 0; i < 300; i++) samples.push(gaze.update(DT, null, 0).x);
      return samples;
    };

    expect(run()).toEqual(run());
  });

  it('reset bakışı merkeze alır, pozitif olmayan delta durumu değiştirmez', () => {
    const gaze = new GazeDriver(CONFIG, createRandom(5));
    for (let i = 0; i < 500; i++) gaze.update(DT, null, 1);

    gaze.reset();
    const afterReset = gaze.update(0, null, 0);
    expect(afterReset.x).toBe(0);
    expect(afterReset.y).toBe(0);
    expect(afterReset.settle01).toBe(1);
  });

  it('kare süresinden BAĞIMSIZ ilerler: artan süre bir sonraki faza taşınır', () => {
    /*
     * Bir faz kare ortasında bittiğinde artan süre atılıyordu: 150 ms'lik tek
     * bir karede bekleme bitiyor, sıçrama başlıyor ama sıçramaya hiç zaman
     * işlenmiyordu. Aynı süre on küçük kareye bölündüğünde sıçrama neredeyse
     * bitiyordu — yani bakış kare hızına bağımlıydı ve uzun bir donmadan sonra
     * görünür biçimde geriden geliyordu.
     */
    const coarse = new GazeDriver(CONFIG, createRandom(99));
    const fine = new GazeDriver(CONFIG, createRandom(99));

    const totalMs = 900;
    coarse.update(totalMs);
    for (let elapsed = 0; elapsed < totalMs; elapsed += 15) fine.update(15);

    const a = coarse.update(0);
    const b = fine.update(0);
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
  });

  it('dev bir delta kare döngüsünü kilitlemez', () => {
    const gaze = new GazeDriver(CONFIG, createRandom(7));
    const signals = gaze.update(1e9);

    expect(Number.isFinite(signals.x)).toBe(true);
    expect(Math.hypot(signals.x, signals.y)).toBeLessThanOrEqual(CONFIG.radiusPx + 1e-9);
  });
});
