import { describe, expect, it, vi } from 'vitest';
import { ARACHNID, STRIKER, type VehicleSpec } from '@/config/vehicles';
import { WreckDirector } from '@/scenes/world/WreckDirector';

const frame = { x: 40, y: 60, vx: 12, vy: -8 };

function build() {
  const effects = { wreck: vi.fn() };
  const onWreck = vi.fn();
  const view = { setPresent: vi.fn() };
  const director = new WreckDirector(effects, onWreck);
  const subject = (id: number, alive: boolean, spec: VehicleSpec = STRIKER) => ({
    id,
    spec,
    vitality: { alive },
  });
  return { effects, onWreck, view, director, subject };
}

describe('WreckDirector', () => {
  it('canlı araç çizilir; geçiş olmadığı sürece hiçbir şey oynamaz', () => {
    const { director, subject, view, effects } = build();
    expect(director.track(subject(1, true), view, frame)).toBe(true);
    expect(director.track(subject(1, true), view, frame)).toBe(true);
    expect(effects.wreck).not.toHaveBeenCalled();
    expect(view.setPresent).not.toHaveBeenCalled();
  });

  it('canlıdan ölüye geçişte TEK patlama oynar, görünüm gizlenir, oyuncuya yansır', () => {
    const { director, subject, view, effects, onWreck } = build();
    director.track(subject(1, true, ARACHNID), view, frame);
    expect(director.track(subject(1, false, ARACHNID), view, frame)).toBe(false);
    expect(effects.wreck).toHaveBeenCalledOnce();
    expect(effects.wreck).toHaveBeenCalledWith(ARACHNID, 40, 60, 12, -8);
    expect(onWreck).toHaveBeenCalledWith(40, 60);
    expect(view.setPresent).toHaveBeenCalledWith(false);
    // Ölü kaldığı sürece yeniden patlamaz.
    director.track(subject(1, false, ARACHNID), view, frame);
    director.track(subject(1, false, ARACHNID), view, frame);
    expect(effects.wreck).toHaveBeenCalledOnce();
  });

  it('yeniden doğunca görünüm geri gelir; ikinci ölüm yeniden patlar', () => {
    const { director, subject, view, effects } = build();
    director.track(subject(1, true), view, frame);
    director.track(subject(1, false), view, frame);
    expect(director.track(subject(1, true), view, frame)).toBe(true);
    expect(view.setPresent).toHaveBeenLastCalledWith(true);
    director.track(subject(1, false), view, frame);
    expect(effects.wreck).toHaveBeenCalledTimes(2);
  });

  it('ilk görülen ölü araç patlamadan gizlenir (geç katılım)', () => {
    const { director, subject, view, effects, onWreck } = build();
    expect(director.track(subject(7, false), view, frame)).toBe(false);
    expect(view.setPresent).toHaveBeenCalledWith(false);
    expect(effects.wreck).not.toHaveBeenCalled();
    expect(onWreck).not.toHaveBeenCalled();
  });

  it('görünümü olmayan araç da geçişi izler; forget izi siler', () => {
    const { director, subject, effects } = build();
    director.track(subject(1, true), undefined, frame);
    director.track(subject(1, false), undefined, frame);
    expect(effects.wreck).toHaveBeenCalledOnce();
    director.forget(1);
    // Silinen kimlik yeniden "ilk görülen" olur: ölü gelirse patlamaz.
    director.track(subject(1, false), undefined, frame);
    expect(effects.wreck).toHaveBeenCalledOnce();
  });
});
