import { describe, expect, it } from 'vitest';
import { VirtualActionSource } from '../../src/input/VirtualActionSource';
import { TouchStickState } from '../../src/input/TouchStickState';

type TestAction = 'fire' | 'dash';
const ACTIONS: readonly TestAction[] = ['fire', 'dash'];

function emptyActions(): Record<TestAction, boolean> {
  return { fire: false, dash: false };
}

describe('VirtualActionSource', () => {
  it('basılı düğme her karede bildirilir — basılı tutmak tuşu tutmakla aynıdır', () => {
    const source = new VirtualActionSource<TestAction>();
    source.press('dash');

    for (let frame = 0; frame < 3; frame++) {
      const actions = emptyActions();
      source.applyTo(actions);
      expect(actions.dash, `kare ${frame}`).toBe(true);
    }
  });

  it('okunduktan sonra bırakılan düğme anında düşer', () => {
    const source = new VirtualActionSource<TestAction>();
    source.press('dash');

    const first = emptyActions();
    source.applyTo(first);
    expect(first.dash).toBe(true);

    source.release('dash');
    const second = emptyActions();
    source.applyTo(second);
    expect(second.dash).toBe(false);
  });

  it('iki kare arasına sıkışan dokunuş DÜŞMEZ — mandal bir kare yaşatır', () => {
    // pointerdown ve pointerup aynı kare aralığında gelirse, mandal olmadan
    // oyuncu düğmeye bastığı hâlde hiçbir şey olmazdı.
    const source = new VirtualActionSource<TestAction>();
    source.press('dash');
    source.release('dash');

    const frame = emptyActions();
    source.applyTo(frame);
    expect(frame.dash).toBe(true);
  });

  it('mandal yalnızca BİR kare yaşar — dash iki kez tetiklenmez', () => {
    const source = new VirtualActionSource<TestAction>();
    source.press('dash');
    source.release('dash');

    source.applyTo(emptyActions());
    const next = emptyActions();
    source.applyTo(next);
    expect(next.dash).toBe(false);
  });

  it('hasPressed mandalı da kapsar — sağlayıcı tek karelik dokunuşta aktif kalır', () => {
    const source = new VirtualActionSource<TestAction>();
    expect(source.hasPressed).toBe(false);

    source.press('dash');
    source.release('dash');
    // Mandal okunmadan sağlayıcı pasif görünürse InputManager PC'ye düşer
    // ve basımı yutar.
    expect(source.hasPressed).toBe(true);

    source.applyTo(emptyActions());
    expect(source.hasPressed).toBe(false);
  });

  it('clear() mandal dâhil her şeyi düşürür', () => {
    const source = new VirtualActionSource<TestAction>();
    source.press('fire');
    source.press('dash');
    source.release('dash');

    source.clear();
    expect(source.hasPressed).toBe(false);

    const actions = emptyActions();
    source.applyTo(actions);
    expect(actions).toEqual({ fire: false, dash: false });
  });

  it('aynı eylemi iki kez basmak tek basım sayılır', () => {
    const source = new VirtualActionSource<TestAction>();
    source.press('dash');
    source.press('dash');
    source.applyTo(emptyActions());

    source.release('dash');
    const after = emptyActions();
    source.applyTo(after);
    expect(after.dash).toBe(false);
  });
});

describe('TouchStickState — sanal eylem kaynağıyla birleşme', () => {
  it('düğme basımı stick hareketiyle AYNI karede taşınır', () => {
    // Bu, tasarımın asıl gerekçesi: InputManager karede tek sağlayıcı seçer,
    // dolayısıyla düğme ayrı bir sağlayıcı olsaydı hareket ya da dash
    // kaybolurdu.
    const source = new VirtualActionSource<TestAction>();
    const sticks = new TouchStickState<TestAction>({
      actions: ACTIONS,
      actionSource: source,
      maxRadius: 64,
    });

    sticks.onPointerDown(1, 100, 100, false);
    sticks.onPointerMove(1, 100, 40);
    source.press('dash');

    const state = sticks.getState();
    expect(state.move.length()).toBeGreaterThan(0);
    expect(state.actions.dash).toBe(true);
  });

  it('yalnızca düğmeye basılıyken de sağlayıcı aktiftir', () => {
    const source = new VirtualActionSource<TestAction>();
    const sticks = new TouchStickState<TestAction>({ actions: ACTIONS, actionSource: source });

    expect(sticks.isActive).toBe(false);
    source.press('dash');
    expect(sticks.isActive).toBe(true);
  });

  it('düğme, nişan çubuğunun aynı eylem için ürettiği false değerini ezebilir', () => {
    const source = new VirtualActionSource<TestAction>();
    const sticks = new TouchStickState<TestAction>({
      actions: ACTIONS,
      aimStickAction: 'fire',
      actionSource: source,
    });

    // Nişan çubuğuna dokunulmadı: aim-stick 'fire' üretmez.
    source.press('fire');
    expect(sticks.getState().actions.fire).toBe(true);
  });

  it('kaynak verilmezse davranış değişmez', () => {
    const sticks = new TouchStickState<TestAction>({ actions: ACTIONS });
    expect(sticks.isActive).toBe(false);
    expect(sticks.getState().actions).toEqual({ fire: false, dash: false });
  });
});
