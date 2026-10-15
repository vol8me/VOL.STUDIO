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

  it('panel yoksa aracı ekranın ortasına, sağ şerit varsa solda kalan alanın ortasına koyar', () => {
    const { showroom, camera, centre } = build();
    showroom.update(16);
    expect(camera.setZoom).toHaveBeenLastCalledWith(SHOWROOM.zoom);
    expect(centre()[0]).toBeCloseTo(0);
    expect(centre()[1]).toBeCloseTo(0);
    // 440 px'lik sağ şerit (840–1280): boş alan solda 0–840, ortası 420; ekran ortası 640.
    showroom.update(16, { top: 0, left: 840, right: 1280, width: 440 });
    expect(centre()[0]).toBeCloseTo((640 - 420) / SHOWROOM.zoom);
    expect(camera.setZoom).toHaveBeenLastCalledWith(SHOWROOM.zoom);
    expect(centre()[1]).toBeCloseTo(0);
  });

  it('ekranı kaplayan alt levhada aracı panelin üstünde ortalar', () => {
    const { showroom, camera, centre } = build(600, 900);
    showroom.update(16, { top: 500, left: 0, right: 600, width: 600 });
    const zoom = 500 / SHOWROOM.extent;
    expect(camera.setZoom).toHaveBeenLastCalledWith(zoom);
    expect(centre()[0]).toBeCloseTo(0);
    // Boş alan 0–500 px; ortası 250, ekran ortası 450.
    expect(centre()[1]).toBeCloseTo((450 - 250) / zoom);
  });

  it('boş alan araca dar gelirse yakınlaştırma küçülür ve araç kırpılmaz', () => {
    const { showroom, camera, centre } = build(390, 780);
    showroom.update(16, { top: 296, left: 0, right: 390, width: 390 });
    const zoom = 296 / SHOWROOM.extent;
    expect(zoom).toBeLessThan(SHOWROOM.zoom);
    expect(camera.setZoom).toHaveBeenLastCalledWith(zoom);
    expect(centre()[1]).toBeCloseTo((390 - 148) / zoom);
  });

  it('bacak açıklığı geniş yürüyücü daha çok küçülür; varsayılan araç değişmez', () => {
    const { showroom, camera } = build(390, 780);
    showroom.update(16, { top: 296, left: 0, right: 390, width: 390 });
    expect(camera.setZoom).toHaveBeenLastCalledWith(296 / SHOWROOM.extent);
    showroom.setVehicle(GOLIATH);
    showroom.update(16, { top: 296, left: 0, right: 390, width: 390 });
    expect(SHOWROOM.vehicleExtent.goliath).toBeGreaterThan(SHOWROOM.extent);
    expect(camera.setZoom).toHaveBeenLastCalledWith(296 / SHOWROOM.vehicleExtent.goliath!);
    showroom.setVehicle(ARACHNID);
    showroom.update(16, { top: 296, left: 0, right: 390, width: 390 });
    expect(camera.setZoom).toHaveBeenLastCalledWith(296 / SHOWROOM.extent);
  });

  it('sol şerit de desteklenir: boş alan panelin sağında kalır', () => {
    const { showroom, centre } = build();
    showroom.update(16, { top: 0, left: 0, right: 440, width: 440 });
    // Boş alan 440–1280, ortası 860; ekran ortası 640.
    expect(centre()[0]).toBeCloseTo((640 - 860) / SHOWROOM.zoom);
    expect(showroom.freeArea).toEqual({ x: 440, y: 0, width: 840, height: 800 });
  });

  it('zemin kipi: ızgaralı düzlem ya da saydam zeminde gölge; aynı kip yeniden çizilmez', () => {
    const { fake, showroom } = build();
    const ground = fake.created.find((object) => object.kind === 'graphics')!;
    const clears = (): number => ground.calls.filter(([name]) => name === 'clear').length;
    const before = clears();
    showroom.setGround('plane');
    expect(clears()).toBe(before);
    showroom.setGround('disc');
    expect(clears()).toBe(before + 1);
    expect(ground.calls.some(([name]) => name === 'fillCircle')).toBe(true);
    expect(ground.calls.some(([name]) => name === 'strokeCircle')).toBe(true);
  });

  it('tabla saati taşınabilir: aynı saat aynı açıyı verir, bozuk değer yok sayılır', () => {
    const { showroom } = build();
    showroom.update(2000);
    const clock = showroom.clockMs;
    expect(clock).toBe(2000);
    const other = build();
    other.showroom.clockMs = clock;
    other.showroom.clockMs = Number.NaN;
    other.showroom.clockMs = -5;
    other.showroom.update(0);
    expect(other.showroom.facing).toBeCloseTo(showroom.facing);
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
