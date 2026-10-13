import { describe, expect, it } from 'vitest';
import { TapDetector } from '../../src/app/tap';

const OPTIONS = { slopPx: 10, maxMs: 350, longPressMs: 1200 } as const;

describe('TapDetector', () => {
  it('kısa ve kımıldamayan basışı dokunma sayar', () => {
    const taps = new TapDetector(OPTIONS);
    taps.down(1, 100, 100, 0, 0, false);
    expect(taps.up(1, 102, 101, 120)).toEqual({ x: 102, y: 101, secondary: false });
  });

  it('eşikten fazla kayan basış kaydırmadır', () => {
    const taps = new TapDetector(OPTIONS);
    taps.down(1, 100, 100, 0, 0, false);
    taps.move(1, 140, 100);
    expect(taps.up(1, 100, 100, 100)).toBeNull();
  });

  it('bırakış noktası eşiğin dışındaysa hareket olayı gelmese de dokunma değildir', () => {
    const taps = new TapDetector(OPTIONS);
    taps.down(1, 100, 100, 0, 0, false);
    expect(taps.up(1, 130, 100, 100)).toBeNull();
  });

  it('fare ile uzun basış dokunma sayılmaz', () => {
    const taps = new TapDetector(OPTIONS);
    taps.down(1, 10, 10, 0, 0, false);
    expect(taps.up(1, 10, 10, 800)).toBeNull();
  });

  it('sağ fare tuşu ikincil dokunuştur', () => {
    const taps = new TapDetector(OPTIONS);
    taps.down(1, 10, 10, 0, 2, false);
    expect(taps.up(1, 10, 10, 50)).toEqual({ x: 10, y: 10, secondary: true });
  });

  it('orta fare tuşu dokunma değildir', () => {
    const taps = new TapDetector(OPTIONS);
    taps.down(1, 10, 10, 0, 1, false);
    expect(taps.up(1, 10, 10, 50)).toBeNull();
  });

  it('dokunmatikte kımıldamayan uzun basış ikincil dokunuştur; çok uzunu değil', () => {
    const taps = new TapDetector(OPTIONS);
    taps.down(1, 10, 10, 0, 0, true);
    expect(taps.up(1, 10, 10, 800)).toEqual({ x: 10, y: 10, secondary: true });
    taps.down(2, 10, 10, 0, 0, true);
    expect(taps.up(2, 10, 10, 5000)).toBeNull();
  });

  it('ikinci parmak inince iki parmağın bırakılışı da dokunma olmaz', () => {
    const taps = new TapDetector(OPTIONS);
    taps.down(1, 10, 10, 0, 0, true);
    taps.down(2, 50, 50, 20, 0, true);
    expect(taps.up(2, 50, 50, 60)).toBeNull();
    expect(taps.up(1, 10, 10, 80)).toBeNull();
    // Her ikisi de kalkınca durum temizlenir: sonraki tek parmak dokunması çalışır.
    taps.down(3, 5, 5, 200, 0, true);
    expect(taps.up(3, 5, 5, 250)).toEqual({ x: 5, y: 5, secondary: false });
  });

  it('bilinmeyen işaretçi ve iptal edilen basış sonuç vermez', () => {
    const taps = new TapDetector(OPTIONS);
    expect(taps.up(9, 0, 0, 10)).toBeNull();
    taps.down(1, 0, 0, 0, 0, false);
    expect(taps.active).toBe(1);
    taps.cancel(1);
    expect(taps.active).toBe(0);
    expect(taps.up(1, 0, 0, 10)).toBeNull();
  });

  it('saat geri giderse dokunma sayılmaz', () => {
    const taps = new TapDetector(OPTIONS);
    taps.down(1, 0, 0, 100, 0, false);
    expect(taps.up(1, 0, 0, 50)).toBeNull();
  });
});
