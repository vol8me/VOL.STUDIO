import { describe, expect, it } from 'vitest';
import { BACKDROP } from '@/config/backdrop';
import { CameraDirector, type DirectedVehicle } from '@/sim/backdrop/CameraDirector';

const CAMERA = BACKDROP.camera;

function car(id: number, team: number, x: number, y = 0, alive = true): DirectedVehicle {
  return { id, team, alive, x, y };
}

describe('CameraDirector', () => {
  it('en yakın düşman çiftinin ortasını çerçeveler ve ilk çekimde kesme istemez', () => {
    const director = new CameraDirector();
    const shot = director.update([car(1, 0, 0), car(2, 1, 400), car(3, 1, 5000)], 16);
    expect(shot.x).toBe(200);
    expect(shot.y).toBe(0);
    expect(shot.cut).toBe(false);
  });

  it('yakın çift daha çok, uzak çift daha az yakınlaşır; değer aralıkta kalır', () => {
    const near = new CameraDirector().update([car(1, 0, 0), car(2, 1, 50)], 16);
    const far = new CameraDirector().update([car(1, 0, 0), car(2, 1, CAMERA.breakRange)], 16);
    expect(near.zoom).toBeGreaterThan(far.zoom);
    expect(near.zoom).toBeLessThanOrEqual(CAMERA.zoomMax);
    expect(far.zoom).toBeGreaterThanOrEqual(CAMERA.zoomMin);
  });

  it('aynı cephedeki araçları çift saymaz; düşman yoksa kadronun ortasına bakar', () => {
    const director = new CameraDirector();
    const shot = director.update([car(1, 0, 0), car(2, 0, 600), car(3, 0, 300, 90, false)], 16);
    expect(shot.x).toBe(300);
    expect(shot.y).toBe(0);
    expect(shot.cut).toBe(false);
  });

  it('çift ölünce başka çifte keser', () => {
    const director = new CameraDirector();
    director.update([car(1, 0, 0), car(2, 1, 300), car(3, 0, 4000), car(4, 1, 4300)], 16);
    const shot = director.update(
      [car(1, 0, 0, 0, false), car(2, 1, 300), car(3, 0, 4000), car(4, 1, 4300)],
      16,
    );
    expect(shot.cut).toBe(true);
    expect(shot.x).toBe(4150);
  });

  it('en uzun tutuş dolunca başka çatışmaya geçer; süre dolana dek aynı çifti tutar', () => {
    const director = new CameraDirector();
    const field = [car(1, 0, 0), car(2, 1, 300), car(3, 0, 3000), car(4, 1, 3350)];
    director.update(field, 16);
    expect(director.update(field, CAMERA.maxHoldMs - 100).cut).toBe(false);
    const shot = director.update(field, 200);
    expect(shot.cut).toBe(true);
    expect(shot.x).toBe(3175);
  });

  it('çift kırılma mesafesinden fazla açılırsa keser', () => {
    const director = new CameraDirector();
    director.update([car(1, 0, 0), car(2, 1, 200), car(3, 0, 5000), car(4, 1, 5300)], 16);
    const shot = director.update(
      [car(1, 0, 0), car(2, 1, CAMERA.breakRange + 400), car(3, 0, 5000), car(4, 1, 5300)],
      16,
    );
    expect(shot.cut).toBe(true);
  });

  it('kimse yokken sıfır konumda kalır ve bozuk süreyi yok sayar', () => {
    const director = new CameraDirector();
    expect(director.update([], Number.NaN)).toEqual({
      x: 0,
      y: 0,
      zoom: CAMERA.zoomMax,
      cut: false,
    });
  });
});
