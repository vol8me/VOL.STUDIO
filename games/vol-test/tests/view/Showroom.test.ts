import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { MENU } from '@/config/menu';
import { ARACHNID, GOLIATH, STRIKER } from '@/config/vehicles';
import { Showroom } from '@/view/Showroom';
import { fakeObject, fakeScene } from '../support/fakeScene';

const SHOWROOM = MENU.showroom;

function build(width = 1280, height = 800) {
  const fake = fakeScene();
  const camera = fakeObject('camera');
  Object.assign(camera, { width, height, setZoom: vi.fn(), centerOn: vi.fn() });
  const scene = {
    add: fake.add,
    cameras: { main: camera },
    textures: { exists: () => true },
    game: { registry: { get: () => undefined } },
  } as unknown as Phaser.Scene;
  const showroom = new Showroom(scene, STRIKER);
  const centre = (): [number, number] => {
    const calls = (camera.centerOn as ReturnType<typeof vi.fn>).mock.calls;
    return calls[calls.length - 1] as [number, number];
  };
  return { fake, showroom, camera, centre };
}

describe('Showroom', () => {
  it('zemini bir kez çizer ve aracı dönen tablada gösterir', () => {
    const { fake, showroom } = build();
    const graphics = fake.created.filter((object) => object.kind === 'graphics');
    expect(graphics.length).toBeGreaterThan(0);
    showroom.update(1000);
    const first = fake.created.filter((object) => object.kind === 'container').length;
    showroom.update(1000);
    expect(fake.created.filter((object) => object.kind === 'container')).toHaveLength(first);
  });

  it('panel yoksa aracı ekranın ortasına, yan şerit varsa kalan alanın ortasına koyar', () => {
    const { showroom, camera, centre } = build();
    showroom.update(16);
    expect(camera.setZoom).toHaveBeenLastCalledWith(SHOWROOM.zoom);
    expect(centre()[0]).toBeCloseTo(0);
    expect(centre()[1]).toBeCloseTo(0);
    // 440 px'lik şerit: kalan alanın ortası (440 + 1280) / 2 = 860; ekran ortası 640.
    showroom.update(16, { top: 0, right: 440, width: 440 });
    expect(centre()[0]).toBeCloseTo((640 - 860) / SHOWROOM.zoom);
    expect(camera.setZoom).toHaveBeenLastCalledWith(SHOWROOM.zoom);
    expect(centre()[1]).toBeCloseTo(0);
  });

  it('ekranı kaplayan alt levhada aracı panelin üstünde ortalar', () => {
    const { showroom, camera, centre } = build(600, 900);
    showroom.update(16, { top: 500, right: 600, width: 600 });
    const zoom = 500 / SHOWROOM.extent;
    expect(camera.setZoom).toHaveBeenLastCalledWith(zoom);
    expect(centre()[0]).toBeCloseTo(0);
    // Boş alan 0–500 px; ortası 250, ekran ortası 450.
    expect(centre()[1]).toBeCloseTo((450 - 250) / zoom);
  });

  it('boş alan araca dar gelirse yakınlaştırma küçülür ve araç kırpılmaz', () => {
    const { showroom, camera, centre } = build(390, 780);
    showroom.update(16, { top: 296, right: 390, width: 390 });
    const zoom = 296 / SHOWROOM.extent;
    expect(zoom).toBeLessThan(SHOWROOM.zoom);
    expect(camera.setZoom).toHaveBeenLastCalledWith(zoom);
    expect(centre()[1]).toBeCloseTo((390 - 148) / zoom);
  });

  it('bacak açıklığı geniş yürüyücü daha çok küçülür; varsayılan araç değişmez', () => {
    const { showroom, camera } = build(390, 780);
    showroom.update(16, { top: 296, right: 390, width: 390 });
    expect(camera.setZoom).toHaveBeenLastCalledWith(296 / SHOWROOM.extent);
    showroom.setVehicle(GOLIATH);
    showroom.update(16, { top: 296, right: 390, width: 390 });
    expect(SHOWROOM.vehicleExtent.goliath).toBeGreaterThan(SHOWROOM.extent);
    expect(camera.setZoom).toHaveBeenLastCalledWith(296 / SHOWROOM.vehicleExtent.goliath!);
    showroom.setVehicle(ARACHNID);
    showroom.update(16, { top: 296, right: 390, width: 390 });
    expect(camera.setZoom).toHaveBeenLastCalledWith(296 / SHOWROOM.extent);
  });

  it('paletli araç tablada döner; bacaklı yürüyücü dönmez (ayaklar dolaşmaz)', () => {
    const { showroom } = build();
    showroom.update(2000);
    expect(showroom.facing).toBeGreaterThan(0);
    showroom.setVehicle(ARACHNID);
    showroom.update(2000);
    expect(showroom.facing).toBe(0);
    showroom.setVehicle(STRIKER);
    showroom.update(16);
    expect(showroom.facing).toBeGreaterThan(0);
  });

  it('aracı değiştirir, bozuk kare süresini yok sayar ve kapanışta her şeyi söker', () => {
    const { fake, showroom } = build();
    const before = fake.created.length;
    showroom.setVehicle(ARACHNID);
    expect(fake.created.length).toBeGreaterThan(before);
    expect(() => showroom.update(Number.NaN)).not.toThrow();
    expect(() => showroom.update(-5)).not.toThrow();
    showroom.destroy();
    const destroyed = fake.created.filter((object) =>
      object.calls.some(([name]) => name === 'destroy'),
    );
    expect(destroyed.length).toBeGreaterThan(0);
  });
});
