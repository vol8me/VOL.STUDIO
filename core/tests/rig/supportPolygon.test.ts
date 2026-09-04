import { describe, expect, it } from 'vitest';
import { measureSupport, type SupportFoot } from '../../src/rig/SupportPolygon';

/** Merkezde 100 px yarıçaplı bir kare üstünde duran dört ayak. */
function squareFeet(radius = 100): SupportFoot[] {
  return [
    { x: -radius, y: -radius, grounded: true },
    { x: radius, y: -radius, grounded: true },
    { x: radius, y: radius, grounded: true },
    { x: -radius, y: radius, grounded: true },
  ];
}

describe('measureSupport', () => {
  it('kare bir duruşta merkez içeridedir ve alan doğrudur', () => {
    const state = measureSupport(squareFeet(), { centerX: 0, centerY: 0 });

    expect(state.groundedCount).toBe(4);
    expect(state.areaPx2).toBeCloseTo(200 * 200, 6);
    expect(state.inside).toBe(true);
    // En yakın kenar 100 px uzakta.
    expect(state.marginPx).toBeCloseTo(100, 6);
    expect(state.stability01).toBeGreaterThan(0);
  });

  it('merkez dışarı çıktığında pay NEGATİF olur', () => {
    const state = measureSupport(squareFeet(), { centerX: 140, centerY: 0 });

    expect(state.inside).toBe(false);
    expect(state.marginPx).toBeCloseTo(-40, 6);
    expect(state.stability01).toBe(0);
  });

  it('HAVADAKİ ayak destek poligonuna girmez', () => {
    /*
     * Havadaki bir ayağı saymak, yaratığı ÜZERİNE BASMADIĞI bir alanla dengede
     * gösterirdi — tam da denge ölçümünün cevaplaması gereken sorunun tersi.
     */
    const feet = squareFeet();
    feet[1].grounded = false;
    feet[2].grounded = false;

    const state = measureSupport(feet, { centerX: 0, centerY: 0 });
    expect(state.groundedCount).toBe(2);
    // İki nokta bir alan çevirmez.
    expect(state.areaPx2).toBe(0);
    expect(state.inside).toBe(false);
    expect(state.stability01).toBe(0);
  });

  it('tek doğru üstündeki ayaklar denge vermez', () => {
    const feet: SupportFoot[] = [
      { x: -100, y: 0, grounded: true },
      { x: 0, y: 0, grounded: true },
      { x: 100, y: 0, grounded: true },
    ];
    const state = measureSupport(feet, { centerX: 0, centerY: 0 });

    expect(state.areaPx2).toBeCloseTo(0, 9);
    expect(state.inside).toBe(false);
  });

  it('İLERİ BAKIŞ dengeyi gelecek konum için ölçer', () => {
    /*
     * Anlık denge çok geç bir sinyaldir: gövde devrildiğini ancak devrildikten
     * sonra bildirir. Bir adım süresi kadar ileriye bakmak, düzeltici bir adımın
     * yetişebileceği kadar erken uyarır.
     */
    const feet = squareFeet();
    const now = measureSupport(feet, { centerX: 0, centerY: 0, velX: 900, velY: 0 });
    expect(now.inside).toBe(true);

    const soon = measureSupport(feet, {
      centerX: 0,
      centerY: 0,
      velX: 900,
      velY: 0,
      lookaheadSeconds: 0.2,
    });
    // 0,2 sn sonra merkez 180 px sağda: kareden çıkmış olacak.
    expect(soon.inside).toBe(false);
  });

  it('stability01 kenara yaklaştıkça düşer', () => {
    const feet = squareFeet();
    const middle = measureSupport(feet, { centerX: 0, centerY: 0, safeMarginPx: 100 });
    const nearEdge = measureSupport(feet, { centerX: 80, centerY: 0, safeMarginPx: 100 });

    expect(middle.stability01).toBeCloseTo(1, 6);
    expect(nearEdge.stability01).toBeCloseTo(0.2, 6);
    expect(nearEdge.stability01).toBeLessThan(middle.stability01);
  });

  it('güvenli pay verilmezse poligonun KENDİ ölçüsünden türer', () => {
    // Sabit bir piksel eşiği küçük bir yaratığı hep dengesiz gösterirdi.
    const small = measureSupport(squareFeet(20), { centerX: 0, centerY: 0 });
    const large = measureSupport(squareFeet(400), { centerX: 0, centerY: 0 });

    expect(small.stability01).toBeCloseTo(large.stability01, 6);
    expect(small.stability01).toBeGreaterThan(0);
  });

  it('bozuk ayak konumları ölçümü NaN’e düşürmez', () => {
    const feet: SupportFoot[] = [
      ...squareFeet(),
      { x: Number.NaN, y: 0, grounded: true },
      { x: 0, y: Number.POSITIVE_INFINITY, grounded: true },
    ];
    const state = measureSupport(feet, { centerX: 0, centerY: 0 });

    // Bozuk ayaklar ATILIR; kalan dört ayak hâlâ geçerli bir poligon verir.
    expect(state.groundedCount).toBe(4);
    expect(Number.isFinite(state.areaPx2)).toBe(true);
    expect(Number.isFinite(state.marginPx)).toBe(true);
    expect(state.inside).toBe(true);
  });

  it('ayak yokken sıfır durum döner', () => {
    const state = measureSupport([], { centerX: 0, centerY: 0 });
    expect(state).toEqual({
      groundedCount: 0,
      areaPx2: 0,
      inside: false,
      marginPx: 0,
      stability01: 0,
    });
  });

  it('çıktı nesnesi ÖDÜNÇ verilebilir — sıcak yolda tahsis yok', () => {
    const reused = measureSupport(squareFeet(), { centerX: 0, centerY: 0 });
    const again = measureSupport(squareFeet(50), { centerX: 0, centerY: 0 }, reused);

    expect(again).toBe(reused);
    expect(again.areaPx2).toBeCloseTo(100 * 100, 6);
  });

  it('dışbükey olmayan dağılımda ZARF kullanılır', () => {
    // İçeride kalan beşinci ayak zarfı değiştirmez.
    const feet: SupportFoot[] = [...squareFeet(), { x: 10, y: 10, grounded: true }];
    const state = measureSupport(feet, { centerX: 0, centerY: 0 });

    expect(state.groundedCount).toBe(5);
    expect(state.areaPx2).toBeCloseTo(200 * 200, 6);
  });
});
