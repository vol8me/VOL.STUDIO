import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';
import type * as CoreModule from '@volstudio/core';
import { SimulationClock } from '@volstudio/core';
import { PlayerControls } from '@/scenes/world/PlayerControls';
import { type TestAction } from '@/input/bindings';
import { CONTROLS } from '@/config/controls';
import { simulation } from '../../support/sim';

const pads = vi.hoisted(() => ({ values: [] as Array<Gamepad | null> }));
vi.mock('@volstudio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof CoreModule>();
  class TestInputManager extends actual.InputManager<TestAction> {
    constructor(scene: Phaser.Scene, options: CoreModule.InputManagerOptions<TestAction>) {
      super(scene, { ...options, gamepad: { ...options.gamepad, getGamepads: () => pads.values } });
    }
  }
  return { ...actual, InputManager: TestInputManager };
});

const active: PlayerControls[] = [];
afterEach(() => {
  for (const control of active.splice(0)) control.destroy();
  pads.values = [];
});

function mount() {
  const keys = new Map<number, { isDown: boolean; reset(): void }>();
  const events = new Map<string, (event: KeyboardEvent) => void>();
  const pointer = {
    x: 2000,
    y: 1000,
    isDown: false,
    wasTouch: false,
    left: false,
    leftButtonDown() {
      return this.left;
    },
  };
  const scene = {
    sys: { events: new Phaser.Events.EventEmitter(), queueDepthSort() {} },
    add: { existing() {} },
    input: {
      on(name: string, handler: (event: KeyboardEvent) => void) {
        events.set(name, handler);
      },
      off(name: string) {
        events.delete(name);
      },
      activePointer: pointer,
      keyboard: {
        addKey(code: number) {
          const key = {
            isDown: false,
            reset() {
              this.isDown = false;
            },
          };
          keys.set(code, key);
          return key;
        },
        on(name: string, listener: (event: KeyboardEvent) => void) {
          events.set(name, listener);
        },
        off(name: string) {
          events.delete(name);
        },
      },
    },
    cameras: { main: { getWorldPoint: (x: number, y: number) => ({ x, y }) } },
  };
  const control = new PlayerControls(scene as unknown as Phaser.Scene);
  active.push(control);
  return {
    control,
    keys,
    pointer,
    press: (code: number) => events.get('keydown')?.({ keyCode: code } as KeyboardEvent),
  };
}

describe('PlayerControls — renderdan sabit ticke', () => {
  it('iki sıfır tick karesi arasında bırakılan dış bölge dokunuşunu nişanıyla bir kez taşır', () => {
    const { control } = mount();
    control.stickSource.set('aim', 1, 0);
    control.read(1000, 1000, 3);
    control.stickSource.release('aim');
    control.read(1000, 1000, 3);
    expect(control.step(16)).toMatchObject({ fire: true, aimX: 1, aimY: 0 });
    expect(control.step(16).fire).toBe(false);
  });
  it('iç bölgeye kısa dokunuş atışa yükseltilmez', () => {
    const { control } = mount();
    control.stickSource.set('aim', 0.2, 0);
    control.read(1000, 1000, 3);
    control.stickSource.release('aim');
    control.read(1000, 1000, 3);
    expect(control.step(16).fire).toBe(false);
  });
  it('sanal basış sıfır tick karelerinden sonra ilk tickte bir kez koşar', () => {
    const { control } = mount();
    control.actionSource.press('boost');
    control.actionSource.release('boost');
    control.read(1000, 1000, 3);
    control.read(1000, 1000, 3);
    expect(control.step(16).boost).toBe(true);
    expect(control.step(16).boost).toBe(false);
  });

  it('PC kısa basışı taşır, basılı tuş catch-up içinde düzey kalır', () => {
    const { control, press, keys } = mount();
    press(16);
    control.read(1000, 1000, 2);
    control.read(1000, 1000, 2);
    expect(control.step(16).boost).toBe(true);
    expect(control.step(16).boost).toBe(false);
    keys.get(16)!.isDown = true;
    control.read(1000, 1000, 32);
    expect(control.step(16).boost).toBe(true);
    expect(control.step(16).boost).toBe(true);
  });

  it('pause kenarı sıfır tick karelerinde işler; frame okumaları smoothing ilerletmez', () => {
    const { control, press, keys } = mount();
    keys.get(68)!.isDown = true;
    press(27);
    control.read(1000, 1000, 3);
    expect(control.pressed('pause')).toBe(true);
    const before = control.step(16).moveX;
    for (let frame = 0; frame < 20; frame++) control.read(1000, 1000, 3);
    expect(control.command.moveX).toBe(before);
  });

  it.each(['pc', 'mouse', 'touch', 'gamepad'] as const)(
    '%s held fire/boost dönüşte nötr ister',
    (kind) => {
      const { control, keys, pointer } = mount();
      const buttons = Array.from({ length: 17 }, () => ({
        pressed: false,
        touched: false,
        value: 0,
      }));
      if (kind === 'gamepad')
        pads.values = [
          {
            id: 'standard',
            index: 0,
            connected: true,
            mapping: 'standard',
            buttons,
            axes: [0, 0, 1, 0],
            timestamp: 0,
          } as unknown as Gamepad,
        ];
      const set = (held: boolean) => {
        if (kind === 'pc') keys.get(16)!.isDown = held;
        if (kind === 'mouse') pointer.left = held;
        if (kind === 'touch') {
          if (held) control.stickSource.set('aim', 1, 0);
          else control.stickSource.release('aim');
        }
        if (kind === 'gamepad') {
          buttons[6].pressed = held;
          buttons[7].pressed = held;
          buttons[6].value = held ? 1 : 0;
          buttons[7].value = held ? 1 : 0;
        }
      };
      set(true);
      control.read(1000, 1000, 16);
      control.step(16);
      control.release();
      set(true);
      control.read(1000, 1000, 16);
      expect(control.step(16)).toMatchObject({ fire: false, boost: false });
      set(false);
      control.read(1000, 1000, 16);
      control.step(16);
      set(true);
      control.read(1000, 1000, 16);
      const command = control.step(16);
      expect(kind === 'pc' ? command.boost : command.fire).toBe(true);
    },
  );

  describe('nişan etkinliği (lazerin görünme koşulu)', () => {
    it('farede imleç hiç oynamadıysa lazer yanmaz; hareket ve basış yakar', () => {
      const { control, pointer } = mount();
      control.read(1000, 1000, 16);
      expect(control.aiming).toBe(false);
      control.read(1000, 1000, 16);
      expect(control.aiming).toBe(false);
      pointer.x += 40;
      control.read(1000, 1000, 16);
      expect(control.aiming).toBe(true);
    });

    it('fare durunca lazer bekleme süresince yanık kalır, sonra söner', () => {
      const { control, pointer } = mount();
      control.read(1000, 1000, 16);
      pointer.y += 30;
      control.read(1000, 1000, 16);
      expect(control.aiming).toBe(true);
      for (let elapsed = 0; elapsed < CONTROLS.aimHoldMs - 40; elapsed += 20)
        control.read(1000, 1000, 20);
      expect(control.aiming).toBe(true);
      for (let elapsed = 0; elapsed < 100; elapsed += 20) control.read(1000, 1000, 20);
      expect(control.aiming).toBe(false);
    });

    it('donanım titremesi altındaki hareket lazeri yakmaz', () => {
      const { control, pointer } = mount();
      control.read(1000, 1000, 16);
      for (let frame = 0; frame < 20; frame++) {
        pointer.x += frame % 2 === 0 ? 0.5 : -0.5;
        control.read(1000, 1000, 16);
      }
      expect(control.aiming).toBe(false);
    });

    it('sol düğme basılıyken (ateş) imleç durağan olsa da lazer yanar', () => {
      const { control, pointer } = mount();
      control.read(1000, 1000, 16);
      pointer.left = true;
      pointer.isDown = true;
      for (let frame = 0; frame < 120; frame++) control.read(1000, 1000, 16);
      expect(control.aiming).toBe(true);
    });

    it('dokunmatikte nişan çubuğu tutulurken yanar, bırakılınca söner (fare süresi uygulanmaz)', () => {
      const { control } = mount();
      control.stickSource.set('aim', 0.3, 0);
      control.read(1000, 1000, 16);
      expect(control.aiming).toBe(true);
      control.stickSource.release('aim');
      for (let frame = 0; frame < 3; frame++) {
        control.read(1000, 1000, 16);
        control.step(16);
      }
      expect(control.aiming).toBe(false);
    });

    it('duraklatma geçişi (release) etkinliği sıfırlar', () => {
      const { control, pointer } = mount();
      control.read(1000, 1000, 16);
      pointer.x += 50;
      control.read(1000, 1000, 16);
      expect(control.aiming).toBe(true);
      control.release();
      expect(control.aiming).toBe(false);
    });
  });

  it('laboratuvar girdisi oyuncunun komut yolundan geçer ve bırakılınca oyuncuya döner', () => {
    const { control, keys } = mount();
    control.read(0, 0, 16);
    expect(control.step(16).fire).toBe(false);
    control.setLabInput({ fire: true, aimX: 1 });
    control.read(0, 0, 16);
    const held = control.step(16);
    expect(held.fire).toBe(true);
    expect(held.aimX).toBe(1);
    // Oyuncunun tuşu laboratuvar alanını ezmez, laboratuvarın vermediği alan oyuncudan gelir.
    keys.get(68)!.isDown = true;
    control.setLabInput({ brake: true });
    control.read(0, 0, 16);
    const merged = control.step(16);
    expect(merged.fire).toBe(true);
    expect(merged.brake).toBe(true);
    control.setLabInput(null);
    control.read(0, 0, 16);
    const back = control.step(16);
    expect(back.fire).toBe(false);
    expect(back.brake).toBe(false);
  });

  it('aynı tick ham girdisi 30/60/90/144Hz ve jitterde gerçek simülasyonu aynı yere getirir', () => {
    function run(frameDeltas: number[]) {
      const { control, keys } = mount();
      const sim = simulation();
      const clock = new SimulationClock({
        fixedStepMs: 16,
        maxStepsPerFrame: 8,
        partialStep: 'defer',
      });
      const commands: Array<[number, number]> = [];
      let renderMs = 0;
      let frameIndex = 0;
      for (const [segment, direction] of [68, 87, 65].entries()) {
        for (const code of [68, 87, 65]) keys.get(code)!.isDown = code === direction;
        const end = (segment + 1) * 320;
        while (renderMs < end - 1e-9) {
          const delta = Math.min(frameDeltas[frameIndex++ % frameDeltas.length], end - renderMs);
          control.read(sim.player.chassis.x, sim.player.chassis.y, delta);
          clock.advance(delta, (stepMs) => {
            const command = control.step(stepMs);
            commands.push([command.moveX, command.moveY]);
            sim.step(() => command, stepMs);
          });
          renderMs += delta;
        }
        clock.advance(1e-9, (stepMs) => {
          const command = control.step(stepMs);
          commands.push([command.moveX, command.moveY]);
          sim.step(() => command, stepMs);
        });
      }
      return { commands, x: sim.player.chassis.x, y: sim.player.chassis.y, timeMs: sim.timeMs };
    }
    const baseline = run([1000 / 30]);
    expect(baseline.commands).toHaveLength(60);
    for (const deltas of [[1000 / 60], [1000 / 90], [1000 / 144], [3, 21, 6, 14, 36]])
      expect(run(deltas)).toEqual(baseline);
  });
});
