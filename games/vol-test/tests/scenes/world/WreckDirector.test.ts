import { describe, expect, it, vi } from 'vitest';
import { ARACHNID, STRIKER, type VehicleSpec } from '@/config/vehicles';
import { WATER_VIEW } from '@/config/waterView';
import { WreckDirector } from '@/scenes/world/WreckDirector';
import { TRACK_LEFT, TRACK_RIGHT, legBit } from '@/sim/chassis/parts';

const frame = { x: 40, y: 60, hull: 0, vx: 12, vy: -8 };

function build() {
  const effects = {
    wreck: vi.fn(),
    shed: vi.fn<(spec: VehicleSpec, x: number, y: number, outward: number) => void>(),
  };
  const onWreck = vi.fn();
  const view = { setWrecked: vi.fn(), setParts: vi.fn() };
  const director = new WreckDirector(effects, onWreck);
  const subject = (id: number, alive: boolean, spec: VehicleSpec = STRIKER, parts = 0) => ({
    id,
    spec,
    vitality: { alive },
    chassis: { parts },
  });
  return { effects, onWreck, view, director, subject };
}

describe('WreckDirector: ölüm', () => {
  it('canlı araç çizilir; geçiş olmadığı sürece hiçbir şey oynamaz', () => {
    const { director, subject, view, effects } = build();
    expect(director.track(subject(1, true), view, frame)).toBe(true);
    expect(director.track(subject(1, true), view, frame)).toBe(true);
    expect(effects.wreck).not.toHaveBeenCalled();
    expect(view.setWrecked).not.toHaveBeenCalled();
    expect(view.setParts).not.toHaveBeenCalled();
  });

  it('canlıdan ölüye geçişte TEK patlama oynar, görünüm gizlenir, oyuncuya yansır', () => {
    const { director, subject, view, effects, onWreck } = build();
    director.track(subject(1, true, ARACHNID), view, frame);
    expect(director.track(subject(1, false, ARACHNID), view, frame)).toBe(false);
    expect(effects.wreck).toHaveBeenCalledOnce();
    expect(effects.wreck).toHaveBeenCalledWith(ARACHNID, 40, 60, 12, -8);
    expect(onWreck).toHaveBeenCalledWith(40, 60);
    expect(view.setWrecked).toHaveBeenCalledWith(true);
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
    expect(view.setWrecked).toHaveBeenLastCalledWith(false);
    director.track(subject(1, false), view, frame);
    expect(effects.wreck).toHaveBeenCalledTimes(2);
  });

  it('ilk görülen ölü araç patlamadan gizlenir (geç katılım)', () => {
    const { director, subject, view, effects, onWreck } = build();
    expect(director.track(subject(7, false), view, frame)).toBe(false);
    expect(view.setWrecked).toHaveBeenCalledWith(true);
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

describe('WreckDirector: kopan parçalar', () => {
  it('yeni açılan palet biti, o yanın dışına doğru bir kez savrulur ve görünüm kırık hâle geçer', () => {
    const { director, subject, view, effects } = build();
    director.track(subject(1, true), view, frame);
    director.track(subject(1, true, STRIKER, TRACK_RIGHT), view, { ...frame, hull: 0 });
    expect(effects.shed).toHaveBeenCalledOnce();
    const [spec, x, y, outward] = effects.shed.mock.calls[0];
    expect(spec).toBe(STRIKER);
    // Sağ palet gövdenin +y yanındadır, dışarı yönü de +y (π/2).
    expect(x).toBeCloseTo(frame.x);
    expect(y).toBeGreaterThan(frame.y);
    expect(outward).toBeCloseTo(Math.PI / 2);
    expect(view.setParts).toHaveBeenLastCalledWith(TRACK_RIGHT);
    // Aynı maske tekrar gelince hiçbir şey olmaz.
    director.track(subject(1, true, STRIKER, TRACK_RIGHT), view, frame);
    expect(effects.shed).toHaveBeenCalledOnce();
  });

  it('sol palet gövde dönükken de gerçek sol yana düşer', () => {
    const { director, subject, view, effects } = build();
    const turned = { ...frame, hull: Math.PI / 2 };
    director.track(subject(1, true), view, turned);
    director.track(subject(1, true, STRIKER, TRACK_LEFT), view, turned);
    const [, x, , outward] = effects.shed.mock.calls[0];
    // hull = π/2: sağ eksen -x'tir, sol palet +x yanındadır.
    expect(x).toBeGreaterThan(frame.x);
    expect(outward).toBeCloseTo(Math.PI / 2 - Math.PI / 2);
  });

  it('yürüyücü: her yeni bacak biti ayrı savrulur, onarım (bit kapanması) savrulmaz ama görünüme işlenir', () => {
    const { director, subject, view, effects } = build();
    director.track(subject(1, true, ARACHNID), view, frame);
    director.track(subject(1, true, ARACHNID, legBit(0, 0) | legBit(1, 3)), view, frame);
    expect(effects.shed).toHaveBeenCalledTimes(2);
    director.track(subject(1, true, ARACHNID, legBit(1, 3)), view, frame);
    expect(effects.shed).toHaveBeenCalledTimes(2);
    expect(view.setParts).toHaveBeenLastCalledWith(legBit(1, 3));
  });

  it('ilk görülen parçalı araç efektsiz kırık görünümle kurulur', () => {
    const { director, subject, view, effects } = build();
    director.track(subject(3, true, STRIKER, TRACK_LEFT | TRACK_RIGHT), view, frame);
    expect(effects.shed).not.toHaveBeenCalled();
    expect(view.setParts).toHaveBeenCalledWith(3);
  });

  it('ölürken kırık parça patlamada sayılmaz; yeniden doğunca temiz maske işlenir', () => {
    const { director, subject, view, effects } = build();
    director.track(subject(1, true, STRIKER, TRACK_LEFT), view, frame);
    director.track(subject(1, false, STRIKER, TRACK_LEFT), view, frame);
    director.track(subject(1, true, STRIKER, 0), view, frame);
    expect(effects.shed).not.toHaveBeenCalled();
    expect(view.setParts).toHaveBeenLastCalledWith(0);
  });
});

describe('WreckDirector: batış', () => {
  const deep = {
    depthAt: () => 0.9,
    splash: vi.fn<(x: number, y: number, radius: number) => void>(),
  };
  const shallow = { depthAt: () => 0.2, splash: vi.fn() };

  function sinking(water: { depthAt: () => number; splash: typeof deep.splash }) {
    const effects = { wreck: vi.fn(), shed: vi.fn() };
    const onWreck = vi.fn();
    const view = {
      setWrecked: vi.fn(),
      setParts: vi.fn(),
      sink: vi.fn<(progress: number) => void>(),
      setPresent: vi.fn<(present: boolean) => void>(),
    };
    const director = new WreckDirector(effects, onWreck, water);
    const subject = (alive: boolean) => ({
      id: 1,
      spec: STRIKER,
      vitality: { alive },
      chassis: { parts: 0 },
    });
    return { effects, onWreck, view, director, subject };
  }

  it('derin suda ölen araç patlamaz: halka bırakır, süre bitince sahneden kalkar', () => {
    deep.splash.mockClear();
    const { director, subject, view, effects, onWreck } = sinking(deep);
    director.track(subject(true), view, frame, 16);
    expect(director.track(subject(false), view, frame, 16)).toBe(false);
    expect(effects.wreck).not.toHaveBeenCalled();
    expect(onWreck).not.toHaveBeenCalled();
    expect(deep.splash).toHaveBeenCalledOnce();
    expect(deep.splash).toHaveBeenCalledWith(40, 60, expect.any(Number));
    expect(view.setWrecked).toHaveBeenCalledWith(true);
    let previous = 0;
    for (let ms = 0; ms < WATER_VIEW.sink.durationMs; ms += 100) {
      director.track(subject(false), view, frame, 100);
      const progress = view.sink.mock.lastCall?.[0] ?? 0;
      expect(progress).toBeGreaterThanOrEqual(previous);
      previous = progress;
    }
    expect(previous).toBe(1);
    expect(view.setPresent).toHaveBeenCalledWith(false);
    expect(view.setPresent).toHaveBeenCalledOnce();
    // Battıktan sonra tekrar çağrılar görünüme dokunmaz.
    const calls = view.sink.mock.calls.length;
    director.track(subject(false), view, frame, 100);
    expect(view.sink.mock.calls.length).toBe(calls);
  });

  it('duraklatmada (sıfır süre) batış ilerlemez', () => {
    const { director, subject, view } = sinking(deep);
    director.track(subject(true), view, frame, 16);
    director.track(subject(false), view, frame, 0);
    director.track(subject(false), view, frame, 0);
    expect(view.sink.mock.lastCall?.[0] ?? 0).toBe(0);
    expect(view.setPresent).not.toHaveBeenCalled();
  });

  it('yeniden doğan batık araç gövdesi ve görünürlüğüyle geri gelir', () => {
    const { director, subject, view } = sinking(deep);
    director.track(subject(true), view, frame, 16);
    director.track(subject(false), view, frame, WATER_VIEW.sink.durationMs);
    expect(view.setPresent).toHaveBeenLastCalledWith(false);
    expect(director.track(subject(true), view, frame, 16)).toBe(true);
    expect(view.sink).toHaveBeenLastCalledWith(0);
    expect(view.setPresent).toHaveBeenLastCalledWith(true);
    expect(view.setWrecked).toHaveBeenLastCalledWith(false);
  });

  it('sığ suda ölen araç normal patlar', () => {
    shallow.splash.mockClear();
    const { director, subject, view, effects } = sinking(shallow);
    director.track(subject(true), view, frame, 16);
    director.track(subject(false), view, frame, 16);
    expect(effects.wreck).toHaveBeenCalledOnce();
    expect(shallow.splash).not.toHaveBeenCalled();
    expect(view.sink).not.toHaveBeenCalled();
  });

  it('geç katılımda derinde ölü görülen araç hiç görünmez', () => {
    const { director, subject, view } = sinking(deep);
    director.track(subject(false), view, frame, 16);
    expect(view.setPresent).toHaveBeenCalledWith(false);
  });
});
