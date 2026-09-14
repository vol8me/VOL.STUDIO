import { describe, expect, it, vi } from 'vitest';
import { VoidDeathRenderer } from '@/runtime/render/VoidDeathRenderer';
import type { VoidCrossing } from '@/runtime/sim/VoidSink';

function harness(reducedMotion = false) {
  const graphics = {
    clear: vi.fn(),
    fillStyle: vi.fn(),
    fillCircle: vi.fn(),
    fillEllipse: vi.fn(),
    save: vi.fn(),
    translateCanvas: vi.fn(),
    rotateCanvas: vi.fn(),
    restore: vi.fn(),
    setDepth: vi.fn(),
    destroy: vi.fn(),
  };
  graphics.setDepth.mockReturnValue(graphics);
  const scene = { add: { graphics: vi.fn(() => graphics) } };
  const renderer = new VoidDeathRenderer(
    scene as never,
    { durationMs: 100, maxGhosts: 4, stretchMax: 2, radiusUnits: 4.5, drainColor: 0x000000 },
    () => reducedMotion,
  );
  return { renderer, graphics };
}

function crossing(x = 100, y = 200, type = 0): VoidCrossing {
  return { stableId: 1, x, y, type, normalX: 1, normalY: 0 };
}

describe('VoidDeathRenderer', () => {
  it('geçersiz yapılandırmayı kurulumda reddeder', () => {
    const scene = { add: { graphics: vi.fn(() => ({ setDepth: vi.fn(), destroy: vi.fn() })) } };
    expect(
      () =>
        new VoidDeathRenderer(scene as never, {
          durationMs: 0,
          maxGhosts: 4,
          stretchMax: 2,
          radiusUnits: 4.5,
          drainColor: 0,
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new VoidDeathRenderer(scene as never, {
          durationMs: 100,
          maxGhosts: 0,
          stretchMax: 2,
          radiusUnits: 4.5,
          drainColor: 0,
        }),
    ).toThrow(RangeError);
  });

  it('geçişleri alır ve hayalet sayısını döndürür', () => {
    const { renderer } = harness();
    renderer.push([crossing()], 0);
    expect(renderer.ghostCount).toBe(1);
  });

  it('hayalet tavanını aşınca en eski hayaletleri düşürür', () => {
    const { renderer } = harness();
    for (let i = 0; i < 6; i++) renderer.push([crossing()], i * 200);
    expect(renderer.ghostCount).toBe(4);
  });

  it('reduced-motion altında düz sönümle çizer', () => {
    const { renderer, graphics } = harness(true);
    renderer.push([crossing()], 0);
    renderer.render(50);
    expect(graphics.fillCircle).toHaveBeenCalled();
    expect(graphics.fillEllipse).not.toHaveBeenCalled();
  });

  it('normal kipte stretch ve fillEllipse ile çizer', () => {
    const { renderer, graphics } = harness(false);
    renderer.push([crossing()], 0);
    renderer.render(50);
    expect(graphics.fillEllipse).toHaveBeenCalled();
    expect(graphics.save).toHaveBeenCalled();
    expect(graphics.restore).toHaveBeenCalled();
  });

  it('süresi dolan hayaletleri temizler', () => {
    const { renderer } = harness();
    renderer.push([crossing()], 0);
    renderer.render(200);
    expect(renderer.ghostCount).toBe(0);
  });

  it('yok edilmişken push ve render sessizdir', () => {
    const { renderer, graphics } = harness();
    renderer.destroy();
    renderer.push([crossing()], 0);
    renderer.render(50);
    expect(graphics.clear).not.toHaveBeenCalled();
  });

  it('idempotent kapanır', () => {
    const { renderer, graphics } = harness();
    renderer.destroy();
    renderer.destroy();
    expect(graphics.destroy).toHaveBeenCalledOnce();
  });
});
