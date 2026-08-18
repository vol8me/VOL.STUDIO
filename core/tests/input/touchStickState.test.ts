import { describe, it, expect } from 'vitest';
import { TouchStickState } from '../../src/input/TouchStickState';

/**
 * Testin KENDİ eylem sözlüğü — VOL.HELL'in `fire`/`dash` kümesinden bilinçli
 * olarak farklı. `TouchStickState` hiçbir eylem adı bilmez; sağ stick'in hangi
 * eyleme bağlandığı `aimStickAction` ile dışarıdan verilir.
 */
type TestAction = 'engage' | 'boost';

const TEST_ACTIONS: readonly TestAction[] = ['engage', 'boost'];

/** Sağ stick `engage` eylemine bağlı — üretim kodundaki "nişan + ateş" deseni. */
function makeSticks(deadZone?: number, maxRadius?: number): TouchStickState<TestAction> {
  return new TouchStickState<TestAction>({
    actions: TEST_ACTIONS,
    aimStickAction: 'engage',
    deadZone,
    maxRadius,
  });
}

/** Sağ stick hiçbir eyleme bağlı DEĞİL — yalnızca nişan üretir. */
function makeAimOnlySticks(): TouchStickState<TestAction> {
  return new TouchStickState<TestAction>({ actions: TEST_ACTIONS });
}

describe('TouchStickState', () => {
  describe('stick atama', () => {
    it("sol yarıya ilk dokunuş sol stick'e atanır", () => {
      const sticks = makeSticks();
      sticks.onPointerDown(1, 100, 100, false);

      expect(sticks.getLeftStick()?.pointerId).toBe(1);
      expect(sticks.getRightStick()).toBeUndefined();
    });

    it("sağ yarıya ilk dokunuş sağ stick'e atanır", () => {
      const sticks = makeSticks();
      sticks.onPointerDown(1, 900, 100, true);

      expect(sticks.getRightStick()?.pointerId).toBe(1);
      expect(sticks.getLeftStick()).toBeUndefined();
    });

    it("sol stick doluyken sol yarıya ikinci dokunuş yok sayılır (sağ stick'i çalmaz)", () => {
      // Regresyon: önceki hatalı mantık, sol stick doluyken sol yarıya
      // gelen ikinci parmağı yanlışlıkla SAĞ stick'e atıyordu.
      const sticks = makeSticks();
      sticks.onPointerDown(1, 100, 100, false);
      sticks.onPointerDown(2, 150, 150, false);

      expect(sticks.getLeftStick()?.pointerId).toBe(1);
      expect(sticks.getRightStick()).toBeUndefined();
    });

    it("sağ stick doluyken sağ yarıya ikinci dokunuş yok sayılır (sol stick'i çalmaz)", () => {
      const sticks = makeSticks();
      sticks.onPointerDown(1, 900, 100, true);
      sticks.onPointerDown(2, 950, 150, true);

      expect(sticks.getRightStick()?.pointerId).toBe(1);
      expect(sticks.getLeftStick()).toBeUndefined();
    });

    it("iki farklı yarıya iki dokunuş her iki stick'i de doldurur", () => {
      const sticks = makeSticks();
      sticks.onPointerDown(1, 100, 100, false);
      sticks.onPointerDown(2, 900, 100, true);

      expect(sticks.getLeftStick()?.pointerId).toBe(1);
      expect(sticks.getRightStick()?.pointerId).toBe(2);
    });

    it('isActive her iki stick de boşken false, biri doluyken true döner', () => {
      const sticks = makeSticks();
      expect(sticks.isActive).toBe(false);

      sticks.onPointerDown(1, 100, 100, false);
      expect(sticks.isActive).toBe(true);
    });
  });

  describe('onPointerUp', () => {
    it('doğru pointerId ile stick serbest bırakılır', () => {
      const sticks = makeSticks();
      sticks.onPointerDown(1, 100, 100, false);
      sticks.onPointerUp(1);

      expect(sticks.getLeftStick()).toBeUndefined();
      expect(sticks.isActive).toBe(false);
    });

    it("yanlış pointerId stick'i etkilemez", () => {
      const sticks = makeSticks();
      sticks.onPointerDown(1, 100, 100, false);
      sticks.onPointerUp(99);

      expect(sticks.getLeftStick()).toBeDefined();
    });

    it('serbest kalan stick yeni bir dokunuşla yeniden doldurulabilir', () => {
      const sticks = makeSticks();
      sticks.onPointerDown(1, 100, 100, false);
      sticks.onPointerUp(1);
      sticks.onPointerDown(2, 120, 120, false);

      expect(sticks.getLeftStick()?.pointerId).toBe(2);
    });
  });

  describe('clamp ve deadzone (getState)', () => {
    it('base ile aynı noktada hareket sıfırdır', () => {
      const sticks = makeSticks();
      sticks.onPointerDown(1, 100, 100, false);
      sticks.onPointerMove(1, 100, 100);

      const state = sticks.getState();
      expect(state.move.x).toBe(0);
      expect(state.move.y).toBe(0);
    });

    it('deadzone altındaki küçük hareket sıfıra yuvarlanır', () => {
      const sticks = makeSticks(0.15, 64);
      sticks.onPointerDown(1, 100, 100, false);
      // 64 * 0.15 = 9.6 yarıçapından küçük hareket -> deadzone içinde.
      sticks.onPointerMove(1, 105, 100);

      const state = sticks.getState();
      expect(state.move.length()).toBe(0);
    });

    it("maxRadius dışına taşan hareket clamp edilir (uzunluk 1'i geçmez)", () => {
      const sticks = makeSticks(0.15, 64);
      sticks.onPointerDown(1, 100, 100, false);
      // maxRadius'un çok ötesine hareket.
      sticks.onPointerMove(1, 100 + 1000, 100);

      const state = sticks.getState();
      expect(state.move.length()).toBeCloseTo(1, 5);
    });

    it('sağ stick deadzone dışında hareket ederse bağlı eylem true olur', () => {
      const sticks = makeSticks(0.15, 64);
      sticks.onPointerDown(1, 900, 100, true);
      sticks.onPointerMove(1, 900 + 40, 100);

      const state = sticks.getState();
      expect(state.actions.engage).toBe(true);
      expect(state.aim.length()).toBeCloseTo(1, 5);
    });

    it('aimStickAction verilmezse sağ stick HİÇBİR eylemi tetiklemez, yalnızca aim üretir', () => {
      // Yeni davranış: "nişan al + otomatik ateş" her oyunun tercihi değildir.
      // Eylem bağlanmadığında stick nişan vermeye devam eder ama kayıt boş kalır.
      const sticks = makeAimOnlySticks();
      sticks.onPointerDown(1, 900, 100, true);
      sticks.onPointerMove(1, 900 + 40, 100);

      const state = sticks.getState();
      expect(state.aim.length()).toBeCloseTo(1, 5);
      expect(state.actions.engage).toBe(false);
      expect(state.actions.boost).toBe(false);
    });

    it('actions kaydı sözlüğün TAMAMINI taşır — eksik anahtar bırakılmaz', () => {
      // Çağıran `state.actions.boost` okuduğunda undefined görmemeli.
      const state = makeSticks().getState();
      expect(Object.keys(state.actions).sort()).toEqual(['boost', 'engage']);
    });

    it('sağ stick yokken bağlı eylem false, aim sıfırdır', () => {
      const sticks = makeSticks();
      const state = sticks.getState();

      expect(state.actions.engage).toBe(false);
      expect(state.aim.x).toBe(0);
      expect(state.aim.y).toBe(0);
    });

    it("onPointerMove yanlış pointerId ile stick'i etkilemez", () => {
      const sticks = makeSticks();
      sticks.onPointerDown(1, 100, 100, false);
      sticks.onPointerMove(99, 500, 500);

      const state = sticks.getState();
      expect(state.move.length()).toBe(0);
    });
  });

  describe('getClampedPosition', () => {
    it('clamp edilmemiş konum için base + ham vektörü döner', () => {
      const sticks = makeSticks(0.15, 64);
      sticks.onPointerDown(1, 100, 100, false);
      sticks.onPointerMove(1, 120, 100);

      const stick = sticks.getLeftStick()!;
      const pos = sticks.getClampedPosition(stick);
      expect(pos.x).toBe(120);
      expect(pos.y).toBe(100);
    });

    it('maxRadius dışına taşan konum stick tabanına göre clamp edilir', () => {
      const sticks = makeSticks(0.15, 64);
      sticks.onPointerDown(1, 100, 100, false);
      sticks.onPointerMove(1, 100 + 1000, 100);

      const stick = sticks.getLeftStick()!;
      const pos = sticks.getClampedPosition(stick);
      expect(pos.x).toBeCloseTo(164, 5);
      expect(pos.y).toBeCloseTo(100, 5);
    });
  });
});
